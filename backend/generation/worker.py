"""Generation worker: template + topic -> rendered MP4.

Entry: ``process_clip_generation(job_id)``. Called from main.py as a background
task after ``POST /generate`` inserts a ``jobs`` row with ``kind='generate'``
and links a pre-created ``clips`` row via the ``generation_job_id`` column.

Pipeline:
    load context -> script -> voices+tts -> bg -> timeline ->
    render+verify+refine loop -> upload -> update clip -> cleanup voices

Serialized per process via ``_JOB_SEMAPHORE`` (shared with the deconstruction
worker — we don't want demucs/whisper *and* a Remotion render both running).
"""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from events import emit
from storage import get_storage
from supabase_client import get_supabase
# Reuse the deconstruction worker's primitives — they're identical for us.
from worker import (
    _JOB_SEMAPHORE,
    _emit_capped,
    _get_job_status,
    _raise_if_cancelled,
    _retry,
    _update_clip,
    _update_job,
    _update_job_if_running,
)

from .bg_footage import pick_bg_footage
from .eleven_client import ElevenClient
from .gemini_client import GeminiClient
from .loop import verify_refine_loop
from .render import render_timeline
from .script import generate_script
from .timeline import build_timeline
from .types import (
    EventType,
    GenerationContext,
    RenderResult,
    Stage,
    TimelineSpec,
    VoiceAssets,
)
from .voice import clone_voices, synthesize_turns

log = logging.getLogger(__name__)

_GEN_SCRATCH_ROOT = Path("tmp/gen")


# ── Cancellation ────────────────────────────────────────────────────────────

class _Cancelled(Exception):
    """Raised when the job has been flipped to status='cancelled' out of band."""


def _check_cancelled(job_id: str) -> None:
    if _get_job_status(job_id) == "cancelled":
        raise _Cancelled()


# ── Context assembly ────────────────────────────────────────────────────────

def _load_context(job_id: str) -> GenerationContext:
    """Pull the job + clip + template + source job and bundle into a GenerationContext."""
    sb = get_supabase()

    job = sb.table("jobs").select("*").eq("id", job_id).maybe_single().execute().data
    if not job:
        raise RuntimeError(f"generation job {job_id} not found")
    if job.get("kind") != "generate":
        raise RuntimeError(f"job {job_id} is kind={job.get('kind')!r}, expected 'generate'")

    clip_id = job.get("clip_id")
    if not clip_id:
        raise RuntimeError(f"generation job {job_id} has no clip_id")

    clip = sb.table("clips").select("*").eq("id", clip_id).maybe_single().execute().data
    if not clip:
        raise RuntimeError(f"clip {clip_id} referenced by job {job_id} does not exist")

    template_id = clip.get("template_id")
    if not template_id:
        raise RuntimeError(f"clip {clip_id} has no template_id — cannot generate")

    tpl = (
        sb.table("templates").select("*").eq("id", template_id).maybe_single().execute().data
    )
    if not tpl:
        raise RuntimeError(f"template {template_id} not found")

    # style_dna is required — this is the whole reason for the generation.
    style_dna = tpl.get("style_dna")
    if not style_dna:
        raise RuntimeError(
            f"template {template_id} has no style_dna — re-deconstruct the source"
        )

    # The source job holds the voice samples (we need its artifact_prefix +
    # artifacts.voices map). Without them we can't clone voices.
    source_job_id = tpl.get("source_job_id")
    if not source_job_id:
        raise RuntimeError(f"template {template_id} has no source_job_id")

    src_job = (
        sb.table("jobs")
        .select("id, artifact_prefix, artifacts")
        .eq("id", source_job_id)
        .maybe_single()
        .execute()
        .data
    )
    if not src_job:
        raise RuntimeError(f"source job {source_job_id} not found")

    src_prefix = src_job.get("artifact_prefix") or source_job_id
    artifacts = src_job.get("artifacts") or {}
    voices_map: dict[str, str] = {}
    raw_voices = artifacts.get("voices") if isinstance(artifacts, dict) else None
    if isinstance(raw_voices, dict):
        for speaker, key in raw_voices.items():
            if isinstance(key, str):
                voices_map[speaker] = key
    if not voices_map:
        raise RuntimeError(
            f"source job {source_job_id} has no voice samples — "
            "the template cannot drive voice cloning"
        )

    topic = job.get("clip_context") or clip.get("title") or "untitled"
    target_duration_s = clip.get("duration_s")
    if target_duration_s is None:
        target_duration_s = tpl.get("duration_s")

    scratch = _GEN_SCRATCH_ROOT / clip_id
    scratch.mkdir(parents=True, exist_ok=True)
    storage_prefix = f"generation/{clip_id}"

    return GenerationContext(
        job_id=job_id,
        clip_id=clip_id,
        template_id=template_id,
        user_id=job.get("user_id") or clip.get("user_id"),
        topic=str(topic),
        target_duration_s=float(target_duration_s) if target_duration_s else None,
        style_dna=style_dna,
        video_analysis=tpl.get("video_analysis") or {},
        sfx_manifest=tpl.get("sfx_manifest"),
        source_artifact_prefix=src_prefix,
        voice_sample_keys=voices_map,
        scratch=scratch,
        storage_prefix=storage_prefix,
    )


