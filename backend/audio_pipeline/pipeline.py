"""Top-level orchestrator. `Pipeline(cfg).run(url)` is the one entry point."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

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
        stems = process_stems(source_audio, cfg)

        # 3. Transcribe (Whisper on trimmed vocals; remap to original timeline)
        trimmed_to_orig = make_trimmed_to_original(stems.silence_regions)
        transcript = transcribe(stems.vocals_trimmed, cfg, trimmed_to_original=trimmed_to_orig)

        # 4. Diarize (on the ORIGINAL audio — silence removal breaks pyannote)
        diar_result: DiarizationResult | None = None
        if cfg.enable_diarization:
            diar_result = diarize(source_audio, cfg)
            attach_speakers(transcript, diar_result)

        # 5. Music-presence VAD
        music_regions = detect_music_regions(stems.background_music, cfg)

        # 6. Shazam per region
        identifier = ShazamIdentifier(stems.background_music, cfg)
        sections = await identifier.identify(music_regions)

        # 7. Rhythm (beat grid + energy envelope)
        rhythm = compute_rhythm(stems.background_music, source_audio, cfg)

        # 8. SFX extraction (also downloads full songs + aligns per section)
        sfx_events = extract_sfx(
            sections, stems.background_music, source_audio, rhythm.beats, cfg,
        )

        # 9. Manifest
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
