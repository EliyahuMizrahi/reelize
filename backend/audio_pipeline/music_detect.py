"""Adaptive music-presence detection on the background-music stem.

We extract three signals per frame (RMS, spectral tonality, harmonic+percussive
energy) and fit a 2-component GMM to classify each frame as music-or-not. The
output is a list of (start, end) regions where music is playing.

This prevents Shazam from hallucinating matches on silent parts and prevents
song-offset extrapolation across gaps.
"""
from __future__ import annotations

import logging
from pathlib import Path

import librosa
import numpy as np
from scipy.ndimage import binary_closing, binary_opening
from sklearn.mixture import GaussianMixture

from .config import PipelineConfig

log = logging.getLogger(__name__)

_FRAME = 4096
_HOP = 2048
_HPSS_CHUNK_SECONDS = 60.0   # cap STFT+HPSS memory on long inputs


def _robust_norm(x: np.ndarray) -> np.ndarray:
    """Normalise to ~[0,1] via p95 — robust to single-frame outliers."""
    return np.clip(x / (np.percentile(x, 95) + 1e-10), 0, 1)


def _chunked_hpss_energy(y: np.ndarray, sr: int) -> np.ndarray:
    """STFT + HPSS over `y`, processed in <=60s chunks to cap peak memory.

    Returns the per-frame (harmonic + percussive) magnitude sum, concatenated
    across chunks to match a single-pass STFT frame grid closely enough for
    downstream GMM classification.
    """
    chunk_samples = int(_HPSS_CHUNK_SECONDS * sr)
    if len(y) <= chunk_samples:
        S = np.abs(librosa.stft(y, n_fft=_FRAME, hop_length=_HOP))
        H, P = librosa.decompose.hpss(S)
        return H.sum(axis=0) + P.sum(axis=0)

    parts: list[np.ndarray] = []
    for start in range(0, len(y), chunk_samples):
        chunk = y[start:start + chunk_samples]
        if len(chunk) < _FRAME:
            break  # too short for STFT — skip residual tail
        S = np.abs(librosa.stft(chunk, n_fft=_FRAME, hop_length=_HOP))
        H, P = librosa.decompose.hpss(S)
        parts.append(H.sum(axis=0) + P.sum(axis=0))
    return np.concatenate(parts) if parts else np.array([])


def detect_music_regions(
    background_music_path: Path,
    cfg: PipelineConfig,
) -> list[tuple[float, float]]:
    """Return regions (in seconds) of the BG stem where music is playing.

    Algorithm:
      1. Per-frame features: RMS, 1-spectral_flatness, H+P energy
      2. Fit a 2-component GMM over the 3D feature vectors
      3. Label the higher-RMS cluster as "music"
      4. Smooth with morphological opening/closing
      5. Drop regions shorter than cfg.min_music_region
    """
    sr = cfg.analysis_sample_rate
    y, _ = librosa.load(str(background_music_path), sr=sr, mono=True)

    rms = librosa.feature.rms(y=y, frame_length=_FRAME, hop_length=_HOP)[0]
    flatness = librosa.feature.spectral_flatness(y=y, n_fft=_FRAME, hop_length=_HOP)[0]

    # HPSS is O(n) memory; chunk on long inputs so we don't OOM on 5+ minute clips.
    hp_raw = _chunked_hpss_energy(y, sr)

    # Defensive: reconcile frame-count mismatch between rms/flatness (single-pass)
    # and hp_raw (chunked). Trim all three to the shortest so GMM input is square.
    n_frames = min(len(rms), len(flatness), len(hp_raw)) if len(hp_raw) else 0
    if n_frames == 0:
        log.warning("music_detect: empty feature frames; returning no regions")
        return []
    rms = rms[:n_frames]
    flatness = flatness[:n_frames]
    hp_raw = hp_raw[:n_frames]

    rms_n = _robust_norm(rms)
    tonal_n = 1.0 - np.clip(flatness, 0, 1)
    hp_n = _robust_norm(hp_raw)

    features = np.column_stack([rms_n, tonal_n, hp_n])
    gmm = GaussianMixture(n_components=2, random_state=0, n_init=3).fit(features)
    labels = gmm.predict(features)

    cluster_rms = [features[labels == i, 0].mean() for i in range(2)]
    music_cluster = int(np.argmax(cluster_rms))
    cluster_gap = abs(cluster_rms[0] - cluster_rms[1])

    if cluster_gap < 0.1:
        log.warning(
            "GMM cluster RMS means too close (gap=%.3f); falling back to percentile threshold",
            cluster_gap,
        )
        is_music = rms_n > np.percentile(rms_n, 30)
    else:
        is_music = labels == music_cluster
        log.info(
            "GMM cluster RMS — music: %.3f, not-music: %.3f",
            cluster_rms[music_cluster], cluster_rms[1 - music_cluster],
        )

    # Morphological smoothing: require min region duration, bridge small gaps.
    is_music = binary_opening(is_music, structure=np.ones(cfg.vad_opening_frames))
    is_music = binary_closing(is_music, structure=np.ones(cfg.vad_closing_frames))

    frame_times = librosa.frames_to_time(np.arange(len(is_music)), sr=sr, hop_length=_HOP)
    regions: list[tuple[float, float]] = []
    in_region = False
    start_t = 0.0
    for t, m in zip(frame_times, is_music):
        if m and not in_region:
            start_t, in_region = float(t), True
        elif not m and in_region:
            if t - start_t >= cfg.min_music_region:
                regions.append((round(start_t, 2), round(float(t), 2)))
            in_region = False
    if in_region and frame_times[-1] - start_t >= cfg.min_music_region:
        regions.append((round(start_t, 2), round(float(frame_times[-1]), 2)))

    log.info("Detected %d music region(s)", len(regions))
    return regions
