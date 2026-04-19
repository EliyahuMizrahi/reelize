"""Stages 7+8: Gemini verify -> refine timeline in a bounded loop.

The refine step is intentionally a no-op until the user supplies the Remotion
Claude skill (see ``REMOTION_REFINE_SYSTEM_PROMPT``). The verify step is fully
wired so scoring and event emission can be exercised end-to-end; the loop will
run once, score the single render, and return.
"""
from __future__ import annotations

import json
import logging
import subprocess
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from .types import (
    EventType,
    GenerationContext,
    RenderResult,
    Stage,
    TimelineSpec,
    VerifyReport,
)

if TYPE_CHECKING:  # avoid importing the heavy genai client at import time
    from .gemini_client import GeminiClient

log = logging.getLogger(__name__)

FFMPEG_TIMEOUT_S = 30
NUM_HERO_FRAMES = 5  # 4-6
DEFAULT_THRESHOLD = 0.75
DEFAULT_MAX_ITERATIONS = 3

# ── System prompts ─────────────────────────────────────────────────────────
# TODO: replace with the user-provided Remotion Claude skill. That skill teaches
# Gemini Remotion-side conventions (Composition structure, staticFile paths,
# useCurrentFrame / interpolate idioms, layer registration, caption animation
# primitives, etc). Until it lands, the refine loop runs with a placeholder
# prompt that can't meaningfully edit the timeline — verify still runs and
# scores, refine is a no-op.
REMOTION_REFINE_SYSTEM_PROMPT = "[PLACEHOLDER — awaiting Remotion skill]"

VERIFY_SYSTEM_PROMPT = """\
You are a senior short-form video editor grading an auto-generated 1080x1920
vertical clip against the source creator's style DNA.

You are shown 4-6 evenly sampled frames plus the timeline spec (captions,
audio cues, effects, style DNA). Score the render end-to-end on four axes:

  1. pacing             — does the cut cadence match the source style?
  2. caption_readability — legibility, safe-area, not clipped off-screen
  3. av_sync            — do captions align with what's being said?
  4. style_adherence    — does the look match the source style DNA
                          (font feel, weight, color, stroke, position, case)?

Return a single JSON object — NO prose, NO markdown — with this shape:

{
  "score": 0.0-1.0,          // weighted overall; 0.75+ is shippable
  "passed": true|false,      // score >= 0.75
  "issues": [                // 0..N; omit empty array is fine
    {
      "kind": "caption_cut_off" | "audio_desync" | "bg_too_busy"
            | "style_mismatch" | "pacing_off" | "effect_missing" | "other",
      "detail": "one-sentence description",
      "fix_hint": "concrete, timeline-level change (e.g. 'move caption.2 down 80px')",
      "severity": "low" | "med" | "high"
    }
  ],
  "notes": "1-2 sentence overall comment"
}

Be strict but fair. A clean render with minor nits should still pass.
"""


# ── Hero-frame extraction ──────────────────────────────────────────────────

def _extract_hero_frames(mp4: Path, out_dir: Path, n: int = NUM_HERO_FRAMES) -> list[Path]:
    """Sample ``n`` evenly spaced PNG frames from ``mp4`` via ffmpeg."""
    out_dir.mkdir(parents=True, exist_ok=True)
    # Probe duration to place the samples (avoids the last-frame-black issue).
    try:
        dur_out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(mp4),
            ],
            timeout=FFMPEG_TIMEOUT_S,
        )
        duration = float(dur_out.decode().strip())
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
        duration = 0.0

    if duration <= 0:
        return []

    # Place samples at 10, 30, 50, 70, 90% (or evenly for n != 5).
    stops = [duration * (i + 0.5) / n for i in range(n)]
    frames: list[Path] = []
    for idx, t in enumerate(stops):
        frame_path = out_dir / f"hero_{idx:02d}.png"
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y", "-v", "error",
                    "-ss", f"{t:.3f}",
                    "-i", str(mp4),
                    "-frames:v", "1",
                    "-q:v", "3",
                    str(frame_path),
                ],
                check=True,
                timeout=FFMPEG_TIMEOUT_S,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
            if frame_path.exists():
                frames.append(frame_path)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            log.warning("hero frame extract failed at t=%.2fs: %s", t, e)
    return frames


# ── Verify ─────────────────────────────────────────────────────────────────

def _timeline_summary(timeline: TimelineSpec) -> dict[str, Any]:
    """Compact, JSON-safe summary of a TimelineSpec for the verify prompt."""
    return {
        "duration_s": timeline.duration_s,
        "fps": timeline.fps,
        "resolution": f"{timeline.width}x{timeline.height}",
        "bg": timeline.bg,
        "audio_count": len(timeline.audio),
        "captions": [
            {"text": c.get("text"), "start": c.get("start"), "end": c.get("end")}
            for c in timeline.captions
        ],
        "sfx_count": len(timeline.sfx),
        "effects": timeline.effects,
        "style_dna_captions": (timeline.style_dna or {}).get("captions"),
    }


def _coerce_verify(payload: dict[str, Any]) -> VerifyReport:
    """Coerce Gemini's JSON into a :class:`VerifyReport`, with sane defaults."""
    try:
        score = float(payload.get("score", 0.0))
    except (TypeError, ValueError):
        score = 0.0
    score = max(0.0, min(1.0, score))
    passed = bool(payload.get("passed", score >= DEFAULT_THRESHOLD))
    issues = payload.get("issues") or []
    if not isinstance(issues, list):
        issues = []
    return VerifyReport(
        score=score,
        passed=passed,
        issues=issues,
        notes=str(payload.get("notes", "")),
    )


