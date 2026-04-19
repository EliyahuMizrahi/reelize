"""Stage 5: assemble a Remotion-ready :class:`TimelineSpec` from upstream artifacts.

Everything that the Remotion composition needs is staged under
``ctx.scratch/remotion_input/`` and referenced by relative path. The final
``timeline.json`` next to those assets is what Remotion reads via ``--props``.
"""
from __future__ import annotations

import json
import logging
import math
import shutil
from pathlib import Path
from typing import Any, Callable

from storage import get_storage

from .types import (
    BgFootageChoice,
    EventType,
    GeneratedScript,
    GenerationContext,
    Stage,
    TTSChunk,
    TimelineSpec,
)

log = logging.getLogger(__name__)

SCHEMA_VERSION = 1
FPS = 30
WIDTH = 1080
HEIGHT = 1920

EFFECT_TYPE_MAP = {
    "zoom in": "zoom_in",
    "zoom_in": "zoom_in",
    "slow motion": "slow_mo",
    "slow_mo": "slow_mo",
    "speed ramp": "speed_ramp",
    "speed_ramp": "speed_ramp",
    "hard cut": "cut_flash",
    "cut_flash": "cut_flash",
    "beat sync": "beat_pulse",
    "beat_pulse": "beat_pulse",
}

DEFAULT_CAPTION_STYLE: dict[str, Any] = {
    "font_feel": "rounded-sans",
    "weight": 800,
    "size": 84,
    "color": "#FFFFFF",
    "stroke_color": "#000000",
    "stroke_width_px": 6,
    "position": "middle",
    "animation": "pop",
    "case": "upper",
    "background": None,
}

# Rough heuristic: how many characters fit on one caption line at size 84.
CAPTION_LINE_CHAR_LIMIT = 22
CAPTION_MAX_LINES = 2
CAPTION_MIN_DURATION_S = 0.6


def _round_to_frame(seconds: float, fps: int = FPS) -> float:
    """Snap a timestamp to the nearest frame boundary."""
    return round(seconds * fps) / fps


def _ceil_to_frame(seconds: float, fps: int = FPS) -> float:
    """Round up to the next frame boundary so duration encloses all content."""
    return math.ceil(seconds * fps) / fps


def _ensure_dir(p: Path) -> Path:
    """Create ``p`` (and parents) if missing; returns ``p``."""
    p.mkdir(parents=True, exist_ok=True)
    return p


def _split_for_captions(text: str, max_chars_per_line: int, max_lines: int) -> list[str]:
    """Greedy word-wrap that never breaks mid-word, capped at ``max_lines`` chunks."""
    words = text.split()
    if not words:
        return []
    chunks: list[list[str]] = []
    current_lines: list[str] = []
    current_line = ""
    for w in words:
        candidate = (current_line + " " + w).strip() if current_line else w
        if len(candidate) <= max_chars_per_line:
            current_line = candidate
            continue
        if current_line:
            current_lines.append(current_line)
        if len(current_lines) >= max_lines:
            chunks.append(current_lines)
            current_lines = []
        current_line = w
    if current_line:
        current_lines.append(current_line)
    if current_lines:
        chunks.append(current_lines)
    return ["\n".join(lines) for lines in chunks]


