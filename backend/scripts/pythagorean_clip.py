"""High-fidelity Pythagorean-theorem re-skin of the JJK EDIT YAY template.

Keeps the template's rhythm (2 speakers, 11 turns), music sections, SFX, and
visual effects — only swaps narration text + background footage.
"""
from __future__ import annotations

import json
import math
import os
import random
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

# Windows default stdout is cp1252; switch to UTF-8 so our unicode logs work.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

load_dotenv(BACKEND / ".env")

from generation.eleven_client import ElevenClient  # noqa: E402
from storage import get_storage  # noqa: E402

REMOTION_ROOT = BACKEND / "remotion"
SCRATCH = BACKEND / "tmp" / "pythagorean"
BG_ROOT = BACKEND / "assets" / "bg_footage"

TEMPLATE_ID = "0b1c3690-06c1-4b51-a5c5-c1d6cd9231c0"
SOURCE_JOB_ID = "459df1fc-9334-4049-a8be-e8ecb0ef93c2"
ARTIFACT_PREFIX = SOURCE_JOB_ID  # storage keys use bare job id as prefix.

# Target shelf in the app Library. The backend's signed-URL guard requires
# every artifact key to start with `{job_id}/`, so we always create a fresh
# job row and upload under that prefix.
PUBLISH_CLASS_NAME = "hi"
PUBLISH_CLIP_TITLE = "Pythagorean Theorem (JJK-style)"
PUBLISH_THUMBNAIL_COLOR = "#6C5CE7"
PUBLISH_SOURCE_CREATOR = "Pythagorean Visualized"

FPS = 30
WIDTH = 1080
HEIGHT = 1920

# Template's source duration (from video_analysis.total_duration_seconds).
TEMPLATE_DURATION_S = 72.1
# Target duration; keep within ±10% of template (64.9 – 79.3).
TARGET_DURATION_S = 72.0
MUSIC_GAIN = 0.18  # ducked under voice

# ── script: mirror template.style_dna.voice.turns turn-for-turn ───────────
# SPEAKER_01 = analytical setup (first 4 turns), SPEAKER_00 = triumphant
# payoff (remaining 7 turns). Each text line sized to fit the template
# turn's slot at a comfortable speaking rate.
SCRIPT_TURNS: list[dict] = [
    # idx, speaker, template_start, template_end, text
    {"idx": 0, "speaker": "SPEAKER_01", "tstart": 3.063,  "tend": 7.985,  "text": "Right triangle. Two legs. One hypotenuse. The oldest puzzle in geometry."},
    {"idx": 1, "speaker": "SPEAKER_01", "tstart": 8.285,  "tend": 12.265, "text": "If a-squared plus b-squared holds, everything snaps into place."},
    {"idx": 2, "speaker": "SPEAKER_01", "tstart": 13.097, "tend": 15.153, "text": "Three, and four."},
    {"idx": 3, "speaker": "SPEAKER_01", "tstart": 15.373, "tend": 18.773, "text": "What's the missing side?"},
    {"idx": 4, "speaker": "SPEAKER_00", "tstart": 18.993, "tend": 22.729, "text": "Five. It's always been five."},
    {"idx": 5, "speaker": "SPEAKER_00", "tstart": 22.909, "tend": 28.342, "text": "Nine plus sixteen is twenty-five, and the square root of that is five."},
    {"idx": 6, "speaker": "SPEAKER_00", "tstart": 28.642, "tend": 34.183, "text": "The squares on the two legs always balance the square on the hypotenuse."},
    {"idx": 7, "speaker": "SPEAKER_00", "tstart": 34.403, "tend": 38.248, "text": "Across every right triangle in existence,"},
    {"idx": 8, "speaker": "SPEAKER_00", "tstart": 38.508, "tend": 41.168, "text": "I alone know the answer."},
    {"idx": 9, "speaker": "SPEAKER_00", "tstart": 41.168, "tend": 50.721, "text": "By combining the squares of both legs, you reveal the length hiding on the third side — exactly, every time."},
    {"idx": 10, "speaker": "SPEAKER_00", "tstart": 50.961, "tend": 73.425, "text": "a-squared plus b-squared equals c-squared."},
]

# Caption wrap heuristic (matches generation/timeline.py).
CAPTION_LINE_CHAR_LIMIT = 22
CAPTION_MAX_LINES = 2
CAPTION_MIN_DURATION_S = 0.6


