"""Download source audio (from URL) and full songs (via ytsearch)."""
from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

from .config import PipelineConfig

log = logging.getLogger(__name__)


def download_source_audio(url: str, cfg: PipelineConfig) -> Path:
    """Download the URL, extract audio as 16 kHz mono WAV.

    Returns the path to the audio file.
    """
    cfg.source_audio_path.parent.mkdir(parents=True, exist_ok=True)
    out_template = cfg.source_audio_path.with_suffix(".%(ext)s")

    log.info("Downloading source: %s", url)
    proc = subprocess.run(
        [
            sys.executable, "-m", "yt_dlp", url,
            "-x", "--audio-format", "wav",
            "--postprocessor-args", f"ffmpeg:-ar {cfg.source_sample_rate} -ac 1",
            "-o", str(out_template),
            "--no-playlist",
            "--quiet",
        ],
        capture_output=True, text=True,
    )
    if not cfg.source_audio_path.exists():
        raise RuntimeError(
            f"yt-dlp failed to produce {cfg.source_audio_path}\n"
            f"stderr: {proc.stderr[-2000:]}"
        )
    log.info("Source audio ready: %s", cfg.source_audio_path)
    return cfg.source_audio_path


def download_song(artist: str, title: str, song_id: str, cfg: PipelineConfig) -> Path | None:
    """Fetch the full song from YouTube via `ytsearch1:artist title`.

    Returns the path to the downloaded WAV, or None on failure. Results are
    cached on disk under cfg.songs_dir — a subsequent call with the same
    song_id is a no-op.
    """
    cfg.songs_dir.mkdir(parents=True, exist_ok=True)
    path = cfg.songs_dir / f"full_{song_id}.wav"
    if path.exists():
        return path

    query = f"ytsearch1:{artist} {title}"
    log.info("Downloading song: %s - %s", artist, title)
    try:
        subprocess.run(
            [
                sys.executable, "-m", "yt_dlp", query,
                "-x", "--audio-format", "wav",
                "--postprocessor-args", f"ffmpeg:-ar {cfg.analysis_sample_rate} -ac 1",
                "-o", str(path.with_suffix(".%(ext)s")),
                "--quiet",
            ],
            check=True, capture_output=True, timeout=180,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        log.warning("Failed to download %s - %s: %s", artist, title, e)
        return None

    return path if path.exists() else None
