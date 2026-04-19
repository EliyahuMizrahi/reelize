"""Thin wrapper around the elevenlabs Python SDK.

Scoped to the three operations the generation pipeline needs:
  1. IVC clone from one or more voice samples -> voice_id.
  2. TTS synthesis to an on-disk MP3.
  3. Voice deletion (best-effort cleanup so the account's voice slot cap
     doesn't fill up after many clips).
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


DEFAULT_VOICE_SETTINGS: dict[str, Any] = {"stability": 0.5, "similarity_boost": 0.75}


def _is_auth_error(err: Exception) -> bool:
    """True if `err` looks like an auth/quota failure (raise immediately)."""
    msg = str(err).lower()
    return any(
        t in msg
        for t in (
            "401", "403", "unauthorized", "invalid api key", "api_key",
            "quota", "exceeded", "payment", "missing_permissions",
        )
    )


def _retry(fn, *, attempts: int = 3, backoff: tuple[float, ...] = (1.0, 2.0)) -> Any:
    """Run `fn` with up to `attempts` tries; raise auth errors immediately."""
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            last_err = e
            if _is_auth_error(e):
                raise
            if i >= len(backoff):
                break
            log.warning("ElevenLabs transient error (attempt %d/%d): %s", i + 1, attempts, e)
            time.sleep(backoff[i])
    assert last_err is not None
    raise last_err


class ElevenClient:
    """ElevenLabs wrapper covering IVC clone, TTS, and voice deletion."""

    def __init__(self, api_key: str | None = None) -> None:
        """Initialize the elevenlabs SDK client (reads ELEVENLABS_API_KEY if unset)."""
        key = api_key or os.environ.get("ELEVENLABS_API_KEY", "").strip()
        if not key:
            raise RuntimeError("ELEVENLABS_API_KEY not set")
        from elevenlabs.client import ElevenLabs  # lazy import
        self._client = ElevenLabs(api_key=key)

    def clone_voice(self, *, name: str, sample_paths: list[Path]) -> str:
        """IVC-clone a voice from sample files; returns the new voice_id."""
        if not sample_paths:
            raise ValueError("clone_voice requires at least one sample path")

        def _do() -> str:
            files = [open(str(p), "rb") for p in sample_paths]
            try:
                voice = self._client.voices.ivc.create(name=name, files=files)
            finally:
                for f in files:
                    try:
                        f.close()
                    except Exception:  # noqa: BLE001
                        pass
            vid = getattr(voice, "voice_id", None) or getattr(voice, "id", None)
            if not vid:
                raise RuntimeError(f"ElevenLabs IVC returned no voice_id (resp={voice!r})")
            return vid

        return _retry(_do)

    def tts(
        self,
        *,
        voice_id: str,
        text: str,
        out_path: Path,
        model: str = "eleven_turbo_v2_5",
        output_format: str = "mp3_44100_128",
        voice_settings: dict | None = None,
    ) -> Path:
        """Render `text` to an MP3 at `out_path`; returns the written path."""
        settings = dict(DEFAULT_VOICE_SETTINGS)
        if voice_settings:
            settings.update(voice_settings)

        def _do() -> Path:
            stream = self._client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id=model,
                output_format=output_format,
                voice_settings=settings,
            )
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "wb") as f:
                for chunk in stream:
                    if chunk:
                        f.write(chunk)
            if out_path.stat().st_size == 0:
                raise RuntimeError(f"ElevenLabs TTS wrote 0 bytes for voice_id={voice_id}")
            return out_path

        return _retry(_do)

    def delete_voice(self, voice_id: str) -> None:
        """Best-effort delete; swallow errors (voice slot cap is the only risk)."""
        try:
            self._client.voices.delete(voice_id=voice_id)
        except Exception as e:  # noqa: BLE001
            log.warning("ElevenLabs delete_voice(%s) failed: %s", voice_id, e)
