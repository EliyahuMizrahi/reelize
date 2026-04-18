"""Audio Pipeline — extract style features from short-form video audio.

Typical usage:

    from audio_pipeline import Pipeline, PipelineConfig

    cfg = PipelineConfig(output_dir="runs/abc123")
    pipe = Pipeline(cfg)
    manifest = await pipe.run("https://youtube.com/shorts/xyz")

    # manifest is a dict ready to hand to Gemini / another agent.
    # All heavy artifacts (stems, songs, sfx wavs) live under cfg.output_dir.

The Pipeline can also be run from the command line:

    python -m audio_pipeline "https://youtube.com/shorts/xyz" -o runs/abc123
"""

from .config import PipelineConfig
from .pipeline import Pipeline

__all__ = ["Pipeline", "PipelineConfig"]
__version__ = "0.1.0"
