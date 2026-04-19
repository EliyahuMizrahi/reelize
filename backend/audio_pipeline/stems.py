"""Demucs stem separation + background-music mix + vocal-silence trim."""
from __future__ import annotations

import functools
import logging
import re
import subprocess
import sys
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
    log.info("Running Demucs (%s, device=%s)...", cfg.demucs_model, cfg.device)
    try:
        result = subprocess.run(
            [
                sys.executable, "-m", "demucs",
                "-n", cfg.demucs_model,
                "-d", cfg.device,
                "-o", str(cfg.stems_dir),
                str(source_audio),
            ],
            capture_output=True,
            text=True,
            timeout=600,
        )
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(
            f"demucs timed out after {e.timeout}s on {source_audio}"
        ) from e
    if result.returncode != 0:
        # Persist full output — demucs spams long torchcodec/ffmpeg warnings
        # that push the real error past any tail-truncation budget.
        full = (
            "=== demucs stderr ===\n" + (result.stderr or "") +
            "\n=== demucs stdout ===\n" + (result.stdout or "")
        )
        log_path = cfg.output_dir / "demucs_error.log"
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(full, encoding="utf-8")
        except Exception as write_err:  # noqa: BLE001
            log.warning("failed to write demucs error log: %s", write_err)
        stderr = (result.stderr or "").strip()
        head = stderr[:1500]
        tail = stderr[-1500:] if len(stderr) > 1500 else ""
        raise RuntimeError(
            f"demucs exited {result.returncode} (device={cfg.device}); "
            f"full log: {log_path}\n"
            f"--- stderr head ---\n{head}\n"
            f"--- stderr tail ---\n{tail}"
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

    Whisper sees the trimmed audio (silences removed); its timestamps live on a
    contiguous "trimmed timeline". We need to map them back to the original
    video timeline, where the kept windows are separated by the removed silences.

    Algorithm — explicit piecewise-linear map:
      Build the list of kept (original-time) `(start, end)` windows by inverting
      the silences. Track `consumed_trimmed_duration = 0`. For each kept window
      `(o_start, o_end)` of duration `d = o_end - o_start`: any trimmed-time `t`
      in `[consumed_trimmed_duration, consumed_trimmed_duration + d]` maps to
      `o_start + (t - consumed_trimmed_duration)`. Then advance
      `consumed_trimmed_duration += d`.

    If `t_trimmed` exceeds the total kept duration (rounding slop at the tail),
    we clamp to the end of the last kept window.
    """
    # Sort silences defensively; ffmpeg emits them in order but make no assumption.
    sorted_silences = sorted(
        (
            (float(s), float(e))
            for s, e in silences
            if float(e) > float(s)
        ),
        key=lambda se: se[0],
    )

    # Invert silences → kept windows. We don't know the total duration, so the
    # final kept window is open-ended to +inf; in practice we only query
    # timestamps inside the audio, so the open tail handles any t_trimmed.
    kept: list[tuple[float, float]] = []
    cursor = 0.0
    for s_start, s_end in sorted_silences:
        if s_start > cursor:
            kept.append((cursor, s_start))
        cursor = max(cursor, s_end)
    # Trailing open window after the last silence.
    kept.append((cursor, float("inf")))

    def trimmed_to_original(t_trimmed: float) -> float:
        if t_trimmed < 0:
            return t_trimmed  # Shouldn't happen; pass through.
        consumed = 0.0
        last_o_end = 0.0
        for o_start, o_end in kept:
            d = o_end - o_start
            if t_trimmed <= consumed + d:
                return o_start + (t_trimmed - consumed)
            consumed += d
            last_o_end = o_end
        # Fell past every finite window — clamp to the last finite boundary.
        return last_o_end

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
