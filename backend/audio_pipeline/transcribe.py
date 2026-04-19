"""Whisper transcription with word-level timestamps + timeline remapping."""
from __future__ import annotations

import functools
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import whisper

from .config import PipelineConfig

log = logging.getLogger(__name__)


@functools.lru_cache(maxsize=4)
def _load_whisper(model_id: str, device: str):
    """Load + cache the Whisper model, keyed on (model, device).

    Whisper load is 5-15s depending on the model; caching shaves that off every
    job after the first. `maxsize=4` lets us hold a couple of model sizes on
    each device without thrashing.
    """
    log.info("Loading Whisper model (cache miss): %s on %s", model_id, device)
    return whisper.load_model(model_id, device=device)


@dataclass
class TranscriptSegment:
    start: float          # original (video) timeline
    end: float
    text: str
    speaker: str = "UNKNOWN"

    def to_dict(self) -> dict:
        return {"start": self.start, "end": self.end, "text": self.text, "speaker": self.speaker}


@dataclass
class TranscriptWord:
    word: str
    start: float         # original (video) timeline
    end: float
    speaker: str = "UNKNOWN"

    def to_dict(self) -> dict:
        return {"word": self.word, "start": self.start, "end": self.end, "speaker": self.speaker}


@dataclass
class TranscriptArtifacts:
    segments: list[TranscriptSegment]
    words: list[TranscriptWord]


def transcribe(
    trimmed_vocals_path: Path,
    cfg: PipelineConfig,
    *,
    trimmed_to_original: Callable[[float], float],
) -> TranscriptArtifacts:
    """Run Whisper on the trimmed vocals; remap timestamps to original timeline."""
    model = _load_whisper(cfg.whisper_model, cfg.device)

    log.info("Transcribing...")
    result = model.transcribe(str(trimmed_vocals_path), word_timestamps=True)

    segments: list[TranscriptSegment] = []
    words: list[TranscriptWord] = []
    for s in result["segments"]:
        text = s["text"].strip()
        if not text or s["end"] - s["start"] <= 0.1:
            continue
        segments.append(TranscriptSegment(
            start=round(trimmed_to_original(s["start"]), 3),
            end=round(trimmed_to_original(s["end"]), 3),
            text=text,
        ))
        for w in s.get("words", []):
            w_text = w["word"].strip()
            if not w_text:
                continue
            words.append(TranscriptWord(
                word=w_text,
                start=round(trimmed_to_original(w["start"]), 3),
                end=round(trimmed_to_original(w["end"]), 3),
            ))

    log.info("Transcribed %d segment(s), %d word(s)", len(segments), len(words))
    return TranscriptArtifacts(segments=segments, words=words)
