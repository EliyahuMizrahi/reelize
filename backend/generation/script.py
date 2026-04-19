"""Stage 1 — rewrite the template transcript for a new topic.

Consumes a `GenerationContext`, feeds the source turns + target topic into
Gemini with strict JSON schema output, then coerces the result into a
`GeneratedScript` preserving speaker alternation and per-turn timing.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable

from pydantic import BaseModel, Field

from .gemini_client import GeminiClient
from .types import EventType, GeneratedScript, GenerationContext, ScriptTurn, Stage

log = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are a narrative rewriter for short-form viral video scripts.

Your job: given a SOURCE TRANSCRIPT (a multi-speaker conversation or narration) \
and a NEW TOPIC, produce a rewritten transcript that talks about the new topic \
while preserving the source's structural DNA.

Hard constraints:
1. SPEAKER ALTERNATION — Keep the exact same sequence of speaker labels, in \
the same order. If the source goes SPEAKER_00 -> SPEAKER_01 -> SPEAKER_00, \
yours must too. Same number of turns.
2. TIMING — Each output turn's (end - start) duration MUST stay within ±15% \
of the corresponding source turn's duration. Align start/end so turns are \
contiguous (turn[i].start == turn[i-1].end) and the first turn starts at 0.0.
3. HOOK STRUCTURE — If the source opens with a hook (question, bold claim, \
stat, cliffhanger), mirror that pattern with new-topic content in turn 0.
4. EMOTIONAL ARC — Match the source's tonal progression (e.g. curious -> \
tense -> payoff). Keep the same energy level per turn.
5. FACTUAL ACCURACY — All claims about the new topic must be plausible and \
non-fabricated. If you'd need to invent specific numbers or names, prefer \
general phrasings. Never make up quotes or statistics.
6. PACING — Words-per-second should roughly match the source (longer turns \
carry more content; short punchy turns stay short).

Output: ONLY valid JSON matching the provided schema. No commentary."""


class _ScriptTurnJson(BaseModel):
    """Pydantic schema for one rewritten turn (Gemini response_schema)."""
    speaker: str = Field(..., description="Speaker label, e.g. SPEAKER_00")
    text: str = Field(..., description="Rewritten dialogue for this turn")
    start: float = Field(..., ge=0.0, description="Start second on final timeline")
    end: float = Field(..., gt=0.0, description="End second on final timeline")


class _ScriptJson(BaseModel):
    """Top-level pydantic schema returned by Gemini."""
    turns: list[_ScriptTurnJson]


def _extract_source_turns(style_dna: dict[str, Any]) -> list[dict[str, Any]]:
    """Pull `voice.turns[]` from style_dna with defensive fallbacks."""
    voice = (style_dna or {}).get("voice") or {}
    turns = voice.get("turns") or []
    out: list[dict[str, Any]] = []
    for t in turns:
        try:
            out.append({
                "speaker": str(t.get("speaker") or "SPEAKER_00"),
                "start": float(t.get("start") or 0.0),
                "end": float(t.get("end") or 0.0),
                "text": str(t.get("text") or "").strip(),
            })
        except (TypeError, ValueError):
            continue
    return out


def _source_total_duration(style_dna: dict[str, Any], source_turns: list[dict[str, Any]]) -> float:
    """Return total source duration from style_dna or fall back to turn span."""
    voice = (style_dna or {}).get("voice") or {}
    d = voice.get("total_duration_seconds")
    try:
        if d is not None and float(d) > 0:
            return float(d)
    except (TypeError, ValueError):
        pass
    if source_turns:
        return max(0.0, source_turns[-1]["end"] - source_turns[0]["start"])
    return 0.0


def _format_source_table(source_turns: list[dict[str, Any]]) -> str:
    """Render source turns as a compact `#|speaker|start|end|dur|text` table."""
    lines = ["# | speaker    | start |  end  |  dur  | text"]
    for i, t in enumerate(source_turns):
        dur = max(0.0, t["end"] - t["start"])
        lines.append(
            f"{i:02d} | {t['speaker']:<10} | {t['start']:5.2f} | {t['end']:5.2f} "
            f"| {dur:5.2f} | {t['text']}"
        )
    return "\n".join(lines)