# ── Event plumbing ──────────────────────────────────────────────────────────

def _make_emitter(job_id: str):
    """Build the emit_event callback passed into each stage. Caps events at the
    same limit the deconstruction worker uses (via _emit_capped)."""
    def emit_event(
        event_type: str,
        *,
        stage: Optional[str] = None,
        pct: Optional[int] = None,
        message: Optional[str] = None,
        data: Optional[dict[str, Any]] = None,
    ) -> None:
        _emit_capped(
            job_id,
            event_type,
            stage=stage,
            pct=pct,
            message=message,
            data=data,
        )

    return emit_event


# ── Upload + finalize ───────────────────────────────────────────────────────

def _upload_final(
    ctx: GenerationContext,
    *,
    render: RenderResult,
    timeline: TimelineSpec,
    voices: VoiceAssets,
    emit_event,
) -> dict[str, str]:
    """Push the final MP4 + script + timeline JSON to Storage. Returns the
    artifacts dict that'll be written onto the clip row."""
    storage = get_storage()
    prefix = ctx.storage_prefix
    artifacts: dict[str, str] = {}

    emit_event(
        EventType.UPLOAD_DONE,
        stage=Stage.UPLOAD,
        pct=95,
        message="Uploading video…",
    )

    video_key = f"{prefix}/clip.mp4"
    storage.put_file(render.local_path, video_key)
    artifacts["video"] = video_key

    script_path = ctx.scratch / "script.json"
    if script_path.exists():
        key = f"{prefix}/script.json"
        storage.put_file(script_path, key)
        artifacts["script"] = key

    timeline_path = ctx.scratch / "remotion_input" / "timeline.json"
    if timeline_path.exists():
        key = f"{prefix}/timeline.json"
        storage.put_file(timeline_path, key)
        artifacts["timeline"] = key

    # Voice IDs travel as JSON alongside the clip so cleanup can find them on
    # re-run / manual inspection.
    voice_ids_path = ctx.scratch / "voice_ids.json"
    with open(voice_ids_path, "w", encoding="utf-8") as f:
        json.dump(voices.voice_ids, f)
    key = f"{prefix}/voice_ids.json"
    storage.put_file(voice_ids_path, key)
    artifacts["voice_ids_snapshot"] = key

    return artifacts


def _cleanup_voices(voices: VoiceAssets, eleven: ElevenClient) -> None:
    """Best-effort delete of cloned voices. Swallows individual failures —
    the worst case is a slot leak on the ElevenLabs side."""
    for speaker, voice_id in voices.voice_ids.items():
        try:
            eleven.delete_voice(voice_id)
        except Exception as e:  # noqa: BLE001
            log.warning("voice cleanup: %s (%s) — %s", speaker, voice_id, e)


def _cleanup_scratch(ctx: GenerationContext) -> None:
    try:
        shutil.rmtree(ctx.scratch, ignore_errors=True)
    except Exception as e:  # noqa: BLE001
        log.warning("scratch cleanup failed for %s: %s", ctx.scratch, e)


# ── Core pipeline ───────────────────────────────────────────────────────────