@dataclass
class TTSTurn:
    idx: int
    speaker: str
    text: str
    tstart: float            # template-timeline start
    tend: float              # template-timeline end
    audio_path: Path = Path()
    duration_s: float = 0.0
    start: float = 0.0       # new-timeline start
    end: float = 0.0         # new-timeline end


# ── helpers ───────────────────────────────────────────────────────────────

def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        stderr=subprocess.PIPE,
        timeout=15,
    )
    return float(out.decode().strip())


def round_to_frame(seconds: float) -> float:
    return round(seconds * FPS) / FPS


def ceil_to_frame(seconds: float) -> float:
    return math.ceil(seconds * FPS) / FPS


def split_for_captions(text: str) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks: list[list[str]] = []
    current_lines: list[str] = []
    current_line = ""
    for w in words:
        candidate = (current_line + " " + w).strip() if current_line else w
        if len(candidate) <= CAPTION_LINE_CHAR_LIMIT:
            current_line = candidate
            continue
        if current_line:
            current_lines.append(current_line)
        if len(current_lines) >= CAPTION_MAX_LINES:
            chunks.append(current_lines)
            current_lines = []
        current_line = w
    if current_line:
        current_lines.append(current_line)
    if current_lines:
        chunks.append(current_lines)
    return ["\n".join(lines) for lines in chunks]


def caption_style_from_template(style_dna: dict) -> dict:
    tmpl = (style_dna or {}).get("captions") or {}
    size_map = {"small": 64, "medium": 84, "large": 104}
    weight_map = {"regular": 500, "medium": 600, "bold": 800, "black": 900}
    size = tmpl.get("size")
    size_px = size_map.get(size, 84) if isinstance(size, str) else int(size or 84)
    weight = tmpl.get("weight")
    weight_val = weight_map.get(weight, 800) if isinstance(weight, str) else int(weight or 800)
    case = (tmpl.get("case") or "mixed").lower()
    if case not in ("upper", "mixed", "lower"):
        case = "mixed"
    animation = (tmpl.get("animation") or "static").lower()
    if animation not in ("static", "fade_in", "word_highlight", "pop"):
        animation = "static"
    stroke_px_raw = tmpl.get("stroke_width_px_estimate") or tmpl.get("stroke_width_px") or 4
    stroke_px = max(3, int(stroke_px_raw))
    return {
        "font_feel": "rounded-sans",
        "weight": weight_val,
        "size": size_px,
        "color": tmpl.get("primary_color") or "#FFFFFF",
        "stroke_color": tmpl.get("stroke_color") or "#000000",
        "stroke_width_px": stroke_px,
        "position": "middle",  # USER OVERRIDE — template says bottom.
        "animation": animation,
        "case": case,
        "background": None,
    }


def derive_captions(turns: list[TTSTurn], style: dict) -> list[dict]:
    out: list[dict] = []
    for t in turns:
        chunks = split_for_captions(t.text)
        if not chunks:
            continue
        dur = max(t.end - t.start, CAPTION_MIN_DURATION_S)
        per = dur / len(chunks)
        for i, chunk_text in enumerate(chunks):
            s = round_to_frame(t.start + i * per)
            e = round_to_frame(t.start + (i + 1) * per)
            if e - s < 1.0 / FPS:
                e = s + 1.0 / FPS
            out.append({"text": chunk_text, "start": s, "end": e, "style": dict(style)})
    return out


# ── bg picker (already working — keep as is) ──────────────────────────────

def pick_random_bg(target_duration_s: float) -> tuple[Path, str, float, float]:
    candidates: list[tuple[Path, str, float]] = []
    for mp4 in BG_ROOT.glob("*/clip_*.mp4"):
        try:
            dur = probe_duration(mp4)
        except Exception:
            continue
        candidates.append((mp4, mp4.parent.name, dur))
    if not candidates:
        raise RuntimeError(f"No bg clips found under {BG_ROOT}")

    rng = random.Random()
    random.shuffle(candidates)
    slack = 1.5
    for mp4, cat, dur in candidates:
        if dur >= target_duration_s + slack:
            max_offset = dur - target_duration_s - 0.5
            offset = rng.uniform(0.0, max(0.0, max_offset))
            return mp4, cat, dur, offset
    longest = max(candidates, key=lambda c: c[2])
    raise RuntimeError(
        f"No bg clip long enough for {target_duration_s:.2f}s "
        f"(longest available: {longest[2]:.2f}s)"
    )


