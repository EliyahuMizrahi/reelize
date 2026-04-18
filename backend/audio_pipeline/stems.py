"""Demucs stem separation + background-music mix + vocal-silence trim."""
from __future__ import annotations

import logging
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import PipelineConfig
from .utils import run_ffmpeg

log = logging.getLogger(__name__)


@dataclass
class StemArtifacts:
    """Paths produced by the stem-separation step."""
    stems: dict[str, Path]            # {"vocals": ..., "drums": ..., ...}
    background_music: Path             # drums+bass+other mixed
    vocals_trimmed: Path               # silence-removed vocals for Whisper
    silence_regions: list[tuple[float, float]]  # silences removed from vocals


def separate_stems(source_audio: Path, cfg: PipelineConfig) -> dict[str, Path]:
    """Run Demucs on the source audio, returning {stem_name: path}."""
    log.info("Running Demucs (%s)...", cfg.demucs_model)
    subprocess.run(
        [
            "python", "-m", "demucs",
            "-n", cfg.demucs_model,
            "-d", cfg.device,
            "-o", str(cfg.stems_dir),
            str(source_audio),
        ],
        check=True,
    )

    # Demucs writes to {stems_dir}/{model_name}/{source_stem}/
    source_stem = source_audio.stem
    stem_dir = cfg.stems_dir / cfg.demucs_model / source_stem
    if not stem_dir.exists():
        # Some demucs versions use a slightly different layout
        candidates = list(cfg.stems_dir.rglob(f"{source_stem}/vocals.wav"))
        if not candidates:
            raise RuntimeError(f"Demucs output not found under {cfg.stems_dir}")
        stem_dir = candidates[0].parent

    stems = {}
    for name in ("vocals", "drums", "bass", "other"):
        p = stem_dir / f"{name}.wav"
        if p.exists():
            stems[name] = p
    if "vocals" not in stems:
        raise RuntimeError("Demucs did not produce a vocals stem")
    return stems


def mix_background_music(stems: dict[str, Path], cfg: PipelineConfig) -> Path:
    """Mix drums+bass+other into a single 'background music' track."""
    bg_inputs = [stems[k] for k in ("drums", "bass", "other") if k in stems]
    if not bg_inputs:
        raise RuntimeError("Need at least one of drums/bass/other to build BG music")

    args = []
    for p in bg_inputs:
        args += ["-i", str(p)]
    args += [
        "-filter_complex", f"amix=inputs={len(bg_inputs)}:normalize=0",
        str(cfg.background_music_path),
    ]
    run_ffmpeg(args)
    return cfg.background_music_path


def detect_vocal_silences(vocals_path: Path, cfg: PipelineConfig) -> list[tuple[float, float]]:
    """Detect silence regions in vocals. Returns list of (start, end) in seconds."""
    proc = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-i", str(vocals_path),
            "-af", f"silencedetect=noise={cfg.silence_threshold_db}dB:d={cfg.silence_min_duration}",
            "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    starts = [float(m) for m in re.findall(r"silence_start: ([\d.]+)", proc.stderr)]
    ends = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", proc.stderr)]
    return list(zip(starts, ends[: len(starts)]))


def trim_vocal_silence(vocals_path: Path, cfg: PipelineConfig) -> Path:
    """Remove silences from the vocal stem for cleaner Whisper input."""
    filter_str = (
        f"silenceremove=stop_periods=-1:"
        f"stop_duration={cfg.silence_min_duration}:"
        f"stop_threshold={cfg.silence_threshold_db}dB"
    )
    run_ffmpeg([
        "-i", str(vocals_path),
        "-af", filter_str,
        str(cfg.vocals_trimmed_path),
    ])
    return cfg.vocals_trimmed_path


def make_trimmed_to_original(
    silences: list[tuple[float, float]],
) -> callable:
    """Return a function that maps a trimmed-timeline timestamp back to original time.

    The trimmed audio has the silence regions removed, so timestamps from Whisper
    on the trimmed vocals are shifted earlier than the real video timeline.
    """
    def trimmed_to_original(t_trimmed: float) -> float:
        offset = 0.0
        for s_start, s_end in silences:
            # If this silence was removed before t_trimmed (in original time),
            # we need to add its duration back.
            if s_start <= t_trimmed + offset:
                offset += s_end - s_start
            else:
                break
        return t_trimmed + offset

    return trimmed_to_original


def process_stems(source_audio: Path, cfg: PipelineConfig) -> StemArtifacts:
    """Run the full stem pipeline: separate → mix BG → trim vocals."""
    stems = separate_stems(source_audio, cfg)
    bg = mix_background_music(stems, cfg)
    silences = detect_vocal_silences(stems["vocals"], cfg)
    trimmed = trim_vocal_silence(stems["vocals"], cfg)
    log.info("Stems done. %d silence region(s) removed from vocals.", len(silences))
    return StemArtifacts(
        stems=stems,
        background_music=bg,
        vocals_trimmed=trimmed,
        silence_regions=silences,
    )
