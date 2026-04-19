"""ffmpeg wrappers for artifact encoding (Opus audio, JPEG frames, slicing)."""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


_DEFAULT_TIMEOUT_S = 600


def _run(cmd: list[str], timeout: int = _DEFAULT_TIMEOUT_S) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"ffmpeg timed out after {timeout}s: {' '.join(cmd[:3])}") from exc


def _q_from_quality(quality: int) -> int:
    """Map a 0–100 JPEG-style quality to ffmpeg's -q:v scale (2=best, 31=worst)."""
    q = int(round(31 - (max(0, min(100, quality)) / 100) * 29))
    return max(2, min(31, q))


def encode_opus(
    src: Path,
    dst: Path,
    bitrate_kbps: int = 24,
    channels: int = 1,
) -> Path:
    """Encode any audio file to Opus (in an .ogg/.opus container).

    Bitrate guide:
      - voice: 24 kbps mono  (tiny, still cleanly clonable by XTTS/F5)
      - music: 96 kbps stereo
    """
    dst.parent.mkdir(parents=True, exist_ok=True)
    result = _run([
        "ffmpeg", "-y", "-i", str(src),
        "-vn",
        "-c:a", "libopus",
        "-b:a", f"{bitrate_kbps}k",
        "-ac", str(channels),
        str(dst),
    ])
    if not dst.exists() or dst.stat().st_size == 0:
        raise RuntimeError(f"opus encode failed: {result.stderr[-2000:]}")
    return dst


def extract_frame_jpeg(
    video: Path,
    time_s: float,
    dst: Path,
    width: int = 1080,
    quality: int = 80,
) -> Path:
    """Grab a single frame at time_s and save it as a JPEG."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    result = _run([
        "ffmpeg", "-y",
        "-ss", str(max(0.0, time_s)),
        "-i", str(video),
        "-vframes", "1",
        "-vf", f"scale={width}:-2",
        "-q:v", str(_q_from_quality(quality)),
        str(dst),
    ])
    if not dst.exists() or dst.stat().st_size == 0:
        raise RuntimeError(f"frame extract failed: {result.stderr[-2000:]}")
    return dst


def slice_wav(src: Path, dst: Path, start_s: float, duration_s: float) -> Path:
    """Extract [start_s, start_s+duration_s] from src as a pcm_s16le WAV."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    result = _run([
        "ffmpeg", "-y",
        "-ss", str(max(0.0, start_s)),
        "-i", str(src),
        "-t", str(max(0.0, duration_s)),
        "-vn",
        "-c:a", "pcm_s16le",
        str(dst),
    ])
    if not dst.exists() or dst.stat().st_size == 0:
        raise RuntimeError(f"slice failed: {result.stderr[-2000:]}")
    return dst


def concat_wavs(srcs: list[Path], dst: Path) -> Path:
    """Concatenate WAVs via the ffmpeg concat demuxer."""
    if not srcs:
        raise ValueError("concat_wavs: no sources")
    dst.parent.mkdir(parents=True, exist_ok=True)
    list_file = dst.with_suffix(".concat.txt")
    with open(list_file, "w", encoding="utf-8") as f:
        for p in srcs:
            # concat demuxer expects forward-slash POSIX paths, wrapped in single quotes.
            f.write(f"file '{p.resolve().as_posix()}'\n")
    try:
        result = _run([
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(list_file),
            "-c:a", "pcm_s16le",
            str(dst),
        ])
        if not dst.exists() or dst.stat().st_size == 0:
            raise RuntimeError(f"concat failed: {result.stderr[-2000:]}")
    finally:
        list_file.unlink(missing_ok=True)
    return dst
