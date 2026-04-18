"""Beat grid + energy envelope — the rhythm features downstream needs."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np

from .config import PipelineConfig

log = logging.getLogger(__name__)

_HOP = 2048


@dataclass
class RhythmArtifacts:
    bpm: float
    beats: list[float]                  # beat timestamps in seconds
    energy_envelope: np.ndarray         # RMS sampled at cfg.energy_envelope_hz
    energy_envelope_hz: int
    energy_envelope_path: Path          # .npy on disk


def compute_rhythm(
    background_music: Path,
    source_audio: Path,
    cfg: PipelineConfig,
) -> RhythmArtifacts:
    """Extract BPM + beat grid from the BG stem, energy envelope from the full mix."""
    sr = cfg.analysis_sample_rate

    # Beat grid on the BG stem (cleaner than the full mix).
    y_bg, _ = librosa.load(str(background_music), sr=sr, mono=True)
    tempo, beat_frames = librosa.beat.beat_track(y=y_bg, sr=sr, hop_length=_HOP)
    bpm = float(np.atleast_1d(tempo)[0])   # librosa 0.10+ returns an array
    beat_times = [round(float(t), 3) for t in librosa.frames_to_time(
        beat_frames, sr=sr, hop_length=_HOP
    )]

    # Energy envelope on the FULL mix (what the user actually hears).
    y_full, _ = librosa.load(str(source_audio), sr=sr, mono=True)
    env_hop = sr // cfg.energy_envelope_hz
    energy = librosa.feature.rms(
        y=y_full, frame_length=env_hop * 2, hop_length=env_hop
    )[0]

    envelope_path = cfg.output_dir / "energy_envelope.npy"
    envelope_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(envelope_path, energy)

    log.info("BPM: %.2f   Beats: %d   Envelope samples: %d",
             bpm, len(beat_times), len(energy))
    return RhythmArtifacts(
        bpm=round(bpm, 2),
        beats=beat_times,
        energy_envelope=energy,
        energy_envelope_hz=cfg.energy_envelope_hz,
        energy_envelope_path=envelope_path,
    )
