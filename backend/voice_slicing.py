"""Per-speaker voice-clone sample extraction.

Given a clean vocals WAV and diarization turns, emit one short opus clip per
speaker, suitable as a zero-shot-TTS reference (XTTS, F5, ElevenLabs IVC).
"""
from __future__ import annotations

import logging
from pathlib import Path

from media import concat_wavs, encode_opus, slice_wav

log = logging.getLogger(__name__)


def build_voice_samples(
    vocals_wav: Path,
    diarization_turns: list[dict],
    out_dir: Path,
    max_seconds_per_speaker: float = 30.0,
    min_turn_duration: float = 1.0,
    max_turns: int = 3,
    opus_bitrate_kbps: int = 24,
) -> dict[str, Path]:
    """Return {speaker_label: path to opus sample} for each detected speaker.

    Algorithm: group turns by speaker → pick the N longest "clean" turns (those
    above `min_turn_duration`) → slice each from the vocals WAV → concat in
    chronological order → cap total length at `max_seconds_per_speaker` →
    transcode to Opus for cheap storage.
    """
    if not vocals_wav.exists() or not diarization_turns:
        return {}

    out_dir.mkdir(parents=True, exist_ok=True)

    by_speaker: dict[str, list[dict]] = {}
    for t in diarization_turns:
        spk = t.get("speaker")
        start = t.get("start")
        end = t.get("end")
        if spk is None or start is None or end is None:
            continue
        dur = float(end) - float(start)
        if dur < min_turn_duration:
            continue
        by_speaker.setdefault(spk, []).append(
            {"start": float(start), "end": float(end), "duration": dur}
        )

    results: dict[str, Path] = {}
    for speaker, turns in by_speaker.items():
        # Take the N longest turns (they tend to be the cleanest), then put
        # them back in chronological order for the concat.
        turns.sort(key=lambda x: x["duration"], reverse=True)
        picked = sorted(turns[:max_turns], key=lambda x: x["start"])

        slices: list[Path] = []
        remaining = max_seconds_per_speaker
        for i, turn in enumerate(picked):
            if remaining <= 0.5:
                break
            take = min(turn["duration"], remaining)
            slice_path = out_dir / f"{speaker}_slice_{i:02d}.wav"
            try:
                slice_wav(vocals_wav, slice_path, turn["start"], take)
                slices.append(slice_path)
                remaining -= take
            except Exception as e:
                log.warning("slice failed for %s turn %d: %s", speaker, i, e)

        if not slices:
            continue

        concat_path = out_dir / f"{speaker}_concat.wav"
        try:
            if len(slices) == 1:
                slices[0].replace(concat_path)
                slices = []
            else:
                concat_wavs(slices, concat_path)
        except Exception as e:
            log.warning("concat failed for %s: %s; using first slice", speaker, e)
            slices[0].replace(concat_path)
            slices = slices[1:]

        for s in slices:
            s.unlink(missing_ok=True)

        opus_path = out_dir / f"{speaker}.opus"
        try:
            encode_opus(concat_path, opus_path, bitrate_kbps=opus_bitrate_kbps, channels=1)
            concat_path.unlink(missing_ok=True)
            results[speaker] = opus_path
        except Exception as e:
            log.warning("opus encode failed for %s: %s", speaker, e)

    return results
