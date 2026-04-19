"""Per-region song identification via Shazam.

For each music region we run a hierarchical Shazam scan (coarse chunks + dense
fine slide), then decide which song was playing by the linear-offset consensus
rule: the true song's hits have `song_offset - video_time` roughly constant
across hits, while glitch matches don't.
"""
from __future__ import annotations

import asyncio
import logging
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from shazamio import Shazam
from thefuzz import fuzz

from .config import PipelineConfig

log = logging.getLogger(__name__)


@dataclass
class MusicSection:
    song: str
    artist: str
    song_id: str
    video_start: float
    video_end: float
    song_offset_start: float       # song time at video_start
    song_offset_end: float         # song time at video_end
    shazam_url: str
    # `song_offset = video_time + song_time_base` (slope = 1).
    song_time_base: float = field(init=False)
    # Populated later by the SFX stage.
    full_song_path: str | None = None
    exact_offset: float | None = None
    alignment_correction: float | None = None

    def __post_init__(self) -> None:
        self.song_time_base = round(self.song_offset_start - self.video_start, 3)

    def to_dict(self) -> dict:
        return {
            "song": self.song,
            "artist": self.artist,
            "song_id": self.song_id,
            "video_start": self.video_start,
            "video_end": self.video_end,
            "song_offset_start": self.song_offset_start,
            "song_offset_end": self.song_offset_end,
            "song_time_base": self.song_time_base,
            "shazam_url": self.shazam_url,
            "full_song_path": self.full_song_path,
            "exact_offset": self.exact_offset,
            "alignment_correction": self.alignment_correction,
        }


def _same_song(a: dict | None, b: dict | None) -> bool:
    """Fuzzy song identity match — handles different Shazam metadata for the same track."""
    if a is None or b is None:
        return False
    if a["song_id"] == b["song_id"]:
        return True
    return fuzz.partial_ratio(a["title"].lower(), b["title"].lower()) >= 65


def _linear_score(hits: list[dict], tol: float) -> tuple[int, float]:
    """Score how many hits lie on a shared linear offset line (slope forced to 1).

    Returns (best_count, best_base) where base = song_offset - video_time.
    """
    if not hits:
        return 0, 0.0
    bases = [h["song_offset"] - h["video_time"] for h in hits]
    if len(bases) == 1:
        return 1, bases[0]
    best_count, best_base = 0, bases[0]
    for candidate in bases:
        count = sum(1 for b in bases if abs(b - candidate) < tol)
        if count > best_count:
            best_count, best_base = count, candidate
    return best_count, best_base