def _build_user_prompt(ctx: GenerationContext, source_turns: list[dict[str, Any]],
                      total_dur: float) -> str:
    """Assemble the user prompt with source table + topic + tonal cues."""
    parts: list[str] = []
    parts.append(f"NEW TOPIC: {ctx.topic}")
    parts.append(f"TARGET TOTAL DURATION: {total_dur:.2f} seconds")
    parts.append(f"TURN COUNT: {len(source_turns)} (must match exactly)")

    style_dna = ctx.style_dna or {}
    hook = style_dna.get("hook")
    if hook:
        parts.append("\nSOURCE HOOK STYLE:")
        parts.append(json.dumps(hook, ensure_ascii=False, indent=2))

    captions = style_dna.get("captions")
    if captions:
        parts.append("\nCAPTION STYLE (tonal hint — cadence, emoji usage):")
        parts.append(json.dumps(captions, ensure_ascii=False, indent=2))

    parts.append("\nSOURCE TRANSCRIPT (rewrite each row; keep speaker order + timing ±15%):")
    parts.append(_format_source_table(source_turns))

    parts.append(
        "\nReturn JSON with `turns[]`, one entry per source row, same speakers "
        "in the same order, contiguous start/end matching the source pacing."
    )
    return "\n".join(parts)


def _coerce_and_validate(
    parsed: dict[str, Any],
    source_turns: list[dict[str, Any]],
) -> list[ScriptTurn]:
    """Coerce Gemini JSON into ScriptTurn list; repair timing if misaligned."""
    raw_turns = parsed.get("turns") or []
    if not raw_turns:
        raise ValueError("Gemini returned empty turns list")

    # Enforce speaker alternation from the source if Gemini drifted.
    out: list[ScriptTurn] = []
    prev_end = 0.0
    for i, r in enumerate(raw_turns):
        src = source_turns[i] if i < len(source_turns) else None
        speaker = str(r.get("speaker") or (src["speaker"] if src else "SPEAKER_00"))
        if src and speaker != src["speaker"]:
            log.warning(
                "Script turn %d speaker drift (%s -> %s); realigning to source.",
                i, speaker, src["speaker"],
            )
            speaker = src["speaker"]
        text = str(r.get("text") or "").strip()
        try:
            start = float(r.get("start", prev_end))
            end = float(r.get("end", start))
        except (TypeError, ValueError):
            start = prev_end
            end = start + (src["end"] - src["start"] if src else 2.0)
        # Enforce contiguity + non-zero duration.
        if start < prev_end - 0.05:
            start = prev_end
        if end <= start:
            fallback_dur = (src["end"] - src["start"]) if src else 2.0
            end = start + max(0.5, fallback_dur)
        out.append(ScriptTurn(speaker=speaker, text=text, start=start, end=end))
        prev_end = end
    return out


def generate_script(
    ctx: GenerationContext,
    *,
    gemini: GeminiClient,
    emit_event: Callable[..., None] | None = None,
) -> GeneratedScript:
    """Rewrite the template transcript for ctx.topic via Gemini structured output."""
    source_turns = _extract_source_turns(ctx.style_dna)
    if not source_turns:
        raise ValueError(
            f"style_dna.voice.turns is empty for template of clip {ctx.clip_id}"
        )
    total_dur = ctx.target_duration_s or _source_total_duration(ctx.style_dna, source_turns)

    if emit_event is not None:
        emit_event(
            ctx.job_id,
            EventType.SCRIPT_START,
            stage=Stage.SCRIPT,
            pct=5,
            message="Rewriting script for your topic…",
        )

    user_prompt = _build_user_prompt(ctx, source_turns, total_dur)
    log.info("Generating script for clip=%s topic=%r turns=%d dur=%.1fs",
             ctx.clip_id, ctx.topic, len(source_turns), total_dur)

    parsed = gemini.generate_json(
        system=SYSTEM_PROMPT, user=user_prompt, schema=_ScriptJson
    )
    turns = _coerce_and_validate(parsed, source_turns)
    total_duration = turns[-1].end - turns[0].start if turns else 0.0
    script = GeneratedScript(turns=turns, topic=ctx.topic, total_duration_s=total_duration)

    # Persist debug artifact.
    try:
        ctx.scratch.mkdir(parents=True, exist_ok=True)
        out = ctx.scratch / "script.json"
        out.write_text(
            json.dumps(
                {
                    "topic": script.topic,
                    "total_duration_s": script.total_duration_s,
                    "turns": [
                        {
                            "speaker": t.speaker, "text": t.text,
                            "start": t.start, "end": t.end,
                        }
                        for t in script.turns
                    ],
                },
                ensure_ascii=False, indent=2,
            ),
            encoding="utf-8",
        )
    except Exception as e:  # noqa: BLE001
        log.warning("Failed to persist script.json to scratch: %s", e)

    if emit_event is not None:
        emit_event(
            ctx.job_id,
            EventType.SCRIPT_DONE,
            stage=Stage.SCRIPT,
            pct=15,
            message="Script drafted",
            data={"turn_count": len(turns), "total_duration_s": total_duration},
        )
    return script
