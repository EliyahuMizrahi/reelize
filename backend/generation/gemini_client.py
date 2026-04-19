"""Thin Gemini wrapper for the generation pipeline.

Multi-key rotation is required: the free-tier RPD (requests-per-day) limits
trip easily during long generation jobs that chain script rewrite + verify +
refine passes. Rotating across 2-3 keys gives us enough headroom to finish a
clip without a cold-stop. Auth/permission errors still raise immediately —
rotation only helps when the failure is quota/rate-limit related.

Mirrors worker._gemini_api_keys() ordering so the same "primary = BACKUP3,
rotation = BACKUP4, fallback = GEMINI_API_KEY" contract is honored here.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

from google import genai
from google.genai import types as genai_types

log = logging.getLogger(__name__)


def _load_keys() -> list[str]:
    """Load Gemini keys using worker.py:_gemini_api_keys() ordering."""
    keys: list[str] = []
    key3 = os.environ.get("GEMINI_API_KEY_BACKUP3", "").strip()
    if key3:
        keys.append(key3)
    else:
        raw = os.environ.get("GEMINI_API_KEY", "")
        keys.extend(k.strip() for k in raw.split(",") if k.strip())
    backup4 = os.environ.get("GEMINI_API_KEY_BACKUP4", "").strip()
    if backup4 and backup4 not in keys:
        keys.append(backup4)
    return keys


def _is_rate_limited(err: Exception) -> bool:
    """True if `err` looks like a quota/rate-limit (429/RESOURCE_EXHAUSTED)."""
    msg = str(err).lower()
    return any(
        t in msg for t in ("429", "resource_exhausted", "quota", "rate limit", "rate_limit")
    )


def _is_auth_error(err: Exception) -> bool:
    """True if `err` looks like an auth failure (never retried/rotated)."""
    msg = str(err).lower()
    return any(t in msg for t in ("401", "403", "permission_denied", "unauthenticated", "invalid api key"))


class GeminiClient:
    """Multi-key Gemini client with 429-aware rotation and JSON schema output."""

    MAX_RETRIES = 5
    MAX_ROTATIONS = 6

    def __init__(self, model: str = "gemini-3.1-flash-lite-preview") -> None:
        """Initialize client pool from env keys; raises if none configured."""
        keys = _load_keys()
        if not keys:
            raise RuntimeError(
                "No Gemini API keys found (set GEMINI_API_KEY or GEMINI_API_KEY_BACKUP3)."
            )
        self.model = model
        self._clients = [genai.Client(api_key=k) for k in keys]
        self._idx = 0
        self._lock = threading.Lock()

    @property
    def _client(self) -> genai.Client:
        """Currently active `genai.Client` (rotates on 429)."""
        return self._clients[self._idx]

    def _rotate(self) -> int:
        """Advance the active client index; returns the new index."""
        with self._lock:
            self._idx = (self._idx + 1) % len(self._clients)
            return self._idx

    def _build_contents(self, user: str | list[Any]) -> list[Any]:
        """Normalize `user` payload into the genai `contents` list."""
        if isinstance(user, list):
            return list(user)
        return [user]

    def _call(self, *, system: str, user: str | list[Any], config: genai_types.GenerateContentConfig) -> Any:
        """Invoke generate_content with rotation + exponential backoff."""
        # Inject system instruction into the config (google-genai style).
        if system:
            config.system_instruction = system
        contents = self._build_contents(user)
        num_clients = len(self._clients)
        retries = 0
        rotations = 0
        last_err: Exception | None = None

        for _ in range(self.MAX_RETRIES + self.MAX_ROTATIONS):
            try:
                response = self._client.models.generate_content(
                    model=self.model, contents=contents, config=config
                )
                if not getattr(response, "text", None) and not getattr(response, "parsed", None):
                    retries += 1
                    if retries >= self.MAX_RETRIES:
                        raise RuntimeError("Gemini returned empty response after retries")
                    time.sleep(min(30, 2 ** (retries - 1)))
                    continue
                return response
            except Exception as e:  # noqa: BLE001
                last_err = e
                if _is_auth_error(e):
                    log.error("Gemini auth error (key %d/%d): %s", self._idx + 1, num_clients, e)
                    raise
                if _is_rate_limited(e) and num_clients > 1 and rotations < self.MAX_ROTATIONS:
                    new_idx = self._rotate()
                    rotations += 1
                    log.warning(
                        "Gemini 429 — rotating to key %d/%d (rotation %d/%d)",
                        new_idx + 1, num_clients, rotations, self.MAX_ROTATIONS,
                    )
                    continue
                retries += 1
                log.warning(
                    "Gemini error on key %d/%d (retry %d/%d): %s",
                    self._idx + 1, num_clients, retries, self.MAX_RETRIES, e,
                )
                if retries >= self.MAX_RETRIES:
                    break
                time.sleep(min(30, 2 ** (retries - 1)))
        assert last_err is not None
        raise last_err

    def generate_json(self, *, system: str, user: str | list[Any], schema: type) -> dict:
        """Structured JSON output validated against a pydantic `schema` class."""
        config = genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
        )
        response = self._call(system=system, user=user, config=config)
        # Prefer the SDK-parsed pydantic instance if available.
        parsed = getattr(response, "parsed", None)
        if parsed is not None:
            if hasattr(parsed, "model_dump"):
                return parsed.model_dump()
            if isinstance(parsed, dict):
                return parsed
        # Fallback to raw JSON text.
        import json
        return json.loads(response.text)

    def generate_text(self, *, system: str, user: str | list[Any]) -> str:
        """Free-form text output using the same rotation/retry loop."""
        config = genai_types.GenerateContentConfig()
        response = self._call(system=system, user=user, config=config)
        return response.text or ""

    @staticmethod
    def image_part(png_bytes: bytes) -> genai_types.Part:
        """Wrap raw PNG bytes as a genai inline-data Part for multimodal input."""
        return genai_types.Part.from_bytes(data=png_bytes, mime_type="image/png")