# ── storage helpers ───────────────────────────────────────────────────────

def try_download(storage, keys: list[str], dest: Path) -> str | None:
    """Try each key in order; write the first success to `dest` and return it."""
    for key in keys:
        try:
            data = storage.download(key)
            if not data:
                continue
            dest.write_bytes(data)
            return key
        except Exception:
            continue
    return None


def download_voice_samples(storage, work: Path) -> dict[str, Path]:
    """Download both SPEAKER_00 and SPEAKER_01 voice samples."""
    out: dict[str, Path] = {}
    for spk in ("SPEAKER_00", "SPEAKER_01"):
        key = f"{ARTIFACT_PREFIX}/voices/{spk}.opus"
        dest = work / f"{spk}.opus"
        data = storage.download(key)
        dest.write_bytes(data)
        out[spk] = dest
        print(f"      voice sample {spk}: {dest} ({dest.stat().st_size} B)")
    return out


def download_sfx(storage, sfx_manifest: dict, work: Path) -> list[dict]:
    """Download every sfx file the template persisted; return a list of
    {local_path, template_time, gain, label} dicts (not yet retimed).

    Only hits where the actual wav is in storage are returned — indices the
    user didn't keep in the template leave silence at that timestamp, which
    is what they want.
    """
    items = (sfx_manifest or {}).get("items") or []
    sfx_dir = work / "sfx"
    sfx_dir.mkdir(exist_ok=True)
    rows: list[dict] = []
    for idx, item in enumerate(items):
        t = float(item.get("video_time", item.get("at", 0.0)))
        dest = sfx_dir / f"sfx_{idx:02d}.wav"
        # Try several key conventions — not every pipeline run uploaded every
        # sfx with the same path, so fall through.
        manifest_path = item.get("path") or ""
        candidate_keys: list[str] = []
        if item.get("storage_key"):
            candidate_keys.append(item["storage_key"])
        if item.get("key"):
            candidate_keys.append(item["key"])
        candidate_keys.extend([
            f"{ARTIFACT_PREFIX}/sfx/{idx:02d}.wav",
            f"{ARTIFACT_PREFIX}/sfx/sfx_{idx:02d}.wav",
            f"{ARTIFACT_PREFIX}/audio/sfx/sfx_{idx:02d}.wav",
        ])
        # manifest_path often looks like tmp/jobs/{job}/audio/sfx/sfx_NN.wav;
        # bucket likely doesn't have the tmp/jobs/ prefix — strip it and try.
        if manifest_path.startswith("tmp/jobs/"):
            candidate_keys.append(manifest_path[len("tmp/jobs/"):])
        elif manifest_path:
            candidate_keys.append(manifest_path)
        hit = try_download(storage, candidate_keys, dest)
        if hit:
            rows.append({
                "local_path": dest,
                "template_time": t,
                "strength": float(item.get("strength", 1.0)),
            })
            print(f"      sfx[{idx}] @t={t:.2f}s  <- {hit}")
        else:
            print(f"      sfx[{idx}] @t={t:.2f}s  SKIP (not in storage)")
    return rows


