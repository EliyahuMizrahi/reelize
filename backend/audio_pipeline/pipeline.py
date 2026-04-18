"""Top-level orchestrator. `Pipeline(cfg).run(url)` is the one entry point."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any, Optional

from .config import PipelineConfig
from .diarize import DiarizationResult, attach_speakers, diarize
from .download import download_source_audio
from .manifest import Inputs, build_manifest
from .music_detect import detect_music_regions
from .rhythm import compute_rhythm
from .sfx import extract_sfx
from .shazam_id import ShazamIdentifier
from .stems import make_trimmed_to_original, process_stems
from .transcribe import transcribe

log = logging.getLogger(__name__)


def _emit(cfg: PipelineConfig, event_type: str, message: str,
          data: Optional[dict[str, Any]] = None) -> None:
    """Forward one progress event through the worker's callback, if any."""
    if cfg.progress_callback is not None:
        try:
            cfg.progress_callback(event_type, message, data)
        except Exception as e:  # noqa: BLE001 — telemetry must never crash the run
            log.warning("progress_callback raised (swallowed): %s", e)


class Pipeline:
    """Extract style features from a short-form video URL.

    Each stage is independent — if you need to intervene (debug one stage,
    swap a model, etc.), run them yourself instead of `run()`.
    """

    def __init__(self, cfg: PipelineConfig | None = None) -> None:
        self.cfg = cfg or PipelineConfig()
        self.cfg.output_dir.mkdir(parents=True, exist_ok=True)

    async def run(self, url: str, local_audio: Path | None = None) -> dict:
        """Download → analyze → return manifest dict. Heavy artifacts live on disk.

        If local_audio is given, skip the yt-dlp source download and use that
        WAV instead. The URL is still used downstream for song-search queries,
        so pass the original URL when available, or any string for uploads.
        """
        cfg = self.cfg

        # 1. Source audio (skip download if caller pre-extracted it)
        if local_audio is not None:
            cfg.source_audio_path.parent.mkdir(parents=True, exist_ok=True)
            if Path(local_audio).resolve() != cfg.source_audio_path.resolve():
                shutil.copy(local_audio, cfg.source_audio_path)
            source_audio = cfg.source_audio_path
        else:
            source_audio = download_source_audio(url, cfg)

        # 2. Stems (separation + BG mix + vocal trim)
        _emit(cfg, "audio.stems.start", "Separating audio stems (demucs)")
        stems = process_stems(source_audio, cfg)
        _emit(
            cfg, "audio.stems.done",
            f"Stems ready ({len(stems.stems)} tracks, "
            f"{len(stems.silence_regions)} silences removed)",
            {
                "stem_count": len(stems.stems),
                "silence_regions": len(stems.silence_regions),
            },
        )

        # 3. Transcribe (Whisper on trimmed vocals; remap to original timeline)
        _emit(cfg, "audio.transcribe.start", f"Transcribing ({cfg.whisper_model})")
        trimmed_to_orig = make_trimmed_to_original(stems.silence_regions)
        transcript = transcribe(stems.vocals_trimmed, cfg, trimmed_to_original=trimmed_to_orig)
        _emit(
            cfg, "audio.transcribe.done",
            f"Transcribed {len(transcript.segments)} segment(s), "
            f"{len(transcript.words)} word(s)",
            {
                "segments": len(transcript.segments),
                "words": len(transcript.words),
            },
        )

        # 4. Diarize (on the ORIGINAL audio — silence removal breaks pyannote)
        diar_result: DiarizationResult | None = None
        if cfg.enable_diarization:
            _emit(cfg, "audio.diarize.start", "Identifying speakers")
            diar_result = diarize(source_audio, cfg)
            attach_speakers(transcript, diar_result)
            _emit(
                cfg, "audio.diarize.done",
                f"Detected {diar_result.num_speakers} speaker(s) "
                f"across {len(diar_result.turns)} turn(s)",
                {
                    "num_speakers": diar_result.num_speakers,
                    "turn_count": len(diar_result.turns),
                },
            )

        # 5. Music-presence VAD
        _emit(cfg, "audio.music.start", "Detecting music regions")
        music_regions = detect_music_regions(stems.background_music, cfg)
        _emit(
            cfg, "audio.music.done",
            f"Found {len(music_regions)} music region(s)",
            {"region_count": len(music_regions)},
        )

        # 6. Shazam per region
        _emit(cfg, "audio.shazam.start", f"Identifying songs ({len(music_regions)} region(s))")
        identifier = ShazamIdentifier(stems.background_music, cfg)
        sections = await identifier.identify(music_regions)
        _emit(
            cfg, "audio.shazam.done",
            f"Identified {len(sections)} song section(s)",
            {
                "section_count": len(sections),
                "songs": [
                    {"artist": s.artist, "title": s.song,
                     "start": s.video_start, "end": s.video_end}
                    for s in sections
                ],
            },
        )

        # 7. Rhythm (beat grid + energy envelope)
        _emit(cfg, "audio.rhythm.start", "Analyzing rhythm and energy")
        rhythm = compute_rhythm(stems.background_music, source_audio, cfg)
        _emit(
            cfg, "audio.rhythm.done",
            f"BPM {rhythm.bpm:.1f}, {len(rhythm.beats)} beat(s)",
            {"bpm": rhythm.bpm, "beat_count": len(rhythm.beats)},
        )

        # 8. SFX extraction (also downloads full songs + aligns per section)
        _emit(cfg, "audio.sfx.start", "Extracting SFX candidates")
        sfx_events = extract_sfx(
            sections, stems.background_music, source_audio, rhythm.beats, cfg,
        )
        _emit(
            cfg, "audio.sfx.done",
            f"Extracted {len(sfx_events)} SFX candidate(s)",
            {"sfx_count": len(sfx_events)},
        )

        # 9. Manifest
        _emit(cfg, "audio.manifest.start", "Building audio manifest")
        manifest = build_manifest(
            Inputs(
                source_url=url,
                source_audio=source_audio,
                stems=stems,
                transcript=transcript,
                diarization=diar_result,
                music_regions=music_regions,
                sections=sections,
                rhythm=rhythm,
                sfx=sfx_events,
            ),
            cfg,
        )

        # 10. Cleanup scratch dirs
        if cfg.cleanup_chunks and cfg.chunks_dir.exists():
            shutil.rmtree(cfg.chunks_dir, ignore_errors=True)

        return manifest
