"""Generation pipeline: template + topic -> rendered short-form video.

Entry point: ``process_clip_generation(job_id)`` in ``worker.py``. Called from
``main.py`` as a background task after a ``jobs`` row with ``kind='generate'``
is inserted. The row's ``clip_id`` points to the ``clips`` row that will be
flipped to ``status='ready'`` when the MP4 is uploaded.

Pipeline stages (each emits its own ``job_events``):
  1. script   — Gemini rewrites template transcript for the new topic
  2. voice    — ElevenLabs IVC clones each speaker from stored .opus samples
  3. tts      — ElevenLabs TTS generates per-turn audio chunks
  4. bg       — picker selects a clip from backend/assets/bg_footage/
  5. timeline — assemble a Remotion-ready spec JSON
  6. render   — invoke Remotion (headless Chromium) -> MP4
  7. verify   — Gemini judges the render vs source style DNA
  8. refine   — Gemini patches timeline if verify flags issues (bounded loop)
  9. upload   — final MP4 to Storage, clip row -> ready, cleanup voices
"""
from .types import (
    GenerationContext,
    ScriptTurn,
    GeneratedScript,
    VoiceAssets,
    TTSChunk,
    BgFootageChoice,
    TimelineSpec,
    RenderResult,
    VerifyReport,
)
from .worker import process_clip_generation

__all__ = [
    "process_clip_generation",
    "GenerationContext",
    "ScriptTurn",
    "GeneratedScript",
    "VoiceAssets",
    "TTSChunk",
    "BgFootageChoice",
    "TimelineSpec",
    "RenderResult",
    "VerifyReport",
]
