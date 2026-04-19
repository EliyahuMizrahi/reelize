"""Stage 4: pick a random background clip for a given target duration.

Library layout: ``backend/assets/bg_footage/{category}/{file.mp4}``. If a
``manifest.json`` is present at the root it is trusted verbatim; otherwise the
picker globs ``**/*.mp4``, ffprobes each for duration on first use, and caches
the result to ``.cache.json`` keyed by ``(relpath, mtime)`` so dropping a new
clip only re-probes the delta.
"""
from __future__ import annotations

import json
import logging
import random
import subprocess
from pathlib import Path
from typing import Any, Callable

from .types import BgFootageChoice, EventType, Stage

log = logging.getLogger(__name__)

CACHE_FILE = ".cache.json"
MANIFEST_FILE = "manifest.json"
FFPROBE_TIMEOUT_S = 10
SLACK_S = 2.0
MIN_TAIL_S = 0.5


def _default_library_root() -> Path:
    """Default library path under ``backend/assets/bg_footage/``."""
    return Path(__file__).parent.parent / "assets" / "bg_footage"


def _ffprobe_duration(mp4: Path) -> float:
    """Probe a single mp4 for duration in seconds via ffprobe."""
    try:
        out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(mp4),
            ],
            stderr=subprocess.PIPE,
            timeout=FFPROBE_TIMEOUT_S,
        )
        return float(out.decode().strip())
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError) as e:
        raise RuntimeError(f"ffprobe failed for {mp4}: {e}") from e


def _load_cache(library_root: Path) -> dict[str, dict[str, Any]]:
    """Load the duration cache if present; returns ``{}`` on any error."""
    cache_path = library_root / CACHE_FILE
    if not cache_path.exists():
        return {}
    try:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_cache(library_root: Path, cache: dict[str, dict[str, Any]]) -> None:
    """Persist the duration cache; swallow IO errors (cache is best-effort)."""
    try:
        (library_root / CACHE_FILE).write_text(
            json.dumps(cache, indent=2), encoding="utf-8"
        )
    except OSError as e:
        log.warning("bg_footage cache write failed: %s", e)


def _index_library(library_root: Path) -> list[dict[str, Any]]:
    """Return ``[{relpath, category, duration_s}, ...]`` for every mp4."""
    manifest_path = library_root / MANIFEST_FILE
    if manifest_path.exists():
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            items = data.get("items") if isinstance(data, dict) else data
            if isinstance(items, list) and items:
                return items
        except (OSError, json.JSONDecodeError) as e:
            log.warning("bg_footage manifest unreadable (%s), falling back to glob", e)

    cache = _load_cache(library_root)
    fresh: dict[str, dict[str, Any]] = {}
    items: list[dict[str, Any]] = []
    for mp4 in library_root.glob("**/*.mp4"):
        rel = mp4.relative_to(library_root).as_posix()
        try:
            mtime = int(mp4.stat().st_mtime)
        except OSError:
            continue
        cached = cache.get(rel)
        if cached and cached.get("mtime") == mtime and "duration_s" in cached:
            entry = cached
        else:
            try:
                dur = _ffprobe_duration(mp4)
            except RuntimeError as e:
                log.warning("bg_footage skip %s: %s", rel, e)
                continue
            entry = {"mtime": mtime, "duration_s": dur}
        fresh[rel] = entry
        category = mp4.parent.name if mp4.parent != library_root else "uncategorized"
        items.append({"relpath": rel, "category": category, "duration_s": entry["duration_s"]})

    if fresh != cache:
        _save_cache(library_root, fresh)
    return items


def pick_bg_footage(
    target_duration_s: float,
    *,
    library_root: Path | None = None,
    prefer_category: str | None = None,
    rng_seed: int | None = None,
    emit_event: Callable[..., None] | None = None,
) -> BgFootageChoice:
    """Random pick (optionally weighted toward a category) from the library."""
    if target_duration_s <= 0:
        raise ValueError(f"target_duration_s must be > 0, got {target_duration_s}")

    root = (library_root or _default_library_root()).resolve()
    if not root.exists():
        raise ValueError(f"bg footage library does not exist: {root}")

    if emit_event:
        emit_event(
            EventType.BG_START,
            stage=Stage.BG,
            pct=40,
            message="Picking background footage",
            data={"target_duration_s": target_duration_s},
        )

    items = _index_library(root)
    if not items:
        raise ValueError(f"bg footage library is empty: {root}")

    min_required = target_duration_s + SLACK_S
    eligible = [it for it in items if it["duration_s"] >= min_required]
    if not eligible:
        # Fall back to anything that technically fits (no slack).
        eligible = [it for it in items if it["duration_s"] >= target_duration_s + MIN_TAIL_S]
    if not eligible:
        longest = max(items, key=lambda it: it["duration_s"])
        raise ValueError(
            f"No bg clip long enough for {target_duration_s:.2f}s target "
            f"(longest available: {longest['duration_s']:.2f}s)"
        )

    rng = random.Random(rng_seed)
    weights: list[float] | None = None
    if prefer_category:
        weights = [3.0 if it["category"] == prefer_category else 1.0 for it in eligible]
    pick = rng.choices(eligible, weights=weights, k=1)[0]

    source_duration = float(pick["duration_s"])
    max_trim_in = max(0.0, source_duration - target_duration_s - MIN_TAIL_S)
    trim_in = rng.uniform(0.0, max_trim_in) if max_trim_in > 0 else 0.0
    trim_out = trim_in + target_duration_s

    choice = BgFootageChoice(
        category=pick["category"],
        local_path=root / pick["relpath"],
        source_duration_s=source_duration,
        trim_in_s=trim_in,
        trim_out_s=trim_out,
    )

    if emit_event:
        emit_event(
            EventType.BG_DONE,
            stage=Stage.BG,
            pct=45,
            message=f"Selected {choice.category}/{choice.local_path.name}",
            data={
                "category": choice.category,
                "file": choice.local_path.name,
                "trim_in_s": round(trim_in, 3),
                "trim_out_s": round(trim_out, 3),
                "source_duration_s": round(source_duration, 3),
            },
        )
    return choice
