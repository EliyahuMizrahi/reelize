"""Stage 6: run Remotion headless to render ``TimelineSpec`` -> MP4."""
from __future__ import annotations

import collections
import json
import logging
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable

from .types import EventType, GenerationContext, RenderResult, Stage, TimelineSpec

log = logging.getLogger(__name__)

REMOTION_ROOT = Path(__file__).parent.parent / "remotion"
RENDER_TIMEOUT_S = 600
FFPROBE_TIMEOUT_S = 15
COMPOSITION_ID = "MainComp"
STDERR_TAIL_LINES = 40
PROGRESS_EMIT_STEP = 10


def _stage_public_dir(ctx: GenerationContext) -> Path:
    """Mirror ``ctx.scratch/remotion_input/`` into ``backend/remotion/public/``."""
    src = ctx.scratch / "remotion_input"
    if not src.exists():
        raise ValueError(f"remotion_input missing at {src} — run Stage 5 first")
    dest = REMOTION_ROOT / "public"
    if dest.exists():
        # Wipe stale assets so the render isn't poisoned by a previous run.
        shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(src, dest, dirs_exist_ok=True)
    return dest


def _probe_mp4(mp4: Path) -> tuple[float, int, int]:
    """Return ``(duration_s, width, height)`` for a rendered mp4."""
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height:format=duration",
            "-of", "json",
            str(mp4),
        ],
        stderr=subprocess.PIPE,
        timeout=FFPROBE_TIMEOUT_S,
    )
    payload = json.loads(out.decode())
    stream = (payload.get("streams") or [{}])[0]
    fmt = payload.get("format") or {}
    return (
        float(fmt.get("duration", 0.0)),
        int(stream.get("width", 0)),
        int(stream.get("height", 0)),
    )


_PROGRESS_RE = re.compile(r"(\d{1,3})\s*%")


def _parse_progress(line: str) -> int | None:
    """Extract a 0-100 integer from a Remotion progress line, if present."""
    m = _PROGRESS_RE.search(line)
    if not m:
        return None
    val = int(m.group(1))
    return val if 0 <= val <= 100 else None


def render_timeline(
    ctx: GenerationContext,
    *,
    timeline: TimelineSpec,
    emit_event: Callable[..., None] | None = None,
) -> RenderResult:
    """Run Remotion render via subprocess. Returns the rendered MP4 path."""
    if ctx is None:
        raise ValueError("render_timeline: ctx is required")
    if timeline is None:
        raise ValueError("render_timeline: timeline is required")
    if not REMOTION_ROOT.exists():
        raise ValueError(f"remotion project missing at {REMOTION_ROOT}")

    props_path = ctx.scratch / "remotion_input" / "timeline.json"
    if not props_path.exists():
        # Fall back to writing it from the in-memory spec.
        props_path.parent.mkdir(parents=True, exist_ok=True)
        props_path.write_text(json.dumps(timeline.to_json(), indent=2), encoding="utf-8")

    out_dir = ctx.scratch / "render"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "out.mp4"
    if out_path.exists():
        out_path.unlink()

    _stage_public_dir(ctx)

    if emit_event:
        emit_event(
            EventType.RENDER_START,
            stage=Stage.RENDER,
            pct=62,
            message="Starting Remotion render",
            data={"composition": COMPOSITION_ID},
        )

    npx_bin = "npx.cmd" if os.name == "nt" else "npx"
    cmd = [
        npx_bin, "remotion", "render",
        "src/index.ts",
        COMPOSITION_ID,
        str(out_path),
        f"--props={props_path}",
        "--log=verbose",
    ]

    stderr_tail: collections.deque[str] = collections.deque(maxlen=STDERR_TAIL_LINES)
    last_emitted_bucket = 6  # corresponds to pct=62
    proc = subprocess.Popen(
        cmd,
        cwd=str(REMOTION_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=os.environ.copy(),
    )
    try:
        assert proc.stdout is not None
        for raw in proc.stdout:
            line = raw.rstrip()
            stderr_tail.append(line)
            pct = _parse_progress(line)
            if pct is not None and emit_event:
                # Map remotion 0-100 into the 62-88 job-progress band.
                job_pct = 62 + int(pct * 0.26)
                bucket = job_pct // PROGRESS_EMIT_STEP
                if bucket > last_emitted_bucket:
                    last_emitted_bucket = bucket
                    emit_event(
                        EventType.RENDER_PROGRESS,
                        stage=Stage.RENDER,
                        pct=job_pct,
                        message=f"Rendering {pct}%",
                        data={"remotion_pct": pct},
                    )
        proc.wait(timeout=RENDER_TIMEOUT_S)
    except subprocess.TimeoutExpired as e:
        proc.kill()
        tail = "\n".join(stderr_tail)
        raise RuntimeError(f"Remotion render timed out after {RENDER_TIMEOUT_S}s:\n{tail}") from e

    if proc.returncode != 0:
        tail = "\n".join(stderr_tail)
        raise RuntimeError(
            f"Remotion render failed (exit {proc.returncode}):\n{tail}"
        )
    if not out_path.exists():
        tail = "\n".join(stderr_tail)
        raise RuntimeError(f"Remotion render produced no output file.\n{tail}")

    # Emit a mid-progress event if the stream didn't surface any percentages.
    if emit_event and last_emitted_bucket <= 7:
        emit_event(
            EventType.RENDER_PROGRESS,
            stage=Stage.RENDER,
            pct=80,
            message="Rendering",
            data={"remotion_pct": None},
        )

    try:
        duration_s, width, height = _probe_mp4(out_path)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError) as e:
        log.warning("ffprobe of render output failed: %s", e)
        duration_s, width, height = (timeline.duration_s, timeline.width, timeline.height)

    result = RenderResult(
        local_path=out_path,
        duration_s=duration_s,
        width=width,
        height=height,
    )

    if emit_event:
        emit_event(
            EventType.RENDER_DONE,
            stage=Stage.RENDER,
            pct=88,
            message="Render complete",
            data={
                "duration_s": round(duration_s, 3),
                "width": width,
                "height": height,
                "bytes": out_path.stat().st_size,
            },
        )
    return result