def download_music(storage, style_dna: dict, work: Path) -> tuple[list[dict], Path | None]:
    """Download each music section's full song file. Falls back to the merged
    background.opus track if the per-song file isn't in storage.

    Returns (sections, fallback_path). `sections` has one dict per section
    with keys: template_start/end, song_offset_start, local_path, src_kind.
    """
    sections_raw = (style_dna or {}).get("music", {}).get("sections") or []
    music_dir = work / "music"
    music_dir.mkdir(exist_ok=True)
    fallback_path: Path | None = None
    # Pull the merged fallback first — cheap insurance.
    fb_dest = music_dir / "background.opus"
    hit = try_download(
        storage,
        [f"{ARTIFACT_PREFIX}/music/background.opus"],
        fb_dest,
    )
    if hit:
        fallback_path = fb_dest
        print(f"      music fallback: {hit}")

    out: list[dict] = []
    for i, sec in enumerate(sections_raw):
        full_path = sec.get("full_song_path") or ""
        song_id = sec.get("song_id") or ""
        vstart = float(sec.get("video_start", 0.0))
        vend = float(sec.get("video_end", 0.0))
        song_offset_start = float(sec.get("song_offset_start") or 0.0)
        song_offset_end_raw = sec.get("song_offset_end")
        song_offset_end = float(song_offset_end_raw) if song_offset_end_raw is not None else None
        dest = music_dir / f"section_{i:02d}_{song_id or 'unk'}.wav"
        # Candidate storage keys for the full song.
        candidates: list[str] = []
        if full_path.startswith("tmp/jobs/"):
            candidates.append(full_path[len("tmp/jobs/"):])
        elif full_path:
            candidates.append(full_path)
        if song_id:
            candidates.extend([
                f"{ARTIFACT_PREFIX}/audio/songs/full_{song_id}.wav",
                f"{ARTIFACT_PREFIX}/songs/full_{song_id}.wav",
                f"{ARTIFACT_PREFIX}/music/full_{song_id}.wav",
            ])
        hit_key = try_download(storage, candidates, dest)
        if hit_key:
            out.append({
                "template_start": vstart,
                "template_end": vend,
                "song_offset_start": song_offset_start,
                "song_offset_end": song_offset_end,
                "local_path": dest,
                "src_kind": "full_song",
                "song_id": song_id,
            })
            print(f"      music[{i}] '{sec.get('song', song_id)}'  t=[{vstart:.2f},{vend:.2f}]  <-{hit_key}")
        elif fallback_path is not None:
            # Use background.opus (which tracks the source video 1:1), trim
            # to [vstart, vend] on the source timeline.
            out.append({
                "template_start": vstart,
                "template_end": vend,
                "song_offset_start": vstart,  # play from the matching video time
                "song_offset_end": vend,
                "local_path": fallback_path,
                "src_kind": "background_fallback",
                "song_id": song_id,
            })
            print(f"      music[{i}] '{sec.get('song', song_id)}'  t=[{vstart:.2f},{vend:.2f}]  <-background.opus fallback")
        else:
            print(f"      music[{i}] '{sec.get('song', song_id)}' — no source available, skipping")
    return out, fallback_path


# ── effect derivation (mirrors backend/generation/timeline.py) ────────────

EFFECT_TYPE_MAP = {
    "zoom in": "zoom_in",
    "zoom_in": "zoom_in",
    "slow motion": "slow_mo",
    "slow_mo": "slow_mo",
    "speed ramp": "speed_ramp",
    "speed_ramp": "speed_ramp",
    "hard cut": "cut_flash",
    "cut_flash": "cut_flash",
    "beat sync": "beat_pulse",
    "beat_pulse": "beat_pulse",
}


def derive_effects(video_analysis: dict, source_duration_s: float, new_duration_s: float) -> list[dict]:
    segments = (video_analysis or {}).get("segments") or []
    if not segments or source_duration_s <= 0:
        return []
    scale = new_duration_s / source_duration_s
    out: list[dict] = []
    for seg in segments:
        raw = (seg.get("suggested_edit_style") or "").strip().lower()
        if not raw or raw == "normal":
            continue
        mapped = EFFECT_TYPE_MAP.get(raw)
        if not mapped:
            continue
        src_at = float(seg.get("start_seconds", seg.get("start", 0.0)))
        src_end = float(seg.get("end_seconds", seg.get("end", src_at + 0.4)))
        at = round_to_frame(src_at * scale)
        dur = max(round_to_frame((src_end - src_at) * scale), 2.0 / FPS)
        if at >= new_duration_s:
            continue
        out.append({"type": mapped, "at": at, "dur": dur})
    return out


# ── publish to library ────────────────────────────────────────────────────

def compress_for_upload(src: Path, dst: Path) -> Path:
    """Re-encode with x264 crf 26 + aac 128k so the file fits Supabase's
    50 MB-per-object limit. Skips if dst is fresh and newer than src."""
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return dst
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-c:v", "libx264", "-crf", "26", "-preset", "veryfast",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        str(dst),
    ]
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode != 0 or not dst.exists():
        raise RuntimeError("ffmpeg compress step failed")
    return dst


def extract_thumbnail(video: Path, dst: Path, duration_s: float) -> Path:
    """Grab one jpeg frame at a random point in the middle 80% of the clip
    (avoiding the quiet intro + outro tails). Written to ``dst``."""
    offset = random.uniform(duration_s * 0.10, duration_s * 0.85)
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{offset:.3f}",
        "-i", str(video),
        "-frames:v", "1",
        "-q:v", "3",
        str(dst),
    ]
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode != 0 or not dst.exists():
        raise RuntimeError("ffmpeg thumbnail extract failed")
    return dst


