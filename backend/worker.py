"""Background worker: materialize input, run audio + video analysis in parallel,
persist artifacts, update the jobs row."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from audio_pipeline import Pipeline, PipelineConfig
from events import emit
from media import encode_opus, extract_frame_jpeg
from storage import get_storage
from supabase_client import get_supabase
from video_clip_analyzer import AnalyzerConfig, VideoClipAnalyzer
from voice_slicing import build_voice_samples

log = logging.getLogger(__name__)

JOBS_ROOT = Path("tmp/jobs")


class JobCancelled(Exception):
    """Raised by a checkpoint when the job row has been flipped to 'cancelled'."""


def _update_job(job_id: str, **fields) -> None:
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    get_supabase().table("jobs").update(fields).eq("id", job_id).execute()


def _raise_if_cancelled(job_id: str) -> None:
    """Poll the jobs row; raise JobCancelled if the user has requested cancel.

    Cheap (~1 RTT to Supabase). Call at stage boundaries, not inside hot loops.
    """
    try:
        resp = (
            get_supabase()
            .table("jobs")
            .select("status")
            .eq("id", job_id)
            .maybe_single()
            .execute()
        )
    except Exception as e:
        log.warning("cancellation check failed (continuing): %s", e)
        return
    status = (resp.data or {}).get("status")
    if status == "cancelled":
        raise JobCancelled()


def _update_clip(clip_id: str, **fields) -> None:
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    get_supabase().table("clips").update(fields).eq("id", clip_id).execute()


def _ytdlp_video(url: str, out_path: Path) -> None:
    """Download the video itself (not audio-only) to a local MP4."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "yt_dlp", url,
        "-f", "mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
        "--merge-output-format", "mp4",
        "-o", str(out_path),
        "--no-playlist",
        "--quiet",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if not out_path.exists():
        raise RuntimeError(f"yt-dlp failed for {url}: {result.stderr[-2000:]}")


