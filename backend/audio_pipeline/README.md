# audio_pipeline

Extract style features from a short-form video (YouTube Short, TikTok, Reel) so a downstream agent can generate a video that matches the source's *feel*.

Produces, for a URL:

- **Stems** — vocals / drums / bass / other (Demucs)
- **Transcript** — word-level timestamps, per-speaker (Whisper + pyannote)
- **Music sections** — identified songs with per-section video↔song time anchors (Shazam with linear-offset consensus; robust to glitch matches)
- **Full songs** — downloaded via `ytsearch1:` for each identified track
- **Beat grid** — BPM + per-beat timestamps (librosa)
- **Energy envelope** — 10 Hz RMS "hype curve" of the full mix
- **SFX** — extracted sound effects (multi-signal consensus: onset strength ∧ not-explained-by-song ∧ on-beat)
- **manifest.json** — single entry-point file that indexes everything; hand this to Gemini

## Install

```bash
pip install -r audio_pipeline/requirements.txt
# System deps: ffmpeg, node (for yt-dlp extractors that need it)
```

You also need:
- `HF_TOKEN` env var with a HuggingFace token. Accept the model terms at
  <https://huggingface.co/pyannote/speaker-diarization-community-1> first.
- `cuda`-capable GPU strongly recommended.

## Use

```bash
python -m audio_pipeline "https://youtube.com/shorts/abc123" -o runs/abc123
```

Or from Python:

```python
import asyncio
from audio_pipeline import Pipeline, PipelineConfig

cfg = PipelineConfig(output_dir="runs/abc123")
pipe = Pipeline(cfg)
manifest = asyncio.run(pipe.run("https://youtube.com/shorts/abc123"))

# manifest is a dict; everything you need is either inline or pointed to by
# file path. Hand it to Gemini / your agent.
```

## Output layout

```
runs/abc123/
  manifest.json              ← start here
  source.wav                 ← original audio, 16 kHz mono
  background_music.wav       ← drums + bass + other mixed
  vocals_trimmed.wav         ← silence-removed vocals (for Whisper)
  transcript.json            ← segments with speaker + original-timeline timestamps
  words.json                 ← word-level timestamps
  music_sections.json        ← sections with `song_time_base` for time conversion
  beat_grid.json             ← BPM + beats
  energy_envelope.npy        ← numpy array, 10 Hz
  stems/htdemucs_ft/source/  ← demucs output
  songs/
    section_0.wav            ← BG stem trimmed to section i
    full_<song_id>.wav       ← full downloaded song
  sfx/
    sfx_00.wav               ← extracted SFX clips
    sfx_manifest.json        ← timings + strengths
```

## Using `song_time_base` for time conversion

Each music section has `song_offset = video_time + song_time_base`. So if the
agent wants to know "what point in the song plays at video time 34.5s" within
section `s`:

```python
song_t = 34.5 + s["song_time_base"]
```

## Stages — independently callable

`Pipeline.run()` is convenience. For surgical debugging, import each module:

```python
from audio_pipeline.download import download_source_audio
from audio_pipeline.stems import process_stems
from audio_pipeline.music_detect import detect_music_regions
# ...etc
```

## Notes

- **No Colab/Jupyter dependencies.** No `display`, no POT provider — that was a
  Colab-specific yt-dlp workaround; on a normal host, yt-dlp works fine.
- **All config is in `PipelineConfig`.** Every threshold and tunable is there —
  no magic numbers scattered through the code.
- **Per-section alignment runs inside the SFX stage.** The alignment corrections
  are written back onto each `MusicSection`, so the manifest carries them.