def build_clip_style_dna(
    template_style_dna: dict,
    tts_turns: list["TTSTurn"],
) -> dict:
    """Compose the clips.style_dna blob the frontend reads for the DNA
    medallion, transcript drawer, and creator fingerprint. Keeps the
    template's pacing / music / beat_alignment but overrides voice.turns
    with our actual retimed narration and forces captions.position='middle'.
    """
    src = template_style_dna or {}

    captions = dict(src.get("captions") or {})
    captions["position"] = "middle"  # matches the render override

    real_turns = [
        {
            "start": round(t.start, 2),
            "end": round(t.end, 2),
            "speaker": t.speaker,
            "text": t.text,
        }
        for t in tts_turns
    ]
    # Drop per-song beats arrays (noisy + large); keep the identifying fields.
    music_sections = []
    for sec in (src.get("music") or {}).get("sections") or []:
        music_sections.append({
            "song": sec.get("song"),
            "artist": sec.get("artist"),
            "song_id": sec.get("song_id"),
        })

    return {
        "hook": {
            "description": "Speaker-1 analytical setup, Speaker-0 triumphant payoff",
            "style": "anime-analyst narration",
        },
        "pacing": dict(src.get("pacing") or {}),
        "captions": captions,
        "voice": {
            "num_speakers": 2,
            "energy": "Two-speaker, analytical then triumphant",
            "turns": real_turns,
        },
        "music": {
            "bpm": (src.get("music") or {}).get("bpm"),
            "sections": music_sections,
        },
        "visual": {
            "description": "Top-middle white math cards over random gameplay bg; center-middle captions.",
        },
        "beat_alignment": dict(src.get("beat_alignment") or {}),
    }


def publish_to_library(
    rendered_mp4: Path,
    duration_s: float,
    *,
    style_dna: dict | None = None,
) -> dict | None:
    """Compress, upload under {new_job_id}/video.mp4, create a jobs row, and
    insert a clips row in the 'hi' class's first topic. Returns a summary
    dict or None if publishing is skipped (env PYTHA_NO_PUBLISH=1)."""
    if os.environ.get("PYTHA_NO_PUBLISH") == "1":
        print("      [publish] skipped (PYTHA_NO_PUBLISH=1)")
        return None

    import uuid
    from supabase_client import get_supabase

    sb = get_supabase()
    storage = get_storage()

    # 1. locate the target shelf (class + topic) by name.
    cls = (
        sb.table("classes").select("id,user_id").eq("name", PUBLISH_CLASS_NAME)
        .limit(1).execute().data
    )
    if not cls:
        print(f"      [publish] class '{PUBLISH_CLASS_NAME}' not found - skip")
        return None
    class_id = cls[0]["id"]
    user_id = cls[0]["user_id"]
    topic = (
        sb.table("topics").select("id").eq("class_id", class_id)
        .order("created_at").limit(1).execute().data
    )
    if not topic:
        print(f"      [publish] no topic under class '{PUBLISH_CLASS_NAME}' - skip")
        return None
    topic_id = topic[0]["id"]

    # 2. compress for upload.
    compressed = rendered_mp4.parent / (rendered_mp4.stem + "_compressed.mp4")
    compress_for_upload(rendered_mp4, compressed)
    size_kb = compressed.stat().st_size // 1024
    print(f"      [publish] compressed: {compressed} ({size_kb} KB)")

    # 3. allocate ids and upload under `{user_id}/clips/{clip_id}/video.mp4`.
    #    Storage RLS on `reelize-artifacts` requires the first path segment
    #    to equal auth.uid(), so the signed-in user can call
    #    supabase.storage.createSignedUrl(...) directly. Any job-id-prefixed
    #    key would be blocked at read time even though the backend could
    #    sign it, so we always use the user-prefixed form.
    job_id = str(uuid.uuid4())
    clip_id = str(uuid.uuid4())
    video_key = f"{user_id}/clips/{clip_id}/video.mp4"
    storage.put_file(compressed, video_key)
    print(f"      [publish] uploaded -> {video_key}")

    # 3b. thumbnail: random mid-clip frame, same user-prefixed RLS-friendly path.
    thumb_local = rendered_mp4.parent / "thumb.jpg"
    thumb_key: str | None = None
    try:
        extract_thumbnail(rendered_mp4, thumb_local, duration_s)
        thumb_key = f"{user_id}/clips/{clip_id}/thumb.jpg"
        storage.put_file(thumb_local, thumb_key)
        print(f"      [publish] thumbnail -> {thumb_key}")
    except Exception as e:
        print(f"      [publish] thumbnail skipped: {e}")

    # 4. create jobs row. Note: _is_safe_key on the FastAPI side will now
    #    reject this (prefix is user-id, not job-id) — that's fine because
    #    the frontend uses supabase-js to sign directly; the /jobs/{id}/...
    #    fallback is no longer the canonical path.
    job_artifacts: dict[str, str] = {"video": video_key}
    if thumb_key:
        job_artifacts["thumbnail"] = thumb_key
    sb.table("jobs").insert({
        "id": job_id,
        "status": "completed",
        "source_type": "generation",
        "user_id": user_id,
        "clip_id": clip_id,
        "artifact_prefix": f"{user_id}/clips/{clip_id}",
        "artifacts": job_artifacts,
        "kind": "generation",
    }).execute()

    # 5. create clips row in the shelf.
    sb.table("clips").insert({
        "id": clip_id,
        "topic_id": topic_id,
        "user_id": user_id,
        "title": PUBLISH_CLIP_TITLE,
        "duration_s": int(round(duration_s)),
        "source_creator": PUBLISH_SOURCE_CREATOR,
        "source_platform": "generated",
        "thumbnail_color": PUBLISH_THUMBNAIL_COLOR,
        "artifact_prefix": f"{user_id}/clips/{clip_id}",
        "artifacts": job_artifacts,
        "status": "ready",
        "style_dna": style_dna or {},
        "template_id": TEMPLATE_ID,
        "generation_job_id": job_id,
        "job_id": job_id,
    }).execute()

    return {
        "clip_id": clip_id,
        "job_id": job_id,
        "video_key": video_key,
        "topic_id": topic_id,
    }