def _ffmpeg_extract_audio(video_path: Path, wav_path: Path, sample_rate: int = 16000) -> None:
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-ac", "1", "-ar", str(sample_rate),
        "-vn", str(wav_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if not wav_path.exists():
        raise RuntimeError(f"ffmpeg audio extract failed: {result.stderr[-2000:]}")


def _safe_upload(storage, local: Path, key: str, artifacts: dict, artifact_name: str) -> None:
    """Upload a file and record the key on success; log+continue on failure.

    We never let an upload error fail the whole job — the local copy survives
    in the scratch dir and can be retried out-of-band.
    """
    try:
        storage.put_file(local, key)
        artifacts[artifact_name] = key
    except Exception as e:
        log.warning("upload failed for %s (%s): %s", artifact_name, key, e)


def _pick_hero_time(video_analysis: dict) -> Optional[float]:
    """Midpoint of the highest-intensity highlight segment, or None."""
    segs = video_analysis.get("segments") or []
    if not segs:
        return None
    highlights = [s for s in segs if s.get("is_highlight")]
    pool = highlights or segs
    best = max(pool, key=lambda s: s.get("intensity") or 0)
    start = float(best.get("start_seconds") or 0)
    end = float(best.get("end_seconds") or start)
    return (start + end) / 2


def _gemini_api_keys() -> list[str]:
    """Gather Gemini keys from GEMINI_API_KEY (comma-separated) + GEMINI_API_KEY_BACKUP."""
    raw = os.environ.get("GEMINI_API_KEY", "")
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    backup = os.environ.get("GEMINI_API_KEY_BACKUP", "").strip()
    if backup and backup not in keys:
        keys.append(backup)
    return keys


async def _run_video_analysis(
    video_path: Path,
    clip_context: str,
    game_hint: Optional[str],
    cancel_event: Optional[threading.Event] = None,
    progress_callback: Optional[callable] = None,
) -> dict:
    """Run the video analyzer in a worker thread.

    The analyzer is synchronous and spends most of its time in Gemini HTTP
    calls. We pass the cancel_event so each checkpoint inside the analyzer can
    bail out promptly if a sibling stage has already failed — Python threads
    can't be killed, so cooperative cancellation is the only way to stop
    burning API calls after audio dies.
    """
    def _run() -> dict:
        keys = _gemini_api_keys()
        if not keys:
            raise RuntimeError("GEMINI_API_KEY not set")
        cfg = AnalyzerConfig(
            should_cancel=(cancel_event.is_set if cancel_event else (lambda: False)),
            progress_callback=progress_callback,
        )
        analyzer = VideoClipAnalyzer(api_key=keys, config=cfg)
        result = analyzer.analyze(
            video_path=str(video_path),
            clip_context=clip_context,
            game_hint=game_hint,
        )
        return result.model_dump()
    return await asyncio.to_thread(_run)


def _pick_device() -> str:
    """Prefer CUDA when torch sees a GPU, fall back to CPU otherwise. Honours
    an explicit AUDIO_DEVICE override (cuda|cpu) for deterministic dev runs."""
    override = os.environ.get("AUDIO_DEVICE")
    if override in ("cuda", "cpu"):
        return override
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


async def _run_audio_pipeline(audio_wav: Path, out_dir: Path,
                              source_url: Optional[str],
                              progress_callback: Optional[callable] = None) -> dict:
    """Run the audio pipeline on a worker thread.

    Pipeline.run is an async method but its body does long-running synchronous
    CPU work (demucs subprocess, whisper inference, pyannote). Awaiting it on
    the main event loop would block uvicorn from serving any other request,
    which is what made the frontend 504 behind the dev tunnel. Hand the whole
    coroutine to a worker thread with its own event loop so the server stays
    responsive during the minutes-long audio pass.
    """
    device = _pick_device()
    log.info("audio pipeline device=%s", device)
    cfg = PipelineConfig(
        output_dir=out_dir,
        hf_token=os.environ.get("HF_TOKEN"),
        device=device,
        progress_callback=progress_callback,
    )
    pipe = Pipeline(cfg)

    def _run_in_thread() -> dict:
        return asyncio.run(
            pipe.run(url=source_url or "local-upload", local_audio=audio_wav)
        )

    return await asyncio.to_thread(_run_in_thread)


async def process_job(
    job_id: str,
    source_type: str,
    source_url: Optional[str],
    upload_path: Optional[str],
    clip_context: str,
    game_hint: Optional[str],
    clip_id: Optional[str] = None,
    upload_key: Optional[str] = None,
) -> None:
    """Entry point scheduled by the /analyze endpoint."""
    scratch = JOBS_ROOT / job_id
    scratch.mkdir(parents=True, exist_ok=True)
    prefix = job_id
    storage = get_storage()

    try:
        _update_job(job_id, status="running")
        if clip_id:
            _update_clip(clip_id, status="generating")
        emit(job_id, "job.started", stage="input", pct=0, message="Job started")

        # 1. Materialize input as local MP4
        video_path = scratch / "video.mp4"
        if source_type == "url":
            assert source_url, "URL required for source_type=url"
            emit(
                job_id, "input.materializing",
                stage="input", pct=3,
                message="Downloading source video",
                data={"source_type": "url", "source_url": source_url},
            )
            _ytdlp_video(source_url, video_path)
        elif upload_key:
            # Direct-to-storage uploads: bytes already in the bucket, fetch
            # them with the service role and delete the scratch copy after.
            emit(
                job_id, "input.materializing",
                stage="input", pct=3,
                message="Fetching uploaded video from storage",
                data={"source_type": "upload_key", "key": upload_key},
            )
            data = await asyncio.to_thread(storage.download, upload_key)
            video_path.write_bytes(data)
            try:
                storage.delete(upload_key)
            except Exception as e:  # noqa: BLE001
                log.warning("failed to delete upload key %s: %s", upload_key, e)
        else:
            assert upload_path, "upload_path or upload_key required for source_type=upload"
            emit(
                job_id, "input.materializing",
                stage="input", pct=3, message="Preparing uploaded video",
                data={"source_type": "upload"},
            )
            if Path(upload_path) != video_path:
                Path(upload_path).replace(video_path)
        emit(job_id, "input.ready", stage="input", pct=8, message="Source video ready")
        _raise_if_cancelled(job_id)

        # 2. Extract audio WAV (feeds the audio pipeline, skipping its own yt-dlp)
        audio_wav = scratch / "source.wav"
        _ffmpeg_extract_audio(video_path, audio_wav)

        # 3. Run audio pipeline + video analyzer in parallel. Each task emits its
        # own start/done so the frontend checklist fills in independently. If
        # either fails we flip `cancel_event` so the sibling can stop wasting
        # work (Gemini calls, demucs, etc.) at its next checkpoint.
        audio_out = scratch / "audio"
        cancel_event = threading.Event()

        def _audio_progress(event_type: str, message: str, data: Optional[dict]) -> None:
            emit(job_id, event_type, stage="audio", message=message, data=data)

        def _video_progress(event_type: str, message: str, data: Optional[dict]) -> None:
            emit(job_id, event_type, stage="video", message=message, data=data)

        async def _audio_with_events() -> dict:
            emit(job_id, "audio.start", stage="audio", message="Audio pipeline started")
            try:
                result = await _run_audio_pipeline(
                    audio_wav, audio_out, source_url,
                    progress_callback=_audio_progress,
                )
                emit(
                    job_id, "audio.done",
                    stage="audio", message="Audio analysis complete",
                    data={
                        "bpm": (result.get("rhythm") or {}).get("bpm"),
                        "num_speakers": (result.get("transcript") or {}).get("num_speakers"),
                        "duration_s": (result.get("source") or {}).get("duration"),
                    },
                )
                return result
            except Exception as e:
                cancel_event.set()
                emit(
                    job_id, "audio.failed",
                    stage="audio", message=f"{type(e).__name__}: {e}",
                )
                raise

        async def _video_with_events() -> dict:
            emit(job_id, "video.start", stage="video", message="Video analysis started")
            try:
                result = await _run_video_analysis(
                    video_path, clip_context, game_hint, cancel_event=cancel_event,
                    progress_callback=_video_progress,
                )
                emit(
                    job_id, "video.done",
                    stage="video", message="Video analysis complete",
                    data={
                        "segment_count": len(result.get("segments") or []),
                        "game_detected": result.get("game_detected"),
                        "has_caption_style": bool(result.get("caption_style")),
                    },
                )
                return result
            except Exception as e:
                cancel_event.set()
                emit(
                    job_id, "video.failed",
                    stage="video", message=f"{type(e).__name__}: {e}",
                )
                raise

        audio_task = asyncio.create_task(_audio_with_events())
        video_task = asyncio.create_task(_video_with_events())
        done, pending = await asyncio.wait(
            {audio_task, video_task}, return_when=asyncio.FIRST_EXCEPTION,
        )
        first_exc = next((t.exception() for t in done if t.exception()), None)
        if first_exc is not None:
            cancel_event.set()
            for t in pending:
                t.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
            raise first_exc
        if pending:
            await asyncio.gather(*pending)
        audio_manifest = audio_task.result()
        video_analysis = video_task.result()
        _raise_if_cancelled(job_id)
        emit(
            job_id, "analysis.complete",
            stage="artifacts", pct=60, message="Analysis complete, building artifacts",
        )

        # 4. Derive + upload artifacts. Every upload is best-effort.
        artifacts: dict[str, object] = {}

        # 4a. Source video. URL jobs skip — we can re-materialize from source_url.
        if source_type == "upload":
            _safe_upload(storage, video_path, f"{prefix}/source.mp4", artifacts, "source_video")
            if "source_video" in artifacts:
                emit(
                    job_id, "artifacts.source.done",
                    stage="artifacts", pct=65, message="Source video uploaded",
                    data={"key": artifacts["source_video"]},
                )

        # 4b. Per-speaker voice samples (zero-shot TTS reference clips).
        stems_paths = (audio_manifest.get("stems") or {})
        vocals_str = stems_paths.get("vocals")
        diar_turns = ((audio_manifest.get("diarization") or {}).get("turns")) or []
        voices_map: dict[str, str] = {}
        if vocals_str and diar_turns:
            vocals_path = Path(vocals_str)
            voices_dir = scratch / "voices"
            try:
                voice_files = build_voice_samples(vocals_path, diar_turns, voices_dir)
            except Exception as e:
                log.warning("voice sample extraction failed: %s", e)
                voice_files = {}
            for speaker, local_path in voice_files.items():
                key = f"{prefix}/voices/{speaker}.opus"
                try:
                    storage.put_file(local_path, key)
                    voices_map[speaker] = key
                except Exception as e:
                    log.warning("voice upload failed for %s: %s", speaker, e)
        if voices_map:
            artifacts["voices"] = voices_map
        emit(
            job_id, "artifacts.voices.done",
            stage="artifacts", pct=72,
            message=f"{len(voices_map)} voice sample(s) ready",
            data={"voices": voices_map, "speaker_count": len(voices_map)},
        )

        # 4c. Background music → opus (10× smaller than WAV, still usable as a reference).
        bg_str = stems_paths.get("background")
        if bg_str:
            bg_path = Path(bg_str)
            if bg_path.exists():
                bg_opus = scratch / "background_music.opus"
                try:
                    encode_opus(bg_path, bg_opus, bitrate_kbps=96, channels=2)
                    _safe_upload(
                        storage, bg_opus,
                        f"{prefix}/music/background.opus",
                        artifacts, "background_music",
                    )
                    if "background_music" in artifacts:
                        emit(
                            job_id, "artifacts.music.done",
                            stage="artifacts", pct=80, message="Background music encoded",
                            data={"key": artifacts["background_music"]},
                        )
                except Exception as e:
                    log.warning("background music encode/upload failed: %s", e)

        # 4d. Hero frame (highest-intensity moment, used as thumbnail + caption-style ref).
        hero_time = _pick_hero_time(video_analysis)
        if hero_time is not None:
            hero_jpg = scratch / "hero.jpg"
            try:
                extract_frame_jpeg(video_path, hero_time, hero_jpg, width=1080, quality=80)
                _safe_upload(storage, hero_jpg, f"{prefix}/hero.jpg", artifacts, "hero_frame")
                if "hero_frame" in artifacts:
                    emit(
                        job_id, "artifacts.hero.done",
                        stage="artifacts", pct=85, message="Hero frame ready",
                        data={"key": artifacts["hero_frame"], "time_s": round(hero_time, 2)},
                    )
            except Exception as e:
                log.warning("hero frame extraction failed: %s", e)

        # 4d'. SFX candidates — upload every extracted wav + a manifest the user
        # will review. The select endpoint deletes the rejected ones afterwards.
        sfx_events = ((audio_manifest.get("sfx") or {}).get("items")) or []
        sfx_items: list[dict] = []
        if sfx_events:
            for i, ev in enumerate(sfx_events):
                local = Path(ev.get("path") or "")
                if not local.exists():
                    continue
                key = f"{prefix}/sfx/{i:02d}.wav"
                try:
                    storage.put_file(local, key)
                except Exception as e:
                    log.warning("sfx upload failed for %d: %s", i, e)
                    continue
                sfx_items.append({
                    "id": i,
                    "key": key,
                    "video_time": ev.get("video_time"),
                    "duration": ev.get("duration"),
                    "strength": ev.get("strength"),
                    "section_idx": ev.get("section_idx"),
                    "beat_offset": ev.get("beat_offset"),
                })
            if sfx_items:
                sfx_manifest_local = scratch / "sfx_manifest.json"
                with open(sfx_manifest_local, "w", encoding="utf-8") as f:
                    json.dump({"items": sfx_items}, f, indent=2)
                sfx_manifest_key = f"{prefix}/sfx/manifest.json"
                try:
                    storage.put_file(sfx_manifest_local, sfx_manifest_key)
                    artifacts["sfx"] = {"manifest": sfx_manifest_key, "items": sfx_items}
                except Exception as e:
                    log.warning("sfx manifest upload failed: %s", e)
        emit(
            job_id, "artifacts.sfx.done",
            stage="artifacts", pct=88,
            message=(
                f"{len(sfx_items)} SFX candidate(s) ready for review"
                if sfx_items else "No SFX candidates detected"
            ),
            data={"items": sfx_items},
        )

        # 4e. JSON artifacts.
        video_json = scratch / "video_analysis.json"
        with open(video_json, "w", encoding="utf-8") as f:
            json.dump(video_analysis, f, indent=2)
        _safe_upload(
            storage, video_json, f"{prefix}/video_analysis.json",
            artifacts, "video_analysis",
        )
        if "video_analysis" in artifacts:
            emit(
                job_id, "artifacts.video_analysis.done",
                stage="artifacts", pct=90, message="Video analysis JSON uploaded",
                data={"key": artifacts["video_analysis"]},
            )

        audio_manifest_path = audio_out / "manifest.json"
        if audio_manifest_path.exists():
            _safe_upload(
                storage, audio_manifest_path, f"{prefix}/audio_manifest.json",
                artifacts, "audio_manifest",
            )
            if "audio_manifest" in artifacts:
                emit(
                    job_id, "artifacts.audio_manifest.done",
                    stage="artifacts", pct=94, message="Audio manifest uploaded",
                    data={"key": artifacts["audio_manifest"]},
                )

        # 4f. Style DNA — first-class artifact the generator reads first.
        style_dna = _style_dna_from_analysis(video_analysis, audio_manifest)
        style_json = scratch / "style_dna.json"
        with open(style_json, "w", encoding="utf-8") as f:
            json.dump(style_dna, f, indent=2)
        _safe_upload(
            storage, style_json, f"{prefix}/style_dna.json",
            artifacts, "style_dna",
        )
        if "style_dna" in artifacts:
            emit(
                job_id, "artifacts.style_dna.done",
                stage="artifacts", pct=97, message="Style DNA ready",
                data={"key": artifacts["style_dna"], "style_dna": style_dna},
            )

        _update_job(
            job_id,
            status="done",
            video_analysis=video_analysis,
            audio_manifest=audio_manifest,
            artifact_prefix=prefix,
            artifacts=artifacts,
        )
        if clip_id:
            _update_clip(
                clip_id,
                status="ready",
                artifact_prefix=prefix,
                style_dna=style_dna,
                artifacts=artifacts,
            )
        emit(
            job_id, "job.done",
            stage="done", pct=100,
            message="Done",
            data={"artifact_count": len(artifacts)},
        )
        log.info("Job %s done (%d artifacts)", job_id, len(artifacts))

    except JobCancelled:
        log.info("Job %s cancelled by user", job_id)
        # Status is already 'cancelled' (set by the cancel endpoint). Don't
        # overwrite it with 'failed'.
        if clip_id:
            _update_clip(clip_id, status="cancelled")
        emit(job_id, "job.cancelled", stage="done", message="Cancelled by user")
    except Exception as e:
        log.error("Job %s failed: %s\n%s", job_id, e, traceback.format_exc())
        _update_job(job_id, status="failed", error=f"{type(e).__name__}: {e}")
        if clip_id:
            _update_clip(clip_id, status="failed")
        emit(
            job_id, "job.failed",
            stage="done", message=f"{type(e).__name__}: {e}",
        )


def _compute_beat_alignment(
    segments: list[dict],
    beats: list[float],
    tolerance_s: float = 0.1,
) -> dict:
    """How well do scene cuts (segment starts) land on musical beats?"""
    cut_times = [
        float(s["start_seconds"])
        for s in segments
        if isinstance(s, dict) and s.get("start_seconds") is not None
    ]
    if not cut_times or not beats:
        return {
            "cuts_on_beat_pct": None,
            "cut_count": len(cut_times),
            "beat_count": len(beats),
            "tolerance_s": tolerance_s,
        }
    on_beat = sum(
        1 for c in cut_times if min(abs(c - b) for b in beats) <= tolerance_s
    )
    return {
        "cuts_on_beat_pct": round(on_beat / len(cut_times), 3),
        "cut_count": len(cut_times),
        "beat_count": len(beats),
        "tolerance_s": tolerance_s,
    }


def _style_dna_from_analysis(video_analysis: dict, audio_manifest: dict) -> dict:
    """Best-effort distillation of the analyzer output into the Style DNA
    the frontend renders. Safe against missing keys — every field is optional."""
    va = video_analysis or {}
    am = audio_manifest or {}
    segments = va.get("segments") or []
    duration = va.get("total_duration_seconds") or (am.get("source") or {}).get("duration") or 0
    cuts_per_sec = (len(segments) / duration) if duration else None
    beats = (am.get("rhythm") or {}).get("beats") or []
    return {
        "pacing": {"cuts_per_sec": cuts_per_sec, "cut_count": len(segments)},
        "hook": va.get("hook") or {},
        "captions": va.get("caption_style") or {},
        "voice": am.get("diarization") or am.get("voice") or {},
        "music": am.get("music") or {},
        "visual": va.get("palette") or va.get("visual") or {},
        "beat_alignment": _compute_beat_alignment(segments, beats),
    }