class ShazamIdentifier:
    """Holds per-run Shazam state so we can cache and rate-limit calls."""

    def __init__(self, background_music: Path, cfg: PipelineConfig):
        self.background_music = background_music
        self.cfg = cfg
        self._shazam = Shazam()
        cfg.chunks_dir.mkdir(parents=True, exist_ok=True)

    async def _shazam_segment(
        self,
        start: float,
        end: float,
        label: str = "",
        pad_to: float | None = None,
    ) -> dict | None:
        """Cut [start, end] from the BG stem and run Shazam on it.

        Always sleeps `cfg.shazam_rate_limit` before returning (in `finally`)
        so rate-limiting applies to misses and exceptions too, not only hits.

        If `pad_to` is given and the cut is shorter than `pad_to` seconds, pad
        the tail with silence up to `pad_to`. Used for short tail chunks so
        Shazam still gets a chunk_size-long input it can match against.
        """
        tag = f"{int(start * 100):06d}_{int(end * 100):06d}"
        path = self.cfg.chunks_dir / f"seg_{tag}.wav"
        ffmpeg_cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(self.background_music),
            "-ss", str(start), "-to", str(end),
            "-ar", "16000", "-ac", "1",
        ]
        if pad_to is not None and pad_to > (end - start):
            # Pad the audio with silence to reach pad_to seconds total.
            ffmpeg_cmd += ["-af", f"apad=whole_dur={pad_to}"]
        ffmpeg_cmd.append(str(path))
        proc = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
        )
        if proc.returncode != 0 or not path.exists() or path.stat().st_size == 0:
            stderr = (proc.stderr or b"").decode("utf-8", errors="replace")[-500:]
            log.warning(
                "ffmpeg segment cut failed (%.1f→%.1fs, code=%d): %s",
                start, end, proc.returncode, stderr,
            )
            # No Shazam call happened, so don't rate-limit-sleep here.
            return None
        try:
            out = await self._shazam.recognize(str(path))
            if "track" not in out:
                return None
            track = out["track"]
            offset = out["matches"][0].get("offset", 0) if out.get("matches") else 0
            result = {
                "start": start, "end": end,
                "title": track.get("title", ""),
                "artist": track.get("subtitle", ""),
                "song_id": track.get("key", track.get("title", "")),
                "song_offset": offset,
                "shazam_url": track.get("url", ""),
            }
            log.debug(
                "  %s %.1f→%.1fs ✅ %s - %s (song @ %ss)",
                label, start, end, result["artist"], result["title"], offset,
            )
            return result
        except Exception as e:
            log.debug("  %s %.1f→%.1fs ❌ (%s)", label, start, end, e)
            return None
        finally:
            # Rate-limit applies to every Shazam attempt — hit, miss, or raise.
            await asyncio.sleep(self.cfg.shazam_rate_limit)

    async def _identify_region(self, reg_start: float, reg_end: float) -> list[MusicSection]:
        """Identify all song sections inside one music region."""
        cfg = self.cfg
        tol = cfg.shazam_linear_tol
        chunk = cfg.shazam_coarse_chunk
        slide = cfg.shazam_slide_step

        # Pass 1: coarse scan
        all_hits = []
        t = reg_start
        while t < reg_end:
            end = min(t + chunk, reg_end)
            remaining = end - t
            if remaining < 1.0:
                # Not enough signal even with padding to be useful.
                break
            # Short tail chunks: pad with silence to chunk length so Shazam
            # still has a full-sized window to match against.
            pad_to = chunk if remaining < chunk else None
            r = await self._shazam_segment(t, end, label="[coarse]", pad_to=pad_to)
            if r is not None:
                all_hits.append({"video_time": t, "song_offset": r["song_offset"],
                                 "result": r, "end": end, "type": "coarse"})
            t = end

        # Pass 2: dense fine slide (always — linear-offset signal beats a glitch)
        if reg_end - reg_start >= chunk:
            t = reg_start + slide
            while t + chunk <= reg_end:
                r = await self._shazam_segment(t, t + chunk, label="[fine]")
                if r is not None:
                    all_hits.append({"video_time": t, "song_offset": r["song_offset"],
                                     "result": r, "end": t + chunk, "type": "fine"})
                t += slide

        if not all_hits:
            return []

        # Group hits by fuzzy song identity
        groups: list[list[dict]] = []
        for h in all_hits:
            placed = False
            for g in groups:
                if _same_song(g[0]["result"], h["result"]):
                    g.append(h)
                    placed = True
                    break
            if not placed:
                groups.append([h])

        # Score each group
        group_score = {}
        for i, g in enumerate(groups):
            count, base = _linear_score(g, tol)
            group_score[i] = {"hits": g, "linear_count": count, "base": base,
                              "song": g[0]["result"]}
        ranked = sorted(group_score.values(), key=lambda x: -x["linear_count"])
        log.info("  Song candidates (by linear-hit count):")
        for s in ranked[:5]:
            log.info("    %2d× %s - %s",
                     s["linear_count"], s["song"]["artist"], s["song"]["title"][:40])

        # Which group does each hit belong to?
        hit_group = {id(h): i for i, g in enumerate(groups) for h in g}

        def _on_line(h: dict, gs: dict) -> bool:
            return abs((h["song_offset"] - h["video_time"]) - gs["base"]) < tol

        # Walk hits in time order; build contiguous sections by dominant group.
        # Skip hits that aren't on their group's line (those are Shazam glitches).
        all_hits.sort(key=lambda h: h["video_time"])
        sections_raw = []
        current = None
        for h in all_hits:
            gi = hit_group[id(h)]
            gs = group_score[gi]
            if gs["linear_count"] < 2 or not _on_line(h, gs):
                continue
            if current is None or current["group_idx"] != gi:
                if current is not None:
                    sections_raw.append(current)
                current = {"group_idx": gi, "first_t": h["video_time"],
                           "last_t": h["end"], "hits": [h]}
            else:
                current["last_t"] = h["end"]
                current["hits"].append(h)
        if current is not None:
            sections_raw.append(current)

        # Merge adjacent sections of the same song (glitch-split them earlier).
        merged = []
        for sec in sections_raw:
            if merged and merged[-1]["group_idx"] == sec["group_idx"]:
                merged[-1]["last_t"] = sec["last_t"]
                merged[-1]["hits"].extend(sec["hits"])
            else:
                merged.append(sec)

        # Emit MusicSection objects.
        sections = []
        for sec in merged:
            gs = group_score[sec["group_idx"]]
            s_start = max(reg_start, sec["first_t"])
            s_end = min(reg_end, sec["last_t"])
            if s_end - s_start < 1:
                continue
            offset_start = s_start + gs["base"]
            offset_end = s_end + gs["base"]
            r = gs["song"]
            sections.append(MusicSection(
                song=r["title"],
                artist=r["artist"],
                song_id=r["song_id"],
                video_start=round(s_start, 2),
                video_end=round(s_end, 2),
                song_offset_start=round(offset_start, 2),
                song_offset_end=round(offset_end, 2),
                shazam_url=r["shazam_url"],
            ))
        return sections

    async def identify(self, music_regions: list[tuple[float, float]]) -> list[MusicSection]:
        all_sections: list[MusicSection] = []
        for i, (rs, re) in enumerate(music_regions):
            log.info("── Region %d: %.1fs → %.1fs ──", i, rs, re)
            all_sections.extend(await self._identify_region(rs, re))
        log.info("Identified %d music section(s)", len(all_sections))
        return all_sections
