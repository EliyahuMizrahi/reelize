"""Stages 2+3 — IVC voice cloning + per-turn TTS synthesis.

clone_voices(): downloads each speaker's .opus sample from Storage, uploads to
ElevenLabs IVC, returns a VoiceAssets mapping speaker -> voice_id.

synthesize_turns(): renders every script turn to an MP3 using its speaker's
cloned voice, returning one TTSChunk per turn aligned to the script timeline.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

from storage import get_storage

from .eleven_client import ElevenClient
from .types import (
    EventType,
    GeneratedScript,
    GenerationContext,
    Stage,
    TTSChunk,
    VoiceAssets,
)

log = logging.getLogger(__name__)


def _download_sample(speaker: str, key: str, out_dir: Path) -> Path:
    """Download one .opus voice sample from Storage into `out_dir`."""
    out_dir.mkdir(parents=True, exist_ok=True)
    # Preserve extension from key if present, default to .opus.
    suffix = Path(key).suffix or ".opus"
    local = out_dir / f"{speaker}{suffix}"
    data = get_storage().download(key)
    if not data:
        raise RuntimeError(f"Storage returned 0 bytes for voice sample {key}")
    local.write_bytes(data)
    return local


def clone_voices(
    ctx: GenerationContext,
    *,
    eleven: ElevenClient,
    emit_event: Callable[..., None] | None = None,
) -> VoiceAssets:
    """Download each speaker's sample and IVC-clone; return VoiceAssets mapping."""
    if not ctx.voice_sample_keys:
        raise ValueError(f"No voice_sample_keys provided for clip {ctx.clip_id}")

    if emit_event is not None:
        emit_event(
            ctx.job_id,
            EventType.VOICE_START,
            stage=Stage.VOICE,
            pct=16,
            message="Cloning speaker voices…",
        )

    samples_dir = ctx.scratch / "voice_samples"
    voice_ids: dict[str, str] = {}
    local_samples: dict[str, Path] = {}

    speakers = sorted(ctx.voice_sample_keys.keys())
    for speaker in speakers:
        key = ctx.voice_sample_keys[speaker]
        log.info("Downloading voice sample clip=%s speaker=%s key=%s",
                 ctx.clip_id, speaker, key)
        local = _download_sample(speaker, key, samples_dir)
        local_samples[speaker] = local

        clone_name = f"{ctx.clip_id}_{speaker}"
        log.info("IVC cloning %s for clip=%s (sample=%s)",
                 clone_name, ctx.clip_id, local)
        voice_id = eleven.clone_voice(name=clone_name, sample_paths=[local])
        voice_ids[speaker] = voice_id
        log.info("Cloned %s -> voice_id=%s", speaker, voice_id)

        if emit_event is not None:
            emit_event(
                ctx.job_id,
                EventType.VOICE_CLONED,
                stage=Stage.VOICE,
                message=f"Cloned {speaker}",
                data={"speaker": speaker, "voice_id": voice_id},
            )

    if emit_event is not None:
        emit_event(
            ctx.job_id,
            EventType.VOICE_DONE,
            stage=Stage.VOICE,
            pct=25,
            message="Voices ready",
            data={"speaker_count": len(voice_ids)},
        )

    return VoiceAssets(voice_ids=voice_ids, local_samples=local_samples)


def synthesize_turns(
    ctx: GenerationContext,
    *,
    script: GeneratedScript,
    voices: VoiceAssets,
    eleven: ElevenClient,
    emit_event: Callable[..., None] | None = None,
) -> list[TTSChunk]:
    """Render every script turn to an MP3 via the matching cloned voice."""
    if not voices.voice_ids:
        raise ValueError("synthesize_turns requires at least one cloned voice_id")
    if not script.turns:
        raise ValueError("synthesize_turns requires a non-empty script")

    out_dir = ctx.scratch / "tts"
    out_dir.mkdir(parents=True, exist_ok=True)
    fallback_voice = next(iter(voices.voice_ids.values()))
    total = len(script.turns)

    if emit_event is not None:
        emit_event(
            ctx.job_id,
            EventType.TTS_START,
            stage=Stage.TTS,
            pct=26,
            message="Synthesizing speech…",
            data={"total": total},
        )

    chunks: list[TTSChunk] = []
    for i, turn in enumerate(script.turns):
        voice_id = voices.voice_ids.get(turn.speaker)
        if not voice_id:
            log.warning(
                "Script turn %d speaker=%s has no cloned voice; falling back to %s",
                i, turn.speaker, fallback_voice,
            )
            voice_id = fallback_voice

        out_path = out_dir / f"turn_{i:02d}.mp3"
        log.info("TTS clip=%s turn=%d speaker=%s chars=%d",
                 ctx.clip_id, i, turn.speaker, len(turn.text))
        eleven.tts(voice_id=voice_id, text=turn.text, out_path=out_path)

        chunks.append(TTSChunk(
            turn_index=i,
            speaker=turn.speaker,
            start=turn.start,
            end=turn.end,
            local_path=out_path,
        ))

        if emit_event is not None:
            # Interpolate progress between TTS_START (26) and TTS_DONE (50).
            pct = 26 + int(((i + 1) / total) * 24)
            emit_event(
                ctx.job_id,
                EventType.TTS_PROGRESS,
                stage=Stage.TTS,
                pct=pct,
                message=f"Synthesized turn {i + 1}/{total}",
                data={"done": i + 1, "total": total},
            )

    if emit_event is not None:
        emit_event(
            ctx.job_id,
            EventType.TTS_DONE,
            stage=Stage.TTS,
            pct=50,
            message="All turns synthesized",
            data={"chunk_count": len(chunks)},
        )
    return chunks