async def _run_pipeline(job_id: str) -> None:
    emit_event = _make_emitter(job_id)

    emit_event(
        EventType.STARTED,
        stage="input",
        pct=1,
        message="Loading template + voice assets",
    )

    # Flip job to running so the cancel-poll semantics match the
    # deconstruction worker. If this update doesn't land, someone beat us to
    # it (cancel, manual intervention) — bail.
    applied = _update_job_if_running_or_queued(job_id, status="running")
    if not applied:
        log.info("gen worker: job %s already moved, skipping", job_id)
        return

    _check_cancelled(job_id)
    ctx = _load_context(job_id)
    # Mark the clip as 'generating' (it should already be, but be defensive).
    _update_clip(ctx.clip_id, status="generating", generation_job_id=job_id)

    gemini = GeminiClient()
    eleven = ElevenClient()
    voices: VoiceAssets | None = None

    try:
        # Stage 1: script
        _check_cancelled(job_id)
        script = await asyncio.to_thread(
            generate_script, ctx, gemini=gemini, emit_event=emit_event
        )
        log.info("gen %s: script has %d turns", job_id, len(script.turns))

        # Stage 2+3: voices + TTS
        _check_cancelled(job_id)
        voices = await asyncio.to_thread(
            clone_voices, ctx, eleven=eleven, emit_event=emit_event
        )
        # Stash voice_ids on the clip immediately so a crash here still leaves
        # a recoverable breadcrumb.
        _update_clip(ctx.clip_id, voice_ids=voices.voice_ids)

        _check_cancelled(job_id)
        tts_chunks = await asyncio.to_thread(
            synthesize_turns,
            ctx,
            script=script,
            voices=voices,
            eleven=eleven,
            emit_event=emit_event,
        )

        # Stage 4: bg footage
        _check_cancelled(job_id)
        bg = await asyncio.to_thread(
            pick_bg_footage,
            script.total_duration_s,
            emit_event=emit_event,
        )

        # Stage 5: timeline
        _check_cancelled(job_id)
        timeline = await asyncio.to_thread(
            build_timeline,
            ctx,
            script=script,
            tts_chunks=tts_chunks,
            bg=bg,
            sfx_manifest=ctx.sfx_manifest,
            emit_event=emit_event,
        )

        # Stage 6+7+8: render + verify + refine loop
        _check_cancelled(job_id)
        def _render_fn(tl: TimelineSpec) -> RenderResult:
            return render_timeline(ctx, timeline=tl, emit_event=emit_event)

        final_timeline, render, verify_report = await asyncio.to_thread(
            verify_refine_loop,
            ctx,
            timeline=timeline,
            render_fn=_render_fn,
            gemini=gemini,
            emit_event=emit_event,
        )

        # Stage 9: upload + finalize
        _check_cancelled(job_id)
        artifacts = await asyncio.to_thread(
            _upload_final,
            ctx,
            render=render,
            timeline=final_timeline,
            voices=voices,
            emit_event=emit_event,
        )

        # Update clip row to ready with actual duration + artifacts.
        _retry(
            lambda: _update_clip(
                ctx.clip_id,
                status="ready",
                duration_s=int(round(render.duration_s)),
                artifact_prefix=ctx.storage_prefix,
                artifacts=artifacts,
            ),
            attempts=3,
            base_delay=2.0,
            label="final clip update",
        )

        # Mark job done.
        _update_job_if_running(
            job_id,
            status="done",
            artifact_prefix=ctx.storage_prefix,
            artifacts=artifacts,
        )

        emit_event(
            EventType.DONE,
            stage=Stage.DONE,
            pct=100,
            message="Clip ready",
            data={
                "clip_id": ctx.clip_id,
                "duration_s": round(render.duration_s, 2),
                "verify_score": verify_report.score,
            },
        )
        log.info(
            "gen %s: done (clip=%s, duration=%.2fs, score=%.2f)",
            job_id,
            ctx.clip_id,
            render.duration_s,
            verify_report.score,
        )

    except _Cancelled:
        log.info("gen %s: cancelled", job_id)
        emit(
            job_id,
            EventType.CANCELLED,
            stage=Stage.DONE,
            message="Cancelled",
        )
        _update_clip(ctx.clip_id, status="cancelled") if ctx else None

    except Exception as e:  # noqa: BLE001
        log.exception("gen %s: failed: %s", job_id, e)
        err_msg = f"{type(e).__name__}: {e}"
        _update_job(job_id, status="failed", error=err_msg)
        try:
            _update_clip(ctx.clip_id, status="failed")
        except Exception:  # noqa: BLE001
            pass
        emit(
            job_id,
            EventType.FAILED,
            stage=Stage.DONE,
            message=err_msg,
        )
        raise

    finally:
        if voices is not None:
            try:
                _cleanup_voices(voices, eleven)
            except Exception as e:  # noqa: BLE001
                log.warning("voice cleanup outer: %s", e)
        try:
            _cleanup_scratch(ctx) if "ctx" in locals() else None
        except Exception:  # noqa: BLE001
            pass


def _update_job_if_running_or_queued(job_id: str, **fields) -> bool:
    """Guarded update — accept both 'queued' and 'running' as start states.
    Mirrors the deconstruction worker's _update_job_if_running but widens the
    accepted prior status (we're flipping from queued -> running, not staying
    within running)."""
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    resp = (
        get_supabase()
        .table("jobs")
        .update(fields)
        .eq("id", job_id)
        .in_("status", ["queued", "running"])
        .execute()
    )
    return bool(resp.data)


# ── Public entry point ──────────────────────────────────────────────────────

async def process_clip_generation(job_id: str) -> None:
    """Run the generation pipeline for a single job. Call from main.py via
    background.add_task. Acquires the shared worker semaphore so we don't
    interleave with deconstruction jobs."""
    async with _JOB_SEMAPHORE:
        await _run_pipeline(job_id)
