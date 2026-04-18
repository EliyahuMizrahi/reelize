"""Background worker: materialize input, run audio + video analysis in parallel,
persist artifacts, update the jobs row."""
from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import os
import subprocess
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from audio_pipeline import Pipeline, PipelineConfig
from supabase_client import bucket_name, get_supabase
from video_clip_analyzer import AnalyzerConfig, VideoClipAnalyzer

log = logging.getLogger(__name__)

JOBS_ROOT = Path("tmp/jobs")


def _update_job(job_id: str, **fields) -> None:
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    get_supabase().table("jobs").update(fields).eq("id", job_id).execute()


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


def _upload_artifact(local: Path, storage_key: str) -> None:
    with open(local, "rb") as f:
        data = f.read()
    mime = mimetypes.guess_type(str(local))[0] or "application/octet-stream"
    get_supabase().storage.from_(bucket_name()).upload(
        path=storage_key,
        file=data,
        file_options={"content-type": mime, "upsert": "true"},
    )


def _gemini_api_keys() -> list[str]:
    """Gather Gemini keys from GEMINI_API_KEY (comma-separated) + GEMINI_API_KEY_BACKUP."""
    raw = os.environ.get("GEMINI_API_KEY", "")
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    backup = os.environ.get("GEMINI_API_KEY_BACKUP", "").strip()
    if backup and backup not in keys:
        keys.append(backup)
    return keys


async def _run_video_analysis(video_path: Path, clip_context: str,
                              game_hint: Optional[str]) -> dict:
    def _run() -> dict:
        keys = _gemini_api_keys()
        if not keys:
            raise RuntimeError("GEMINI_API_KEY not set")
        analyzer = VideoClipAnalyzer(api_key=keys, config=AnalyzerConfig())
        result = analyzer.analyze(
            video_path=str(video_path),
            clip_context=clip_context,
            game_hint=game_hint,
        )
        return result.model_dump()
    return await asyncio.to_thread(_run)


async def _run_audio_pipeline(audio_wav: Path, out_dir: Path,
                              source_url: Optional[str]) -> dict:
    cfg = PipelineConfig(
        output_dir=out_dir,
        hf_token=os.environ.get("HF_TOKEN"),
        device="cuda",
    )
    pipe = Pipeline(cfg)
    return await pipe.run(url=source_url or "local-upload", local_audio=audio_wav)


async def process_job(
    job_id: str,
    source_type: str,
    source_url: Optional[str],
    upload_path: Optional[str],
    clip_context: str,
    game_hint: Optional[str],
) -> None:
    """Entry point scheduled by the /analyze endpoint."""
    scratch = JOBS_ROOT / job_id
    scratch.mkdir(parents=True, exist_ok=True)
    prefix = job_id

    try:
        _update_job(job_id, status="running")

        # 1. Materialize input as local MP4
        video_path = scratch / "video.mp4"
        if source_type == "url":
            assert source_url, "URL required for source_type=url"
            _ytdlp_video(source_url, video_path)
        else:
            assert upload_path, "upload_path required for source_type=upload"
            if Path(upload_path) != video_path:
                Path(upload_path).replace(video_path)

        # 2. Extract audio WAV (feeds the audio pipeline, skipping its own yt-dlp)
        audio_wav = scratch / "source.wav"
        _ffmpeg_extract_audio(video_path, audio_wav)

        # 3. Run audio pipeline + video analyzer in parallel
        audio_out = scratch / "audio"
        audio_task = asyncio.create_task(
            _run_audio_pipeline(audio_wav, audio_out, source_url)
        )
        video_task = asyncio.create_task(
            _run_video_analysis(video_path, clip_context, game_hint)
        )
        audio_manifest, video_analysis = await asyncio.gather(audio_task, video_task)

        # 4. Upload the key JSON artifacts (blobs stay local for this iteration)
        video_json = scratch / "video_analysis.json"
        with open(video_json, "w", encoding="utf-8") as f:
            json.dump(video_analysis, f, indent=2)
        try:
            _upload_artifact(video_json, f"{prefix}/video_analysis.json")
            audio_manifest_path = audio_out / "manifest.json"
            if audio_manifest_path.exists():
                _upload_artifact(audio_manifest_path, f"{prefix}/audio_manifest.json")
        except Exception as e:
            log.warning("Artifact upload failed (continuing): %s", e)

        _update_job(
            job_id,
            status="done",
            video_analysis=video_analysis,
            audio_manifest=audio_manifest,
            artifact_prefix=prefix,
        )
        log.info("Job %s done", job_id)

    except Exception as e:
        log.error("Job %s failed: %s\n%s", job_id, e, traceback.format_exc())
        _update_job(job_id, status="failed", error=f"{type(e).__name__}: {e}")