def _merge_style(defaults: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    """Shallow-merge ``override`` onto ``defaults``; ignores None values."""
    merged = dict(defaults)
    if override:
        for k, v in override.items():
            if v is None:
                continue
            merged[k] = v
    return merged


def _derive_captions(
    script: GeneratedScript,
    caption_style: dict[str, Any],
) -> list[dict[str, Any]]:
    """Split each script turn into 1-2 line caption chunks distributed over the turn."""
    style = _merge_style(DEFAULT_CAPTION_STYLE, caption_style)
    out: list[dict[str, Any]] = []
    for turn in script.turns:
        chunks = _split_for_captions(
            turn.text, CAPTION_LINE_CHAR_LIMIT, CAPTION_MAX_LINES
        )
        if not chunks:
            continue
        turn_dur = max(turn.duration, CAPTION_MIN_DURATION_S)
        per_chunk = turn_dur / len(chunks)
        for i, chunk_text in enumerate(chunks):
            start = _round_to_frame(turn.start + i * per_chunk)
            end = _round_to_frame(turn.start + (i + 1) * per_chunk)
            if end - start < 1.0 / FPS:
                end = start + 1.0 / FPS
            out.append({
                "text": chunk_text,
                "start": start,
                "end": end,
                "style": dict(style),
            })
    return out


def _retime_sfx(
    sfx_manifest: dict[str, Any] | None,
    ctx: GenerationContext,
    remotion_input: Path,
    new_duration_s: float,
) -> list[dict[str, Any]]:
    """Re-time the source sfx manifest onto the new timeline and stage audio files."""
    if not sfx_manifest:
        return []
    items = sfx_manifest.get("items") or []
    if not items:
        return []

    source_duration = float(
        sfx_manifest.get("source_duration_s")
        or sfx_manifest.get("duration_s")
        or 0.0
    )
    if source_duration <= 0:
        # Fall back: use the max video_time so at least the proportional mapping works.
        source_duration = max(
            (float(it.get("video_time", 0.0)) for it in items), default=0.0
        )
    scale = (new_duration_s / source_duration) if source_duration > 0 else 1.0

    sfx_dir = _ensure_dir(remotion_input / "sfx")
    storage = get_storage()
    out: list[dict[str, Any]] = []
    for idx, item in enumerate(items):
        src_at = float(item.get("video_time", item.get("at", 0.0)))
        at = _round_to_frame(src_at * scale)
        if at >= new_duration_s:
            continue
        # Prefer explicit storage_key on the item, else convention.
        storage_key = item.get("storage_key") or (
            f"{ctx.source_artifact_prefix.rstrip('/')}/audio/sfx/sfx_{idx:02d}.wav"
        )
        local_name = Path(storage_key).name or f"sfx_{idx:02d}.wav"
        local_path = sfx_dir / local_name
        if not local_path.exists():
            try:
                data = storage.download(storage_key)
                local_path.write_bytes(data)
            except Exception as e:  # noqa: BLE001
                log.warning("sfx download failed for %s: %s", storage_key, e)
                continue
        out.append({
            "src": f"sfx/{local_name}",
            "at": at,
            "gain": float(item.get("gain", 1.0)),
            "label": item.get("label"),
        })
    return out


def _derive_effects(
    video_analysis: dict[str, Any] | None,
    source_duration_s: float,
    new_duration_s: float,
) -> list[dict[str, Any]]:
    """Map source ``segments[].suggested_edit_style`` onto the new timeline."""
    if not video_analysis:
        return []
    segments = video_analysis.get("segments") or []
    if not segments or source_duration_s <= 0:
        return []
    scale = new_duration_s / source_duration_s
    out: list[dict[str, Any]] = []
    for seg in segments:
        raw = (seg.get("suggested_edit_style") or "").strip().lower()
        if not raw or raw == "normal":
            continue
        mapped = EFFECT_TYPE_MAP.get(raw)
        if not mapped:
            continue
        src_at = float(seg.get("start", 0.0))
        src_end = float(seg.get("end", src_at + 0.4))
        at = _round_to_frame(src_at * scale)
        dur = max(_round_to_frame((src_end - src_at) * scale), 2.0 / FPS)
        if at >= new_duration_s:
            continue
        out.append({"type": mapped, "at": at, "dur": dur})
    return out


def build_timeline(
    ctx: GenerationContext,
    *,
    script: GeneratedScript,
    tts_chunks: list[TTSChunk],
    bg: BgFootageChoice,
    sfx_manifest: dict | None,
    emit_event: Callable[..., None] | None = None,
) -> TimelineSpec:
    """Assemble a complete TimelineSpec. 1080x1920 @ 30fps."""
    if ctx is None:
        raise ValueError("build_timeline: ctx is required")
    if not script or not script.turns:
        raise ValueError("build_timeline: script has no turns")
    if not tts_chunks:
        raise ValueError("build_timeline: tts_chunks is empty")
    if bg is None or not bg.local_path.exists():
        raise ValueError(f"build_timeline: bg footage missing at {getattr(bg, 'local_path', None)}")

    remotion_input = _ensure_dir(ctx.scratch / "remotion_input")
    tts_dir = _ensure_dir(remotion_input / "tts")

    # ── duration ────────────────────────────────────────────────────────────
    last_tts_end = max(c.end for c in tts_chunks)
    turns_end = max(t.end for t in script.turns)
    duration_s = _ceil_to_frame(max(last_tts_end, turns_end, script.total_duration_s or 0.0))
    if duration_s <= 0:
        raise ValueError("build_timeline: computed non-positive duration")

    # ── bg: copy into remotion_input ────────────────────────────────────────
    bg_dest = remotion_input / "bg.mp4"
    if bg.local_path.resolve() != bg_dest.resolve():
        shutil.copyfile(bg.local_path, bg_dest)
    bg_entry = {
        "src": "bg.mp4",
        "trim_in": _round_to_frame(bg.trim_in_s),
        "category": bg.category,
    }

    # ── audio: copy TTS mp3s into remotion_input/tts/ ───────────────────────
    audio: list[dict[str, Any]] = []
    for chunk in sorted(tts_chunks, key=lambda c: c.turn_index):
        name = f"turn_{chunk.turn_index:02d}{chunk.local_path.suffix or '.mp3'}"
        dest = tts_dir / name
        if chunk.local_path.resolve() != dest.resolve():
            shutil.copyfile(chunk.local_path, dest)
        audio.append({
            "src": f"tts/{name}",
            "start": _round_to_frame(chunk.start),
            "end": _round_to_frame(chunk.end),
            "speaker": chunk.speaker,
        })

    # ── captions ────────────────────────────────────────────────────────────
    caption_style = (ctx.style_dna or {}).get("captions") or {}
    captions = _derive_captions(script, caption_style)

    # ── sfx ─────────────────────────────────────────────────────────────────
    sfx = _retime_sfx(sfx_manifest, ctx, remotion_input, duration_s)

    # ── effects ─────────────────────────────────────────────────────────────
    video_analysis = ctx.video_analysis or {}
    source_duration = float(
        video_analysis.get("duration_s")
        or video_analysis.get("source_duration_s")
        or duration_s
    )
    effects = _derive_effects(video_analysis, source_duration, duration_s)

    timeline = TimelineSpec(
        schema_version=SCHEMA_VERSION,
        fps=FPS,
        width=WIDTH,
        height=HEIGHT,
        duration_s=duration_s,
        bg=bg_entry,
        audio=audio,
        captions=captions,
        sfx=sfx,
        effects=effects,
        style_dna=dict(ctx.style_dna or {}),
    )

    # ── persist timeline.json next to the assets ───────────────────────────
    (remotion_input / "timeline.json").write_text(
        json.dumps(timeline.to_json(), indent=2), encoding="utf-8"
    )

    if emit_event:
        emit_event(
            EventType.TIMELINE_DONE,
            stage=Stage.TIMELINE,
            pct=60,
            message="Timeline assembled",
            data={
                "audio_count": len(audio),
                "caption_count": len(captions),
                "sfx_count": len(sfx),
                "effect_count": len(effects),
            },
        )
    return timeline
