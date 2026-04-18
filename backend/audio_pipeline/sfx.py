"""Sound-effect extraction via multi-signal consensus.

Algorithm:
  1. For each music section, cross-correlate the BG stem with the downloaded
     full song to find sample-accurate alignment.
  2. Find candidate events = strong onset peaks in the FULL mix.
  3. Reject candidates whose timing is already explained by the song's own
     onsets (those are just drums, not SFX).
  4. Require candidates to land near a beat (real edit SFX are beat-placed).
  5. Keep the top-K strongest, capped at cfg.sfx_max_count.
  6. Extract each as a short WAV from the BG stem.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.signal import find_peaks

from .config import PipelineConfig
from .download import download_song
from .shazam_id import MusicSection

log = logging.getLogger(__name__)

_N_FFT = 2048
_HOP_STFT = 512
_SEARCH_MARGIN = 5.0   # seconds of slack around Shazam's reported offset


@dataclass
class SFXEvent:
    path: Path
    video_time: float
    section_idx: int
    strength: float
    beat_offset: float | None
    duration: float

    def to_dict(self) -> dict:
        return {
            "path": str(self.path),
            "video_time": self.video_time,
            "section_idx": self.section_idx,
            "strength": self.strength,
            "beat_offset": self.beat_offset,
            "duration": self.duration,
        }


def _align_section(
    section: MusicSection,
    song_path: Path,
    y_bg_full: np.ndarray,
    sr: int,
) -> tuple[float, float, float]:
    """Cross-correlate a section against the downloaded song; return (exact_offset, correction, gain)."""
    bg_s = int(section.video_start * sr)
    bg_e = int(section.video_end * sr)
    bg_chunk = y_bg_full[bg_s:bg_e]

    search_start = max(0, section.song_offset_start - _SEARCH_MARGIN)
    search_dur = (section.video_end - section.video_start) + 2 * _SEARCH_MARGIN
    y_song_wide, _ = librosa.load(
        str(song_path), sr=sr, mono=True,
        offset=search_start, duration=search_dur,
    )

    ref_len = min(len(bg_chunk), sr * 5)
    corr = np.correlate(y_song_wide, bg_chunk[:ref_len], mode="valid")
    best = int(np.argmax(np.abs(corr)))
    exact_offset = search_start + best / sr

    # Gain match: align the song's RMS to the BG chunk's RMS.
    y_song, _ = librosa.load(
        str(song_path), sr=sr, mono=True,
        offset=exact_offset, duration=len(bg_chunk) / sr,
    )
    n = min(len(bg_chunk), len(y_song))
    rms_bg = float(np.sqrt(np.mean(bg_chunk[:n] ** 2)) + 1e-10)
    rms_song = float(np.sqrt(np.mean(y_song[:n] ** 2)) + 1e-10)
    return exact_offset, exact_offset - section.song_offset_start, rms_bg / rms_song


def _predict_song_onsets(
    section: MusicSection,
    song_path: Path,
    sr: int,
) -> np.ndarray:
    """Return the timestamps (in video time) at which the song itself has strong onsets."""
    bg_len = int((section.video_end - section.video_start) * sr)
    if section.exact_offset is None:
        return np.array([])
    y_song, _ = librosa.load(
        str(song_path), sr=sr, mono=True,
        offset=section.exact_offset, duration=bg_len / sr,
    )
    onset = librosa.onset.onset_strength(y=y_song, sr=sr, hop_length=_HOP_STFT)
    onset_n = onset / (onset.max() + 1e-10)
    peaks, _ = find_peaks(
        onset_n,
        height=np.percentile(onset_n, 90),
        distance=int(0.2 * sr / _HOP_STFT),
    )
    times_rel = librosa.frames_to_time(peaks, sr=sr, hop_length=_HOP_STFT)
    return times_rel + section.video_start


def _find_full_mix_candidates(source_audio: Path, sr: int, cfg: PipelineConfig) -> list[dict]:
    """Stage 2: find all strong onset peaks in the full mix."""
    y, _ = librosa.load(str(source_audio), sr=sr, mono=True)
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=_HOP_STFT)
    onset_n = onset / (onset.max() + 1e-10)
    times = librosa.frames_to_time(np.arange(len(onset)), sr=sr, hop_length=_HOP_STFT)
    peaks, _ = find_peaks(
        onset_n,
        height=np.percentile(onset_n, cfg.sfx_onset_percentile),
        prominence=0.15,
        distance=int(cfg.sfx_min_gap * sr / _HOP_STFT),
    )
    return [{"time": float(times[p]), "strength": float(onset_n[p])} for p in peaks]


def extract_sfx(
    sections: list[MusicSection],
    background_music: Path,
    source_audio: Path,
    beats: list[float],
    cfg: PipelineConfig,
) -> list[SFXEvent]:
    """Full SFX pipeline. Mutates `sections` to record alignment info per section.

    Returns a sorted (by time) list of SFXEvent.
    """
    sr = cfg.analysis_sample_rate
    y_bg_full, _ = librosa.load(str(background_music), sr=sr, mono=True)
    cfg.sfx_dir.mkdir(parents=True, exist_ok=True)

    # ── Download + align each section ─────────────────────────────
    for sec in sections:
        song_path = download_song(sec.artist, sec.song, sec.song_id, cfg)
        if song_path is None:
            log.warning("Skipping alignment for '%s - %s' (download failed)", sec.artist, sec.song)
            continue
        sec.full_song_path = str(song_path)
        exact_offset, correction, gain = _align_section(sec, song_path, y_bg_full, sr)
        sec.exact_offset = round(exact_offset, 3)
        sec.alignment_correction = round(correction, 3)
        sec.gain = round(gain, 3)
        log.info(
            "Aligned '%s - %s': offset=%.3fs (correction %+.3fs)",
            sec.artist, sec.song, exact_offset, correction,
        )

    # ── Stage 2: full-mix onset candidates ─────────────────────────
    candidates = _find_full_mix_candidates(source_audio, sr, cfg)
    log.info("Stage 2: %d onset candidates", len(candidates))

    # ── Stage 3: exclude onsets explained by the song ──────────────
    predicted_onsets: list[float] = []
    for sec in sections:
        if sec.full_song_path is None:
            continue
        predicted_onsets.extend(
            _predict_song_onsets(sec, Path(sec.full_song_path), sr).tolist()
        )
    predicted = np.array(sorted(predicted_onsets))

    unexplained = []
    for c in candidates:
        if len(predicted) == 0 or np.min(np.abs(predicted - c["time"])) >= cfg.sfx_song_tolerance:
            unexplained.append(c)
    log.info("Stage 3: %d unexplained by song", len(unexplained))

    # ── Stage 4: require beat alignment ────────────────────────────
    beat_arr = np.array(beats) if beats else np.array([])
    on_beat = []
    for c in unexplained:
        if len(beat_arr) == 0:
            c["beat_offset"] = None
            on_beat.append(c)
            continue
        dist = float(np.min(np.abs(beat_arr - c["time"])))
        if dist < cfg.sfx_beat_tolerance:
            c["beat_offset"] = round(dist, 3)
            on_beat.append(c)
    log.info("Stage 4: %d on-beat", len(on_beat))

    # ── Stage 5: top-K by strength ────────────────────────────────
    on_beat.sort(key=lambda c: -c["strength"])
    final = sorted(on_beat[: cfg.sfx_max_count], key=lambda c: c["time"])
    log.info("Stage 5: %d SFX (capped at %d)", len(final), cfg.sfx_max_count)

    # ── Stage 6: extract each to disk ──────────────────────────────
    events: list[SFXEvent] = []
    for idx, c in enumerate(final):
        t = c["time"]
        s = max(0, int((t - cfg.sfx_pre) * sr))
        e = min(len(y_bg_full), int((t + cfg.sfx_post) * sr))
        clip = y_bg_full[s:e]
        path = cfg.sfx_dir / f"sfx_{idx:02d}.wav"
        sf.write(str(path), clip, sr)

        # Which section does this SFX live in?
        section_idx = -1
        for i, sec in enumerate(sections):
            if sec.video_start <= t <= sec.video_end:
                section_idx = i
                break

        events.append(SFXEvent(
            path=path,
            video_time=round(float(t), 3),
            section_idx=section_idx,
            strength=round(float(c["strength"]), 3),
            beat_offset=c.get("beat_offset"),
            duration=round((e - s) / sr, 3),
        ))

    log.info("Extracted %d SFX", len(events))
    return events
