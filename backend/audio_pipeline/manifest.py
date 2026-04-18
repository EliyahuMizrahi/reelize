"""Assemble the final manifest.json — the single entry point for downstream agents."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .config import PipelineConfig
from .diarize import DiarizationResult
from .rhythm import RhythmArtifacts
from .sfx import SFXEvent
from .shazam_id import MusicSection
from .stems import StemArtifacts
from .transcribe import TranscriptArtifacts
from .utils import run_ffprobe_duration, write_json

log = logging.getLogger(__name__)


@dataclass
class Inputs:
    """All artifacts the manifest assembler needs."""
    source_url: str
    source_audio: Path
    stems: StemArtifacts
    transcript: TranscriptArtifacts
    diarization: DiarizationResult | None
    music_regions: list[tuple[float, float]]
    sections: list[MusicSection]
    rhythm: RhythmArtifacts
    sfx: list[SFXEvent]


def _enrich_sections(
    sections: list[MusicSection],
    rhythm: RhythmArtifacts,
) -> list[dict]:
    """Add per-section fields that are cheap for us to compute but costly for the agent."""
    out = []
    beats = np.array(rhythm.beats)
    hz = rhythm.energy_envelope_hz
    env = rhythm.energy_envelope

    for sec in sections:
        d = sec.to_dict()

        # Beats that fall inside this section
        in_beats = beats[(beats >= sec.video_start) & (beats <= sec.video_end)] if len(beats) else np.array([])
        d["beats"] = [round(float(b), 3) for b in in_beats]

        # Energy stats inside this section
        s_idx = int(sec.video_start * hz)
        e_idx = int(sec.video_end * hz)
        window = env[s_idx:e_idx]
        if len(window):
            d["energy"] = {
                "mean": round(float(window.mean()), 4),
                "max": round(float(window.max()), 4),
                "p95": round(float(np.percentile(window, 95)), 4),
            }
        else:
            d["energy"] = None

        out.append(d)
    return out


def build_manifest(inputs: Inputs, cfg: PipelineConfig) -> dict:
    """Write per-step JSON artifacts + top-level manifest.json. Returns the manifest dict."""
    out_dir = cfg.output_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── Transcript ─────────────────────────────────────────────
    transcript_path = out_dir / "transcript.json"
    write_json(transcript_path, [s.to_dict() for s in inputs.transcript.segments])

    words_path = out_dir / "words.json"
    write_json(words_path, [w.to_dict() for w in inputs.transcript.words])

    # ── Music sections (enriched) ──────────────────────────────
    enriched_sections = _enrich_sections(inputs.sections, inputs.rhythm)
    music_sections_path = out_dir / "music_sections.json"
    write_json(
        music_sections_path,
        {"music_regions": inputs.music_regions, "sections": enriched_sections},
    )

    # ── Beat grid ──────────────────────────────────────────────
    beat_grid_path = out_dir / "beat_grid.json"
    write_json(beat_grid_path, {"bpm": inputs.rhythm.bpm, "beats": inputs.rhythm.beats})

    # ── SFX manifest ───────────────────────────────────────────
    sfx_manifest_path = cfg.sfx_dir / "sfx_manifest.json"
    write_json(sfx_manifest_path, [s.to_dict() for s in inputs.sfx])

    # ── Top-level manifest ─────────────────────────────────────
    manifest = {
        "source": {
            "url": inputs.source_url,
            "audio": str(inputs.source_audio),
            "duration": round(run_ffprobe_duration(inputs.source_audio), 2),
        },
        "stems": {
            **{k: str(v) for k, v in inputs.stems.stems.items()},
            "background": str(inputs.stems.background_music),
            "vocals_trimmed": str(inputs.stems.vocals_trimmed),
        },
        "transcript": {
            "segments_file": str(transcript_path),
            "words_file": str(words_path),
            "num_segments": len(inputs.transcript.segments),
            "num_words": len(inputs.transcript.words),
            "num_speakers": (inputs.diarization.num_speakers if inputs.diarization else 1),
        },
        "music": {
            "file": str(music_sections_path),
            "regions": inputs.music_regions,
            "sections": enriched_sections,
        },
        "rhythm": {
            "bpm": inputs.rhythm.bpm,
            "beats_file": str(beat_grid_path),
            "num_beats": len(inputs.rhythm.beats),
        },
        "energy": {
            "envelope_file": str(inputs.rhythm.energy_envelope_path),
            "sample_rate_hz": inputs.rhythm.energy_envelope_hz,
            "num_samples": len(inputs.rhythm.energy_envelope),
        },
        "sfx": {
            "manifest_file": str(sfx_manifest_path),
            "count": len(inputs.sfx),
            "items": [s.to_dict() for s in inputs.sfx],
        },
    }
    write_json(cfg.manifest_path, manifest)
    log.info("Manifest written: %s", cfg.manifest_path)
    return manifest
