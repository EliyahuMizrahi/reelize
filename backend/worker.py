"""Background worker: materialize input, run audio + video analysis in parallel,
persist artifacts, update the jobs row.

``process_job`` is intended to be serialized per-process — callers (main.py)
should hold ``_JOB_SEMAPHORE`` so only one job does heavy analysis work at a
time. Running two in parallel would double demucs/whisper/Gemini concurrency
and reliably OOM the GPU/container.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from audio_pipeline import JobCancelled, Pipeline, PipelineConfig
from events import emit
from media import encode_opus, extract_frame_jpeg
from storage import get_storage
from supabase_client import get_supabase
from video_clip_analyzer import AnalyzerConfig, VideoClipAnalyzer
from voice_slicing import build_voice_samples

log = logging.getLogger(__name__)

JOBS_ROOT = Path("tmp/jobs")

# process_job is serialized — holding a single slot keeps demucs/whisper from
# tripping over one another when two jobs queue back-to-back. main.py can share
# this semaphore or wrap its own.
_JOB_SEMAPHORE = asyncio.Semaphore(1)

# Hard ceiling on a single job. If we're past 30 minutes something is wedged
# (hung yt-dlp, stuck ffmpeg, stalled Gemini HTTP) and we'd rather fail loudly
# than keep holding the semaphore forever.
_JOB_TIMEOUT_S = 30 * 60

# Per-job event cap — past this we stop inserting job_events rows so a runaway
# stage can't fill the table. Read once per insert attempt.
_JOB_EVENT_CAP = 200

# ffmpeg/yt-dlp timeouts (seconds) — every subprocess must set one so a stuck
# remote doesn't hang the worker forever.
_YTDLP_TIMEOUT = 300
_FFMPEG_CUT_TIMEOUT = 600
_FFMPEG_EXTRACT_TIMEOUT = 600
_FFPROBE_TIMEOUT = 30


def _retry(fn, *, attempts: int = 3, base_delay: float = 2.0, label: str = "op"):
    """Tiny retry helper — exponential backoff, re-raises the last error.

    We intentionally don't pull in tenacity here (not in requirements.txt) so
    the worker stays lean. Used for flaky Supabase/storage writes.
    """
    last_err: Exception | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < attempts - 1:
                delay = base_delay * (2 ** attempt)
                log.warning("%s failed (attempt %d/%d): %s — retrying in %.1fs",
                            label, attempt + 1, attempts, e, delay)
                time.sleep(delay)
    assert last_err is not None
    raise last_err


def _update_job(job_id: str, **fields) -> None:
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    get_supabase().table("jobs").update(fields).eq("id", job_id).execute()


def _update_job_if_running(job_id: str, **fields) -> bool:
    """Guarded update — only applies if the row is still status='running'.

    Returns True if the update landed (a row was actually modified), False if
    the job was cancelled or already transitioned by something else. Prevents
    a slow worker from stomping on a cancel flipped in flight.
    """
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    resp = (
        get_supabase()
        .table("jobs")
        .update(fields)
        .eq("id", job_id)
        .eq("status", "running")
        .execute()
    )
    return bool(resp.data)


def _get_job_status(job_id: str) -> Optional[str]:
    try:
        resp = (
            get_supabase()
            .table("jobs")
            .select("status")
            .eq("id", job_id)
            .maybe_single()
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        log.warning("job status read failed: %s", e)
        return None
    return (resp.data or {}).get("status")


def _raise_if_cancelled(job_id: str) -> None:
    """Poll the jobs row; raise JobCancelled if the user has requested cancel.

    Cheap (~1 RTT to Supabase). Call at stage boundaries, not inside hot loops.
    """
    status = _get_job_status(job_id)
    if status == "cancelled":
        raise JobCancelled()


def _start_cancel_poller(
    job_id: str, cancel_event: threading.Event, interval_s: float = 4.0,
) -> asyncio.Task:
    """Kick off an async poller that flips cancel_event if the job is cancelled.

    This is what lets the video analyzer + audio pipeline bail out within a few
    seconds of the user hitting Cancel, instead of waiting for the next stage
    boundary we happen to cross.
    """
    async def _poll() -> None:
        while not cancel_event.is_set():
            try:
                status = await asyncio.to_thread(_get_job_status, job_id)
            except Exception:  # noqa: BLE001
                status = None
            if status == "cancelled":
                log.info("cancel poller: job %s flipped to cancelled", job_id)
                cancel_event.set()
                return
            try:
                await asyncio.sleep(interval_s)
            except asyncio.CancelledError:
                return

    return asyncio.create_task(_poll())


def _update_clip(clip_id: str, **fields) -> None:
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    get_supabase().table("clips").update(fields).eq("id", clip_id).execute()


def _count_job_events(job_id: str) -> int:
    try:
        resp = (
            get_supabase()
            .table("job_events")
            .select("id", count="exact")
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        )
    except Exception:  # noqa: BLE001
        return 0
    return int(getattr(resp, "count", 0) or 0)


def cleanup_old_scratch(max_age_hours: float = 6.0) -> int:
    """Sweep orphaned scratch dirs older than ``max_age_hours``.

    Intended to be called from main.py on startup so a crashed worker doesn't
    leak gigabytes across restarts. Returns the number of dirs removed.
    """
    if not JOBS_ROOT.exists():
        return 0
    cutoff = time.time() - max_age_hours * 3600
    removed = 0
    for child in JOBS_ROOT.iterdir():
        try:
            if child.is_dir() and child.stat().st_mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
                removed += 1
        except Exception as e:  # noqa: BLE001
            log.warning("scratch sweep: could not remove %s: %s", child, e)
    if removed:
        log.info("scratch sweep: removed %d stale dir(s)", removed)
    return removed


def _validate_download_url(url: str) -> None:
    """Reject URLs that could be argv-injected or resolve to a local file."""
    if not isinstance(url, str) or not url:
        raise ValueError("empty download url")
    if url.startswith("-"):
        raise ValueError("url starts with '-' — refusing (argv injection risk)")
    lower = url.lower().strip()
    if lower.startswith(("file:", "file://")):
        raise ValueError("file:// urls are not allowed")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise ValueError("only http(s):// urls are allowed")


def _run_subprocess(cmd: list[str], *, timeout: int, label: str) -> subprocess.CompletedProcess:
    """subprocess.run with a mandatory timeout + clean TimeoutExpired handling."""
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        # subprocess.run already kills the child on timeout, but be explicit in
        # the error so the failure message on the jobs row is obvious.
        tail = ""
        if e.stderr:
            tail = (e.stderr.decode("utf-8", errors="replace")
                    if isinstance(e.stderr, (bytes, bytearray))
                    else str(e.stderr))[-2000:]
        raise RuntimeError(
            f"{label} timed out after {timeout}s. stderr tail: {tail}"
        ) from e


def _ytdlp_video(url: str, out_path: Path) -> None:
    """Download the video itself (not audio-only) to a local MP4.

    Hardened against argv injection: we validate the URL scheme, refuse
    leading-dash inputs, pass ``--no-config`` so a malicious ~/.config/yt-dlp
    can't swing behaviour, and put ``--`` before the URL so yt-dlp treats it
    as a positional even if future input somehow slips past the check.
    """
    _validate_download_url(url)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--no-config",
        "-f", "mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
        "--merge-output-format", "mp4",
        "-o", str(out_path),
        "--no-playlist",
        "--quiet",
        "--",
        url,
    ]
    result = _run_subprocess(cmd, timeout=_YTDLP_TIMEOUT, label="yt-dlp")
    if not out_path.exists():
        raise RuntimeError(f"yt-dlp failed for {url}: {(result.stderr or '')[-2000:]}")


def _ffmpeg_extract_audio(video_path: Path, wav_path: Path, sample_rate: int = 16000) -> None:
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    # video_path is a file we materialized ourselves inside scratch/; still,
    # force the protocol whitelist to file so an accidental concat:// or http://
    # target (e.g. a symlink pointing at something weird) is rejected by ffmpeg.
    safe_in = os.path.abspath(str(video_path))
    cmd = [
        "ffmpeg", "-y",
        "-protocol_whitelist", "file",
        "-i", safe_in,
        "-ac", "1", "-ar", str(sample_rate),
        "-vn", str(wav_path),
    ]
    result = _run_subprocess(cmd, timeout=_FFMPEG_EXTRACT_TIMEOUT, label="ffmpeg extract")
    if not wav_path.exists():
        raise RuntimeError(f"ffmpeg audio extract failed: {(result.stderr or '')[-2000:]}")


def _safe_upload(
    storage,
    local: Path,
    key: str,
    artifacts: dict,
    artifact_name: str,
    missing_artifacts: list[str],
) -> None:
    """Upload with retry; on final failure record the artifact as missing and raise.

    We used to log-and-swallow, which meant a broken Supabase connection
    silently turned a `done` job into a `done-with-gaps` nobody noticed. Now
    three attempts with exp backoff, and if they all fail the caller gets the
    exception so the job ends `failed`.
    """
    def _do_upload() -> None:
        storage.put_file(local, key)

    try:
        _retry(_do_upload, attempts=3, base_delay=2.0, label=f"upload {artifact_name}")
        artifacts[artifact_name] = key
    except Exception as e:
        log.error("upload giving up for %s (%s): %s", artifact_name, key, e)
        missing_artifacts.append(artifact_name)
        raise


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
    """Gather Gemini keys. GEMINI_API_KEY_BACKUP3, if set, takes the primary
    slot (key1 is free-tier RPD-exhausted). Otherwise falls back to the
    original GEMINI_API_KEY. BACKUP4 is appended as the rotation key."""
    keys: list[str] = []
    key3 = os.environ.get("GEMINI_API_KEY_BACKUP3", "").strip()
    if key3:
        keys.append(key3)
    else:
        raw = os.environ.get("GEMINI_API_KEY", "")
        keys.extend(k.strip() for k in raw.split(",") if k.strip())
    backup4 = os.environ.get("GEMINI_API_KEY_BACKUP4", "").strip()
    if backup4 and backup4 not in keys:
        keys.append(backup4)
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


async def _run_audio_pipeline(
    audio_wav: Path,
    out_dir: Path,
    source_url: Optional[str],
    progress_callback: Optional[callable] = None,
    cancel_event: Optional[threading.Event] = None,
) -> dict:
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
    cfg_kwargs = dict(
        output_dir=out_dir,
        hf_token=os.environ.get("HF_TOKEN"),
        device=device,
        progress_callback=progress_callback,
    )
    # Pass cooperative cancel if the PipelineConfig accepts it (BE-AUDIO owns
    # that hook; this side just plumbs it in when it's there).
    try:
        cfg = PipelineConfig(
            **cfg_kwargs,
            should_cancel=(cancel_event.is_set if cancel_event else (lambda: False)),
        )
    except TypeError:
        cfg = PipelineConfig(**cfg_kwargs)
    pipe = Pipeline(cfg)

    def _run_in_thread() -> dict:
        return asyncio.run(
            pipe.run(url=source_url or "local-upload", local_audio=audio_wav)
        )

    return await asyncio.to_thread(_run_in_thread)


async def _download_upload_to_scratch(storage, upload_key: str, dest: Path) -> None:
    """Stream a Supabase upload into scratch without loading the whole file
    into RAM. Supabase's SDK only exposes ``download(key) -> bytes`` today, so
    in that path we fall back to a single read but write in 8MB chunks; for R2
    we use the streaming Body directly."""
    def _run() -> None:
        dest.parent.mkdir(parents=True, exist_ok=True)
        # R2: use the S3 client's streaming get_object body.
        client = getattr(storage, "_client", None)
        bucket = getattr(storage, "_bucket", None)
        if client is not None and bucket and hasattr(client, "get_object"):
            try:
                resp = client.get_object(Bucket=bucket, Key=upload_key)
                body = resp["Body"]
                with open(dest, "wb") as f:
                    for chunk in body.iter_chunks(chunk_size=8 * 1024 * 1024):
                        f.write(chunk)
                return
            except Exception:
                # Fall through to the bytes path below.
                pass
        # Supabase / generic: download() returns bytes. Still write in chunks
        # so peak RSS stays predictable even on a large buffer.
        data = storage.download(upload_key)
        chunk = 8 * 1024 * 1024
        with open(dest, "wb") as f:
            for i in range(0, len(data), chunk):
                f.write(data[i : i + chunk])

    await asyncio.to_thread(_run)


def _emit_capped(job_id: str, event_type: str, **kwargs) -> None:
    """emit() with a per-job cap so a runaway loop can't flood job_events."""
    try:
        count = _count_job_events(job_id)
    except Exception:
        count = 0
    if count >= _JOB_EVENT_CAP:
        # Log once per attempt — quieter than a spam loop, still visible.
        log.debug("job_events cap reached for %s (%d), skipping %s",
                  job_id, count, event_type)
        return
    emit(job_id, event_type, **kwargs)


