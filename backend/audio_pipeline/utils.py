"""Shared helpers."""
from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

import numpy as np

log = logging.getLogger(__name__)


def json_default(o: Any) -> Any:
    """Default JSON encoder that handles numpy scalars and arrays."""
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, Path):
        return str(o)
    raise TypeError(f"Not JSON serializable: {type(o).__name__}")


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=json_default)


def run_ffmpeg(
    args: list[str],
    *,
    check: bool = True,   # TODO: no caller passes check=False; drop if still true after a few sprints.
    timeout: float = 300.0,
) -> subprocess.CompletedProcess:
    """Run ffmpeg quietly and raise with stderr if it fails or times out."""
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(
            f"ffmpeg timed out after {e.timeout}s:\n"
            f"  cmd: {' '.join(cmd)}"
        ) from e
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed (code {proc.returncode}):\n"
            f"  cmd: {' '.join(cmd)}\n"
            f"  stderr: {proc.stderr.strip()}"
        )
    return proc


def run_ffprobe_duration(path: Path | str) -> float:
    """Return the duration (seconds) of a media file."""
    proc = subprocess.run(
        [
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_format", str(path),
        ],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(proc.stdout)["format"]["duration"])
