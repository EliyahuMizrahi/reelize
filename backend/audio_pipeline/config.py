"""All tunable parameters for the pipeline in one place."""
from dataclasses import dataclass, field
from pathlib import Path
import os


@dataclass
class PipelineConfig:
    # ── Output ─────────────────────────────────────────────────
    output_dir: str | Path = "output"

    # ── Auth ───────────────────────────────────────────────────
    # pyannote needs a HuggingFace token with access to
    # pyannote/speaker-diarization-community-1. Defaults to $HF_TOKEN.
    hf_token: str | None = field(default_factory=lambda: os.environ.get("HF_TOKEN"))

    # ── Compute ────────────────────────────────────────────────
    # "cuda" strongly recommended; "cpu" works but is 10-50x slower.
    device: str = "cuda"

    # ── Audio ──────────────────────────────────────────────────
    source_sample_rate: int = 16000   # Whisper/pyannote friendly
    analysis_sample_rate: int = 44100 # librosa analysis

    # ── Whisper ────────────────────────────────────────────────
    whisper_model: str = "large-v3"

    # ── Diarization ────────────────────────────────────────────
    max_speakers: int = 5
    enable_diarization: bool = True

    # ── Demucs ─────────────────────────────────────────────────
    # htdemucs_ft gives the cleanest vocal isolation.
    demucs_model: str = "htdemucs_ft"

    # ── Silence detection for vocal trim ───────────────────────
    silence_threshold_db: float = -40.0
    silence_min_duration: float = 0.5

    # ── Music-presence VAD ─────────────────────────────────────
    # Shortest music region to keep (seconds).
    min_music_region: float = 1.0
    # Morphological smoothing (in frames at HOP=2048 / 44100 ≈ 46ms/frame).
    vad_opening_frames: int = 5      # ~230ms — min region duration
    vad_closing_frames: int = 10     # ~460ms — max gap to bridge

    # ── Shazam ─────────────────────────────────────────────────
    shazam_coarse_chunk: float = 15.0   # seconds
    shazam_slide_step: float = 1.0      # seconds — fine pass step
    shazam_linear_tol: float = 3.0      # seconds — offset linearity tolerance
    shazam_rate_limit: float = 0.3      # seconds between Shazam calls

    # ── SFX detection ──────────────────────────────────────────
    sfx_onset_percentile: float = 95.0  # top-X% of onset frames qualify
    sfx_min_gap: float = 1.0            # seconds between SFX candidates
    sfx_song_tolerance: float = 0.3     # candidate within Xs of song onset = rejected
    sfx_beat_tolerance: float = 0.2     # candidate within Xs of a beat to keep
    sfx_max_count: int = 8              # hard cap
    sfx_pre: float = 0.15               # seconds before peak to include
    sfx_post: float = 0.60              # seconds after peak to include

    # ── Beat/energy ────────────────────────────────────────────
    energy_envelope_hz: int = 10

    # ── Housekeeping ───────────────────────────────────────────
    # Delete the Shazam chunk dir at the end of the run.
    cleanup_chunks: bool = True

    def __post_init__(self) -> None:
        self.output_dir = Path(self.output_dir)

    # ── Derived paths (computed lazily; never written without mkdir) ──
    @property
    def source_audio_path(self) -> Path:
        return self.output_dir / "source.wav"

    @property
    def stems_dir(self) -> Path:
        return self.output_dir / "stems"

    @property
    def background_music_path(self) -> Path:
        return self.output_dir / "background_music.wav"

    @property
    def vocals_trimmed_path(self) -> Path:
        return self.output_dir / "vocals_trimmed.wav"

    @property
    def songs_dir(self) -> Path:
        return self.output_dir / "songs"

    @property
    def sfx_dir(self) -> Path:
        return self.output_dir / "sfx"

    @property
    def chunks_dir(self) -> Path:
        return self.output_dir / "chunks"

    @property
    def manifest_path(self) -> Path:
        return self.output_dir / "manifest.json"