def verify_render(
    ctx: GenerationContext,
    *,
    timeline: TimelineSpec,
    render: RenderResult,
    gemini: "GeminiClient",
    emit_event: Callable[..., None] | None = None,
) -> VerifyReport:
    """Extract hero frames from the render, send to Gemini, return the report."""
    if ctx is None:
        raise ValueError("verify_render: ctx is required")
    if timeline is None or render is None:
        raise ValueError("verify_render: timeline and render are required")
    if not render.local_path.exists():
        raise ValueError(f"verify_render: render mp4 missing at {render.local_path}")

    frames_dir = ctx.scratch / "verify_frames"
    frames = _extract_hero_frames(render.local_path, frames_dir, NUM_HERO_FRAMES)

    summary = _timeline_summary(timeline)
    parts: list[Any] = [
        "Timeline summary (JSON):\n" + json.dumps(summary, indent=2),
        "Render facts: "
        f"duration={render.duration_s:.2f}s, "
        f"resolution={render.width}x{render.height}.",
        "Frames follow, sampled evenly across the clip:",
    ]
    for f in frames:
        try:
            parts.append(gemini.image_part(f.read_bytes()))
        except OSError as e:
            log.warning("skip hero frame %s: %s", f, e)

    try:
        raw = gemini.generate_json(
            system=VERIFY_SYSTEM_PROMPT,
            user=parts,
            schema=dict,  # let the SDK return a plain dict
        )
    except TypeError:
        # Some schemas require a pydantic class; fall back to free text + parse.
        text = gemini.generate_text(system=VERIFY_SYSTEM_PROMPT, user=parts)
        try:
            raw = json.loads(text)
        except json.JSONDecodeError:
            log.warning("verify_render: Gemini did not return JSON; defaulting to pass")
            raw = {"score": DEFAULT_THRESHOLD, "passed": True, "issues": [], "notes": text[:200]}

    report = _coerce_verify(raw if isinstance(raw, dict) else {})

    if emit_event:
        emit_event(
            EventType.VERIFY_DONE,
            stage=Stage.VERIFY,
            pct=92,
            message=f"Verify score {report.score:.2f}",
            data={
                "score": report.score,
                "passed": report.passed,
                "issues": report.issues,
            },
        )
    return report


# ── Refine ─────────────────────────────────────────────────────────────────

def refine_timeline(
    ctx: GenerationContext,
    *,
    timeline: TimelineSpec,
    report: VerifyReport,
    gemini: "GeminiClient",
    iteration: int,
) -> TimelineSpec:
    """No-op until the Remotion skill lands. Returns the timeline unchanged."""
    if ctx is None or timeline is None or report is None:
        raise ValueError("refine_timeline: ctx, timeline, and report are required")
    log.warning(
        "refine_timeline: iteration %d — REMOTION_REFINE_SYSTEM_PROMPT is a "
        "placeholder, skipping edit. Score=%.2f issues=%d",
        iteration, report.score, len(report.issues),
    )
    return timeline


# ── Loop ───────────────────────────────────────────────────────────────────

def verify_refine_loop(
    ctx: GenerationContext,
    *,
    timeline: TimelineSpec,
    render_fn: Callable[[TimelineSpec], RenderResult],
    verify_threshold: float = DEFAULT_THRESHOLD,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    gemini: "GeminiClient",
    emit_event: Callable[..., None] | None = None,
) -> tuple[TimelineSpec, RenderResult, VerifyReport]:
    """Render -> verify -> (maybe refine -> re-render). Returns best attempt."""
    if ctx is None:
        raise ValueError("verify_refine_loop: ctx is required")
    if timeline is None:
        raise ValueError("verify_refine_loop: timeline is required")
    if render_fn is None:
        raise ValueError("verify_refine_loop: render_fn is required")
    if max_iterations < 1:
        raise ValueError("verify_refine_loop: max_iterations must be >= 1")

    best: tuple[TimelineSpec, RenderResult, VerifyReport] | None = None
    current_timeline = timeline

    for iteration in range(max_iterations):
        render = render_fn(current_timeline)
        report = verify_render(
            ctx,
            timeline=current_timeline,
            render=render,
            gemini=gemini,
            emit_event=emit_event,
        )
        attempt = (current_timeline, render, report)
        if best is None or report.score > best[2].score:
            best = attempt

        if report.score >= verify_threshold or iteration == max_iterations - 1:
            return best

        prev_timeline = current_timeline
        current_timeline = refine_timeline(
            ctx,
            timeline=current_timeline,
            report=report,
            gemini=gemini,
            iteration=iteration + 1,
        )
        # Placeholder-skill short-circuit: if refine didn't change anything,
        # another render would give an identical score — bail with best so far.
        if current_timeline is prev_timeline or asdict(current_timeline) == asdict(prev_timeline):
            log.info("verify_refine_loop: refine produced no changes, stopping early")
            return best

        if emit_event:
            emit_event(
                EventType.REFINE_APPLIED,
                stage=Stage.REFINE,
                pct=min(96, 88 + iteration * 2),
                message=f"Refine iteration {iteration + 1}",
                data={"iteration": iteration + 1, "patched_fields": []},
            )

    assert best is not None
    return best
