"""Speaker diarization via pyannote; attaches a speaker label to segments/words."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from pyannote.audio import Pipeline as PyannotePipeline

from .config import PipelineConfig
from .transcribe import TranscriptArtifacts

log = logging.getLogger(__name__)

_PYANNOTE_MODEL = "pyannote/speaker-diarization-community-1"


@dataclass
class DiarizationResult:
    turns: list[tuple[float, float, str]]   # (start, end, speaker_label)
    num_speakers: int


def diarize(source_audio: Path, cfg: PipelineConfig) -> DiarizationResult:
    """Run pyannote on the ORIGINAL (untrimmed) audio.

    Silence removal destroys the pauses pyannote needs to detect speaker changes,
    so we always diarize the original source.
    """
    if not cfg.hf_token:
        raise RuntimeError(
            "pyannote needs a HuggingFace token. Set HF_TOKEN or pass hf_token in config."
        )

    log.info("Loading pyannote pipeline...")
    pipeline = PyannotePipeline.from_pretrained(_PYANNOTE_MODEL, token=cfg.hf_token)
    pipeline = pipeline.to(torch.device(cfg.device))

    log.info("Diarizing...")
    waveform, sr = sf.read(str(source_audio), always_2d=True)
    wf = torch.from_numpy(np.ascontiguousarray(waveform.T)).float()
    output = pipeline(
        {"waveform": wf, "sample_rate": sr},
        max_speakers=cfg.max_speakers,
    )
    diar = output.exclusive_speaker_diarization

    turns = [
        (turn.start, turn.end, speaker)
        for turn, _, speaker in diar.itertracks(yield_label=True)
    ]
    num_speakers = len({spk for _, _, spk in turns})
    log.info("Detected %d speaker(s) across %d turn(s)", num_speakers, len(turns))
    return DiarizationResult(turns=turns, num_speakers=num_speakers)


def _speaker_at(turns: list[tuple[float, float, str]], start: float, end: float) -> str:
    """Find the speaker covering [start, end]; fall back to any overlap; else UNKNOWN."""
    mid = (start + end) / 2
    for s, e, spk in turns:
        if s <= mid <= e:
            return spk
    for s, e, spk in turns:
        if s <= end and start <= e:
            return spk
    return "UNKNOWN"


def attach_speakers(transcript: TranscriptArtifacts, diar: DiarizationResult) -> None:
    """Fill in the `speaker` field on each segment/word in-place."""
    for seg in transcript.segments:
        seg.speaker = _speaker_at(diar.turns, seg.start, seg.end)
    for w in transcript.words:
        w.speaker = _speaker_at(diar.turns, w.start, w.end)