# ── main ──────────────────────────────────────────────────────────────────

def main() -> None:
    SCRATCH.mkdir(parents=True, exist_ok=True)
    work = SCRATCH
    (work / "tts").mkdir(exist_ok=True)

    storage = get_storage()

    print("[1/9] Downloading template payloads from Supabase Storage...")
    # style_dna already was on the template row, but we also need a local copy
    # for the caption style builder below.
    from supabase_client import get_supabase  # noqa: E402
    sb = get_supabase()
    tmpl_row = (
        sb.table("templates")
        .select("id,name,source_job_id,sfx_manifest,video_analysis,style_dna,duration_s")
        .eq("id", TEMPLATE_ID)
        .single()
        .execute()
        .data
    )
    style_dna = tmpl_row["style_dna"] or {}
    sfx_manifest = tmpl_row["sfx_manifest"] or {}
    video_analysis = tmpl_row["video_analysis"] or {}
    source_duration = float(
        video_analysis.get("total_duration_seconds")
        or tmpl_row.get("duration_s")
        or TEMPLATE_DURATION_S
    )
    print(f"      template='{tmpl_row['name']}'  source_duration={source_duration:.2f}s")
    print(f"      turns in style_dna.voice: {len((style_dna.get('voice') or {}).get('turns') or [])}")
    print(f"      sfx items: {len(sfx_manifest.get('items') or [])}")
    print(f"      music sections: {len((style_dna.get('music') or {}).get('sections') or [])}")

    # ── 2. voice samples ──
    print("[2/9] Downloading both speaker samples...")
    voice_samples = download_voice_samples(storage, work)

    # ── 3. sfx ──
    print("[3/9] Downloading sfx...")
    sfx_rows = download_sfx(storage, sfx_manifest, work)

    # ── 4. music ──
    print("[4/9] Downloading music sections...")
    music_rows, music_fallback = download_music(storage, style_dna, work)

    # ── 5. IVC clone both speakers (skip if TTS mp3s already cached) ──
    tts_cache_hit = all(
        (work / "tts" / f"turn_{s['idx']:02d}.mp3").exists()
        for s in SCRIPT_TURNS
    )
    tts_turns: list[TTSTurn] = []
    if tts_cache_hit and os.environ.get("PYTHA_FORCE_TTS") != "1":
        print("[5/9] TTS cache hit - skipping IVC/TTS")
        for s in SCRIPT_TURNS:
            out = work / "tts" / f"turn_{s['idx']:02d}.mp3"
            dur = probe_duration(out)
            tts_turns.append(TTSTurn(
                idx=s["idx"], speaker=s["speaker"], text=s["text"],
                tstart=s["tstart"], tend=s["tend"],
                audio_path=out, duration_s=dur,
            ))
            print(f"      turn {s['idx']} [{s['speaker']}]  {dur:.2f}s (cached)")
    else:
        eleven = ElevenClient()
        print("[5/9] Cloning both voices via ElevenLabs IVC...")
        voice_ids: dict[str, str] = {}
        for spk, sample in voice_samples.items():
            vid = eleven.clone_voice(
                name=f"pythagorean_{spk}",
                sample_paths=[sample],
            )
            voice_ids[spk] = vid
            print(f"      {spk} -> voice_id={vid}")

        print("[6/9] Synthesizing narration...")
        try:
            for s in SCRIPT_TURNS:
                spk = s["speaker"]
                vid = voice_ids[spk]
                out = work / "tts" / f"turn_{s['idx']:02d}.mp3"
                eleven.tts(voice_id=vid, text=s["text"], out_path=out)
                dur = probe_duration(out)
                tts_turns.append(TTSTurn(
                    idx=s["idx"], speaker=spk, text=s["text"],
                    tstart=s["tstart"], tend=s["tend"],
                    audio_path=out, duration_s=dur,
                ))
                print(f"      turn {s['idx']} [{spk}]  {dur:.2f}s  {s['text'][:48]!r}")
        finally:
            for spk, vid in voice_ids.items():
                try:
                    eleven.delete_voice(vid)
                except Exception as e:
                    print(f"      warn: delete_voice({spk}={vid}) failed: {e}")

    # ── 7. retime turns onto new timeline ──
    # Anchor each turn at template_start * scale; grant up to the next turn's
    # anchor minus a 0.15s pad. If TTS is shorter than template slot, that's
    # fine — music/sfx fill the gap.
    scale = TARGET_DURATION_S / source_duration
    print(f"[7/9] Retiming  scale={scale:.4f}  target={TARGET_DURATION_S:.2f}s")
    for i, turn in enumerate(tts_turns):
        turn.start = round_to_frame(turn.tstart * scale)
        # Determine the max end allowed (either next turn anchor - pad, or target duration).
        if i + 1 < len(tts_turns):
            next_anchor = tts_turns[i + 1].tstart * scale
            max_end = max(turn.start + 0.4, next_anchor - 0.15)
        else:
            max_end = TARGET_DURATION_S - 0.05
        want_end = turn.start + turn.duration_s
        turn.end = round_to_frame(min(want_end, max_end))
        print(f"      turn {turn.idx} [{turn.speaker}]  [{turn.start:.2f},{turn.end:.2f}]  tts={turn.duration_s:.2f}s  slot={max_end-turn.start:.2f}s")

    duration_s = ceil_to_frame(TARGET_DURATION_S)
    last_end = tts_turns[-1].end
    print(f"      total duration = {duration_s:.2f}s  (last voice end = {last_end:.2f}s)")

    # ── 8. pick random background ──
    print("[8/9] Picking random background...")
    bg_src, bg_category, bg_src_dur, bg_offset = pick_random_bg(duration_s)
    print(f"      -> {bg_category}/{bg_src.name}  source={bg_src_dur:.1f}s  trim_in={bg_offset:.2f}s")

    # ── stage assets into remotion/public/ ──
    print("      staging assets under remotion/public/ ...")
    public = REMOTION_ROOT / "public"
    if public.exists():
        shutil.rmtree(public)
    public.mkdir(parents=True)
    (public / "tts").mkdir()
    (public / "sfx").mkdir()
    (public / "music").mkdir()

    shutil.copyfile(bg_src, public / "bg.mp4")
    for turn in tts_turns:
        shutil.copyfile(turn.audio_path, public / "tts" / turn.audio_path.name)

    # copy sfx assets
    staged_sfx: list[dict] = []
    for row in sfx_rows:
        local: Path | None = row.get("local_path")
        if local is None:
            continue
        dest = public / "sfx" / local.name
        if not dest.exists():
            shutil.copyfile(local, dest)
        # Retime: scale template_time onto new timeline.
        at = round_to_frame(row["template_time"] * scale)
        if at >= duration_s:
            continue
        staged_sfx.append({
            "src": f"sfx/{local.name}",
            "at": at,
            "gain": min(1.0, max(0.4, row.get("strength", 1.0))),
            "label": None,
        })

    # copy music assets; emit Audio layer entries per section.
    staged_music: list[dict] = []
    music_copied: dict[str, str] = {}
    for i, row in enumerate(music_rows):
        local: Path = row["local_path"]
        if local.name not in music_copied:
            shutil.copyfile(local, public / "music" / local.name)
            music_copied[local.name] = f"music/{local.name}"
        src_rel = music_copied[local.name]
        new_start = round_to_frame(row["template_start"] * scale)
        new_end = round_to_frame(row["template_end"] * scale)
        if new_end > duration_s:
            new_end = duration_s - 1.0 / FPS
        if new_end <= new_start:
            continue
        trim_in = max(0.0, float(row["song_offset_start"]))
        staged_music.append({
            "src": src_rel,
            "start": new_start,
            "end": new_end,
            "trim_in": round_to_frame(trim_in),
            "volume": MUSIC_GAIN,
            "speaker": f"music_{i}",
        })

    # ── captions ──
    cap_style = caption_style_from_template(style_dna)
    captions = derive_captions(tts_turns, cap_style)

    # ── effects ──
    effects = derive_effects(video_analysis, source_duration, duration_s)

    # ── audio layer = voices + music ──
    voice_audio = [
        {
            "src": f"tts/{turn.audio_path.name}",
            "start": turn.start,
            "end": turn.end,
            "speaker": turn.speaker,
            "trim_in": 0,
            "volume": 1.0,
        }
        for turn in tts_turns
    ]

    viz_scenes = [{
        "kind": "pythagorean",
        "start": 3.0,
        "end": duration_s,
    }]

    timeline = {
        "schema_version": 1,
        "fps": FPS,
        "width": WIDTH,
        "height": HEIGHT,
        "duration_s": duration_s,
        "bg": {
            "src": "bg.mp4",
            "trim_in": round_to_frame(bg_offset),
            "category": bg_category,
        },
        "audio": voice_audio + staged_music,
        "captions": captions,
        "sfx": staged_sfx,
        "effects": effects,
        "viz": viz_scenes,
        "style_dna": style_dna,
    }
    timeline_path = public / "timeline.json"
    timeline_path.write_text(json.dumps(timeline, indent=2), encoding="utf-8")
    print(f"      wrote {timeline_path}")
    print(f"      audio items: voice={len(voice_audio)}  music={len(staged_music)}")
    print(f"      sfx items: {len(staged_sfx)}  effects: {len(effects)}  captions: {len(captions)}")

    # ── 9. render ──
    print("[9/9] Rendering via Remotion...")
    out_mp4 = SCRATCH / "out.mp4"
    if out_mp4.exists():
        out_mp4.unlink()
    npx = "npx.cmd" if os.name == "nt" else "npx"
    cmd = [
        npx, "remotion", "render",
        "src/index.ts",
        "MainComp",
        str(out_mp4),
        f"--props={timeline_path}",
        "--log=info",
    ]
    r = subprocess.run(cmd, cwd=str(REMOTION_ROOT), env=os.environ.copy())
    if r.returncode != 0:
        raise SystemExit(f"remotion render failed (exit {r.returncode})")
    if not out_mp4.exists():
        raise SystemExit("remotion produced no output file")

    dur_probed = probe_duration(out_mp4)

    # ── compress → upload → publish to library ──
    clip_style_dna = build_clip_style_dna(style_dna, tts_turns)
    published = publish_to_library(out_mp4, dur_probed, style_dna=clip_style_dna)

    # ── summary + diff ──
    spk_turns = {"SPEAKER_00": 0, "SPEAKER_01": 0}
    for t in tts_turns:
        spk_turns[t.speaker] = spk_turns.get(t.speaker, 0) + 1

    print("")
    print("==============================")
    print(f" OUTPUT: {out_mp4}")
    print(f" duration = {dur_probed:.2f}s   template = {source_duration:.2f}s")
    print(f" music sections = {len(staged_music)}   sfx = {len(staged_sfx)}   effects = {len(effects)}")
    print(f" speaker turns: SPEAKER_00={spk_turns.get('SPEAKER_00',0)}  SPEAKER_01={spk_turns.get('SPEAKER_01',0)}")
    print(f" bg: {bg_category}/{bg_src.name} @ {bg_offset:.2f}s")
    if published:
        print(f" published: clip_id={published['clip_id']}  job_id={published['job_id']}")
        print(f"            storage_key={published['video_key']}")
        print(f"            class='{PUBLISH_CLASS_NAME}'  topic_id={published['topic_id']}")
    print("==============================")


if __name__ == "__main__":
    main()
