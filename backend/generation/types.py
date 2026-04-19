"""Shared dataclasses for the generation pipeline.

These types define the contract between stages — each stage consumes one and
produces the next. Keep them flat + JSON-serializable so intermediate artifacts
can be persisted to Storage for debugging / reruns.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


# ── Input context ───────────────────────────────────────────────────────────

@dataclass
class GenerationContext:
    """Bundled inputs for a single generation run. Assembled in worker.py from
    the jobs + clips + templates rows."""
    job_id: str
    clip_id: str
    template_id: str
    user_id: str
    topic: str
    target_duration_s: float | None
    # Full template row contents — stages pluck what they need.
    style_dna: dict[str, Any]
    video_analysis: dict[str, Any]
    sfx_manifest: dict[str, Any] | None
    # Source job's artifact_prefix (so we can download the .opus voice samples
    # at artifacts.voices.{speaker}).
    source_artifact_prefix: str
    voice_sample_keys: dict[str, str]  # {"SPEAKER_00": "prefix/voices/SPEAKER_00.opus", ...}
    # Scratch dir for this generation (backend/tmp/gen/{clip_id}/).
    scratch: Path
    # Storage prefix for uploaded artifacts (generation/{clip_id}/).
    storage_prefix: str


# ── Stage 1: script ─────────────────────────────────────────────────────────

@dataclass
class ScriptTurn:
    """One speaker turn in the rewritten script. Durations approximate the
    source template's turn spacing so downstream pacing survives."""
    speaker: str           # e.g. "SPEAKER_00" — must match template's diarization label
    text: str
    start: float           # seconds, absolute on final timeline
    end: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


@dataclass
class GeneratedScript:
    turns: list[ScriptTurn]
    topic: str
    total_duration_s: float


# ── Stage 2: voices ─────────────────────────────────────────────────────────

@dataclass
class VoiceAssets:
    """ElevenLabs voice_ids per speaker, plus the local sample paths used to
    create them (so we can delete the voices later)."""
    voice_ids: dict[str, str]          # {"SPEAKER_00": "eleven_voice_id", ...}
    local_samples: dict[str, Path]     # downloaded from Storage for IVC upload


# ── Stage 3: TTS ────────────────────────────────────────────────────────────

@dataclass
class TTSChunk:
    """One rendered TTS audio file, aligned to a script turn."""
    turn_index: int
    speaker: str
    start: float
    end: float
    local_path: Path
    storage_key: str | None = None


# ── Stage 4: bg footage ─────────────────────────────────────────────────────

@dataclass
class BgFootageChoice:
    category: str                      # e.g. "minecraft_parkour"
    local_path: Path
    source_duration_s: float
    trim_in_s: float                   # where to start in source clip
    trim_out_s: float                  # must be >= target_duration_s


# ── Stage 5: timeline ───────────────────────────────────────────────────────

@dataclass
class TimelineSpec:
    """JSON-serializable spec handed to the Remotion composition.

    Schema is stable — Remotion side imports a TS mirror of this. Bumping
    ``schema_version`` requires updating both sides.
    """
    schema_version: int
    fps: int
    width: int
    height: int
    duration_s: float
    bg: dict[str, Any]                 # {"src": "...", "trim_in": 12.3}
    audio: list[dict[str, Any]]        # [{"src": "...", "start": 0, "end": 3.2, "speaker": "SPEAKER_00"}]
    captions: list[dict[str, Any]]     # [{"text": "...", "start": 0, "end": 1.2, "style": {...}}]
    sfx: list[dict[str, Any]]          # [{"src": "...", "at": 16.2, "gain": 0.8}]
    effects: list[dict[str, Any]]      # [{"type": "zoom_in", "at": 12.3, "dur": 0.4}]
    # Opaque style DNA reference so the composition can read caption styling, etc.
    style_dna: dict[str, Any]

    def to_json(self) -> dict[str, Any]:
        from dataclasses import asdict
        return asdict(self)


# ── Stage 6: render ─────────────────────────────────────────────────────────

@dataclass
class RenderResult:
    local_path: Path
    duration_s: float
    width: int
    height: int


# ── Stage 7: verify ─────────────────────────────────────────────────────────

@dataclass
class VerifyReport:
    """Gemini's judgment of a rendered clip vs the source style DNA."""
    score: float                       # 0..1, higher is better
    passed: bool
    issues: list[dict[str, Any]] = field(default_factory=list)
    # Each issue: {"kind": "audio_desync"|"caption_cut_off"|..., "detail": "...",
    #              "fix_hint": "...", "severity": "low"|"med"|"high"}
    notes: str = ""


# ── Event stage/type constants ──────────────────────────────────────────────
# Keep these stable — frontend useJobStream dispatches on them.

class Stage:
    SCRIPT = "gen.script"
    VOICE = "gen.voice"
    TTS = "gen.tts"
    BG = "gen.bg"
    TIMELINE = "gen.timeline"
    RENDER = "gen.render"
    VERIFY = "gen.verify"
    REFINE = "gen.refine"
    UPLOAD = "gen.upload"
    DONE = "done"


class EventType:
    STARTED = "job.started"
    DONE = "job.done"
    FAILED = "job.failed"
    CANCELLED = "job.cancelled"

    SCRIPT_START = "gen.script.start"
    SCRIPT_DONE = "gen.script.done"

    VOICE_START = "gen.voice.start"
    VOICE_CLONED = "gen.voice.cloned"   # data: {speaker, voice_id}
    VOICE_DONE = "gen.voice.done"

    TTS_START = "gen.tts.start"
    TTS_PROGRESS = "gen.tts.progress"   # data: {done, total}
    TTS_DONE = "gen.tts.done"

    BG_START = "gen.bg.start"
    BG_DONE = "gen.bg.done"

    TIMELINE_DONE = "gen.timeline.done"

    RENDER_START = "gen.render.start"
    RENDER_PROGRESS = "gen.render.progress"
    RENDER_DONE = "gen.render.done"

    VERIFY_DONE = "gen.verify.done"     # data: {score, passed, issues}
    REFINE_APPLIED = "gen.refine.applied"  # data: {iteration, patched_fields}

    UPLOAD_DONE = "gen.upload.done"