async def _process_job_inner(
    job_id: str,
    source_type: str,
    source_url: Optional[str],
    upload_path: Optional[str],
    clip_context: str,
    game_hint: Optional[str],
    clip_id: Optional[str],
    upload_key: Optional[str],
    scratch: Path,
) -> None:
    prefix = job_id
    storage = get_storage()
    # Keys we still need to keep in bucket storage while the job is running —
    # only cleared after we successfully reach status='done'.
    pending_upload_keys: list[str] = []
    missing_artifacts: list[str] = []
    # Track both the poller task and the cancel flag up front so every code
    # path in the outer finally has something to clean up.
    cancel_event = threading.Event()
    cancel_poller: Optional[asyncio.Task] = None
    final_state_for_reconcile: dict | None = None

    try:
        _update_job(job_id, status="running")
        if clip_id:
            _update_clip(clip_id, status="generating")
        cancel_poller = _start_cancel_poller(job_id, cancel_event)
        _emit_capped(job_id, "job.started", stage="input", pct=0, message="Job started")

        # 1. Materialize input as local MP4
        video_path = scratch / "video.mp4"
        if source_type == "url":
            assert source_url, "URL required for source_type=url"
            _emit_capped(
                job_id, "input.materializing",
                stage="input", pct=3,
                message="Downloading source video",
                data={"source_type": "url", "source_url": source_url},
            )
            _ytdlp_video(source_url, video_path)
        elif upload_key:
            _emit_capped(
                job_id, "input.materializing",
                stage="input", pct=3,
                message="Fetching uploaded video from storage",
                data={"source_type": "upload_key", "key": upload_key},
            )
            await _download_upload_to_scratch(storage, upload_key, video_path)
            # Don't delete the bucket copy yet — if the job fails after this
            # we'd rather retry out-of-band than force a re-upload.
            pending_upload_keys.append(upload_key)
        else:
            assert upload_path, "upload_path or upload_key required for source_type=upload"
            _emit_capped(
                job_id, "input.materializing",
                stage="input", pct=3, message="Preparing uploaded video",
                data={"source_type": "upload"},
            )
            if Path(upload_path) != video_path:
                Path(upload_path).replace(video_path)
        _emit_capped(job_id, "input.ready", stage="input", pct=8, message="Source video ready")
        _raise_if_cancelled(job_id)

        # 2. Extract audio WAV (feeds the audio pipeline, skipping its own yt-dlp)
        audio_wav = scratch / "source.wav"
        _ffmpeg_extract_audio(video_path, audio_wav)

        # 3. Run audio pipeline + video analyzer in parallel. Each task emits
        # its own start/done so the frontend checklist fills in independently.
        # The two stages are decoupled — if one dies (e.g. Gemini 503 storm),
        # the other still ships and we record an `error` stub for the dead
        # side. Only `cancel_event` set by the user-cancel poller stops the
        # sibling; a sister-stage failure does not.
        audio_out = scratch / "audio"

        def _audio_progress(event_type: str, message: str, data: Optional[dict]) -> None:
            _emit_capped(job_id, event_type, stage="audio", message=message, data=data)

        def _video_progress(event_type: str, message: str, data: Optional[dict]) -> None:
            _emit_capped(job_id, event_type, stage="video", message=message, data=data)

        async def _audio_with_events() -> dict:
            _emit_capped(job_id, "audio.start", stage="audio", message="Audio pipeline started")
            try:
                result = await _run_audio_pipeline(
                    audio_wav, audio_out, source_url,
                    progress_callback=_audio_progress,
                    cancel_event=cancel_event,
                )
                sections = ((result.get("music") or {}).get("sections") or [])
                songs = [
                    {
                        "song": s.get("song"),
                        "artist": s.get("artist"),
                        "video_start": s.get("video_start"),
                        "video_end": s.get("video_end"),
                        "shazam_url": s.get("shazam_url"),
                    }
                    for s in sections
                    if s.get("song")
                ]
                _emit_capped(
                    job_id, "audio.done",
                    stage="audio", message="Audio analysis complete",
                    data={
                        "bpm": (result.get("rhythm") or {}).get("bpm"),
                        "num_speakers": (result.get("transcript") or {}).get("num_speakers"),
                        "duration_s": (result.get("source") or {}).get("duration"),
                        "songs": songs,
                    },
                )
                return result
            except Exception as e:
                _emit_capped(
                    job_id, "audio.failed",
                    stage="audio", message=f"{type(e).__name__}: {e}",
                )
                raise

        async def _video_with_events() -> dict:
            _emit_capped(job_id, "video.start", stage="video", message="Video analysis started")
            try:
                result = await _run_video_analysis(
                    video_path, clip_context, game_hint, cancel_event=cancel_event,
                    progress_callback=_video_progress,
                )
                _emit_capped(
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
                _emit_capped(
                    job_id, "video.failed",
                    stage="video", message=f"{type(e).__name__}: {e}",
                )
                raise

        audio_task = asyncio.create_task(_audio_with_events())
        video_task = asyncio.create_task(_video_with_events())
        # Wait for BOTH to finish — we want a partial result, not an early bail.
        await asyncio.wait({audio_task, video_task}, return_when=asyncio.ALL_COMPLETED)

        # If the user cancelled mid-flight the poller already flipped the row;
        # honour that before treating downstream errors as real failures.
        _raise_if_cancelled(job_id)

        audio_exc = audio_task.exception()
        video_exc = video_task.exception()

        if audio_exc is not None and video_exc is not None:
            # Both stages dead — nothing salvageable. Raise the audio error
            # (arbitrary; both already emitted *.failed events with details).
            raise audio_exc

        if audio_exc is not None:
            log.warning("audio stage failed, continuing with video-only manifest: %s", audio_exc)
            audio_manifest = {"error": f"{type(audio_exc).__name__}: {audio_exc}"}
            missing_artifacts.append("audio_pipeline")
        else:
            audio_manifest = audio_task.result()

        if video_exc is not None:
            log.warning("video stage failed, continuing with audio-only manifest: %s", video_exc)
            video_analysis = {
                "error": f"{type(video_exc).__name__}: {video_exc}",
                "segments": [],
            }
            missing_artifacts.append("video_analysis")
        else:
            video_analysis = video_task.result()
        _raise_if_cancelled(job_id)
        _emit_capped(
            job_id, "analysis.complete",
            stage="artifacts", pct=60, message="Analysis complete, building artifacts",
        )

        # 4. Derive + upload artifacts. Uploads retry; final failure fails the
        # job so we don't ship half-artifacted rows.
        artifacts: dict[str, object] = {}

        def _safe(local: Path, key: str, name: str) -> None:
            _safe_upload(storage, local, key, artifacts, name, missing_artifacts)

        # 4a. Source video. URL jobs skip — we can re-materialize from source_url.
        if source_type == "upload":
            _safe(video_path, f"{prefix}/source.mp4", "source_video")
            if "source_video" in artifacts:
                _emit_capped(
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
                    _retry(
                        lambda lp=local_path, k=key: storage.put_file(lp, k),
                        attempts=3, base_delay=2.0,
                        label=f"voice upload {speaker}",
                    )
                    voices_map[speaker] = key
                except Exception as e:
                    log.warning("voice upload failed for %s: %s", speaker, e)
                    missing_artifacts.append(f"voice:{speaker}")
        if voices_map:
            artifacts["voices"] = voices_map
        _emit_capped(
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
                    _safe(bg_opus, f"{prefix}/music/background.opus", "background_music")
                    if "background_music" in artifacts:
                        _emit_capped(
                            job_id, "artifacts.music.done",
                            stage="artifacts", pct=80, message="Background music encoded",
                            data={"key": artifacts["background_music"]},
                        )
                except Exception as e:
                    log.warning("background music encode/upload failed: %s", e)
                    missing_artifacts.append("background_music")

        # 4d. Hero frame (highest-intensity moment, used as thumbnail + caption-style ref).
        hero_time = _pick_hero_time(video_analysis)
        if hero_time is not None:
            hero_jpg = scratch / "hero.jpg"
            try:
                extract_frame_jpeg(video_path, hero_time, hero_jpg, width=1080, quality=80)
                _safe(hero_jpg, f"{prefix}/hero.jpg", "hero_frame")
                if "hero_frame" in artifacts:
                    _emit_capped(
                        job_id, "artifacts.hero.done",
                        stage="artifacts", pct=85, message="Hero frame ready",
                        data={"key": artifacts["hero_frame"], "time_s": round(hero_time, 2)},
                    )
            except Exception as e:
                log.warning("hero frame extraction failed: %s", e)
                missing_artifacts.append("hero_frame")

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
                    _retry(
                        lambda lp=local, k=key: storage.put_file(lp, k),
                        attempts=3, base_delay=2.0,
                        label=f"sfx upload {i}",
                    )
                except Exception as e:
                    log.warning("sfx upload failed for %d: %s", i, e)
                    missing_artifacts.append(f"sfx:{i}")
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
                    _retry(
                        lambda lp=sfx_manifest_local, k=sfx_manifest_key:
                            storage.put_file(lp, k),
                        attempts=3, base_delay=2.0, label="sfx manifest upload",
                    )
                    artifacts["sfx"] = {"manifest": sfx_manifest_key, "items": sfx_items}
                except Exception as e:
                    log.warning("sfx manifest upload failed: %s", e)
                    missing_artifacts.append("sfx_manifest")
        _emit_capped(
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
        _safe(video_json, f"{prefix}/video_analysis.json", "video_analysis")
        if "video_analysis" in artifacts:
            _emit_capped(
                job_id, "artifacts.video_analysis.done",
                stage="artifacts", pct=90, message="Video analysis JSON uploaded",
                data={"key": artifacts["video_analysis"]},
            )

        audio_manifest_path = audio_out / "manifest.json"
        if audio_manifest_path.exists():
            _safe(audio_manifest_path, f"{prefix}/audio_manifest.json", "audio_manifest")
            if "audio_manifest" in artifacts:
                _emit_capped(
                    job_id, "artifacts.audio_manifest.done",
                    stage="artifacts", pct=94, message="Audio manifest uploaded",
                    data={"key": artifacts["audio_manifest"]},
                )

        # 4f. Style DNA — first-class artifact the generator reads first.
        style_dna = _style_dna_from_analysis(video_analysis, audio_manifest)
        style_json = scratch / "style_dna.json"
        with open(style_json, "w", encoding="utf-8") as f:
            json.dump(style_dna, f, indent=2)
        _safe(style_json, f"{prefix}/style_dna.json", "style_dna")
        if "style_dna" in artifacts:
            _emit_capped(
                job_id, "artifacts.style_dna.done",
                stage="artifacts", pct=97, message="Style DNA ready",
                data={"key": artifacts["style_dna"], "style_dna": style_dna},
            )

        # Guarded final write — if the user cancelled while we were uploading,
        # the update returns rowcount=0 and we drop through to the cancel path
        # without stomping the status back to 'done'.
        # `missing_artifacts` rides inside the existing `artifacts` jsonb under
        # `_missing` (no schema change needed). The job.done event payload
        # below also surfaces it directly for the frontend.
        if missing_artifacts:
            artifacts["_missing"] = list(missing_artifacts)
        final_fields = {
            "status": "done",
            "video_analysis": video_analysis,
            "audio_manifest": audio_manifest,
            "artifact_prefix": prefix,
            "artifacts": artifacts,
            "style_dna": style_dna,
        }

        final_state_for_reconcile = {
            "job_id": job_id,
            "clip_id": clip_id,
            "fields": final_fields,
            "style_dna": style_dna,
            "ts": datetime.now(timezone.utc).isoformat(),
        }

        def _do_final_write() -> bool:
            return _update_job_if_running(job_id, **final_fields)

        try:
            applied = _retry(_do_final_write, attempts=3, base_delay=2.0,
                             label="final jobs update")
        except Exception as e:
            # Drop a checkpoint so an out-of-band reaper can reconcile.
            try:
                checkpoint = scratch / "final_state.json"
                with open(checkpoint, "w", encoding="utf-8") as cf:
                    json.dump(final_state_for_reconcile, cf, indent=2)
                log.error("final jobs update failed; wrote checkpoint to %s: %s",
                          checkpoint, e)
            except Exception:  # noqa: BLE001
                log.exception("could not write reconcile checkpoint")
            raise

        if not applied:
            # Job flipped to cancelled (or otherwise moved) during artifact
            # upload. Respect that — don't mark the clip ready.
            log.info("worker: cancel observed at done-write for job %s", job_id)
            _emit_capped(
                job_id, "job.cancelled", stage="done",
                message="Cancelled during finalization",
            )
            return

        if clip_id:
            # Re-read job status; only flip the clip to ready if the job is
            # still a live success (i.e. not cancelled out from under us).
            current = _get_job_status(job_id)
            if current == "done":
                try:
                    _retry(
                        lambda: _update_clip(
                            clip_id,
                            status="ready",
                            artifact_prefix=prefix,
                            style_dna=style_dna,
                            artifacts=artifacts,
                        ),
                        attempts=3, base_delay=2.0, label="final clip update",
                    )
                except Exception as e:  # noqa: BLE001
                    log.warning("clip final update failed for %s: %s", clip_id, e)
            else:
                log.info("skipping clip ready-flip: job %s now %s", job_id, current)
                _update_clip(clip_id, status=current or "failed")

        _emit_capped(
            job_id, "job.done",
            stage="done", pct=100,
            message="Done",
            data={
                "artifact_count": len(artifacts),
                "missing_artifacts": missing_artifacts or None,
            },
        )
        log.info(
            "Job %s done (%d artifacts, %d missing)",
            job_id, len(artifacts), len(missing_artifacts),
        )

        # Only now is it safe to free the direct-upload bytes in the bucket.
        for k in pending_upload_keys:
            try:
                storage.delete(k)
            except Exception as e:  # noqa: BLE001
                log.warning("failed to delete upload key %s: %s", k, e)
        pending_upload_keys.clear()

    finally:
        if cancel_poller is not None:
            cancel_poller.cancel()
            try:
                await cancel_poller
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass


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
    """Entry point scheduled by the /analyze endpoint.

    Wrapped in:
    - module-level semaphore (serialization)
    - 30 min hard timeout (asyncio.wait_for)
    - try/finally that always wipes the scratch dir
    """
    scratch = JOBS_ROOT / job_id
    scratch.mkdir(parents=True, exist_ok=True)

    async with _JOB_SEMAPHORE:
        try:
            try:
                await asyncio.wait_for(
                    _process_job_inner(
                        job_id, source_type, source_url, upload_path,
                        clip_context, game_hint, clip_id, upload_key, scratch,
                    ),
                    timeout=_JOB_TIMEOUT_S,
                )
            except asyncio.TimeoutError as e:
                log.error("Job %s exceeded %ds — marking failed", job_id, _JOB_TIMEOUT_S)
                try:
                    _update_job(
                        job_id, status="failed",
                        error=f"TimeoutError: job exceeded {_JOB_TIMEOUT_S}s",
                    )
                    if clip_id:
                        _update_clip(clip_id, status="failed")
                except Exception:  # noqa: BLE001
                    log.exception("failed to mark timed-out job failed")
                emit(job_id, "job.failed", stage="done",
                     message=f"TimeoutError: exceeded {_JOB_TIMEOUT_S}s")
                raise RuntimeError(f"job {job_id} timed out") from e
        except JobCancelled:
            log.info("Job %s cancelled by user", job_id)
            # Status is already 'cancelled' (set by the cancel endpoint). Don't
            # overwrite it with 'failed'.
            if clip_id:
                try:
                    _update_clip(clip_id, status="cancelled")
                except Exception:  # noqa: BLE001
                    log.exception("failed to mark clip cancelled")
            emit(job_id, "job.cancelled", stage="done", message="Cancelled by user")
        except Exception as e:
            log.error("Job %s failed: %s\n%s", job_id, e, traceback.format_exc())
            try:
                _update_job(job_id, status="failed", error=f"{type(e).__name__}: {e}")
                if clip_id:
                    _update_clip(clip_id, status="failed")
            except Exception:  # noqa: BLE001
                log.exception("failed to mark job failed")
            emit(
                job_id, "job.failed",
                stage="done", message=f"{type(e).__name__}: {e}",
            )
        finally:
            # Always wipe scratch — whether we succeeded, cancelled, failed, or
            # timed out. The only things that survive are artifacts already
            # uploaded to bucket storage.
            try:
                shutil.rmtree(scratch, ignore_errors=True)
            except Exception:  # noqa: BLE001
                log.exception("scratch cleanup failed for %s", job_id)


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

    # Voice = speaker turns with narration text, so the generator can rewrite
    # the script turn-by-turn and preserve pacing. Prefer transcript segments
    # (speaker-tagged by attach_speakers) since they carry `text`; fall back
    # to diarization turns (text-less) if transcription didn't run.
    transcript = am.get("transcript") or {}
    transcript_segments = transcript.get("segments") or []
    diarization = am.get("diarization") or {}
    if transcript_segments:
        voice = {
            "num_speakers": diarization.get("num_speakers") or transcript.get("num_speakers"),
            "turns": [
                {
                    "start": s.get("start"),
                    "end": s.get("end"),
                    "speaker": s.get("speaker"),
                    "text": s.get("text"),
                }
                for s in transcript_segments
            ],
        }
    else:
        voice = diarization or am.get("voice") or {}

    return {
        "pacing": {"cuts_per_sec": cuts_per_sec, "cut_count": len(segments)},
        "hook": va.get("hook") or {},
        "captions": va.get("caption_style") or {},
        "voice": voice,
        "music": am.get("music") or {},
        "visual": va.get("palette") or va.get("visual") or {},
        "beat_alignment": _compute_beat_alignment(segments, beats),
    }
