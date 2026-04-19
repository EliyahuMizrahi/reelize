"""High-fidelity NAT-explained re-skin of the Grok edit template.

Keeps the template's rhythm (4 speakers, ~16 turns), music bed, SFX, and
visual effects — only swaps narration text + background footage.

Narration is original writing about Network Address Translation, paced to
match the source template's turn-by-turn timing.
"""
from __future__ import annotations

import json
import math
import os
import random
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

load_dotenv(BACKEND / ".env")

from generation.eleven_client import ElevenClient  # noqa: E402
from storage import get_storage  # noqa: E402

REMOTION_ROOT = BACKEND / "remotion"
SCRATCH = BACKEND / "tmp" / "nat"
BG_ROOT = BACKEND / "assets" / "bg_footage"

TEMPLATE_ID = "150a6e0e-2a75-4cc1-9f1f-297a19037684"
SOURCE_JOB_ID = "9df843bb-21e6-4e9c-8149-46ab84a7d1be"
ARTIFACT_PREFIX = SOURCE_JOB_ID

PUBLISH_CLASS_NAME = "Computers"
PUBLISH_CLIP_TITLE = "How NAT works: one IP, many devices"
PUBLISH_THUMBNAIL_COLOR = "#2563EB"
PUBLISH_SOURCE_CREATOR = "NAT Explained"

FPS = 30
WIDTH = 1080
HEIGHT = 1920

TEMPLATE_DURATION_S = 64.3
TARGET_DURATION_S = 64.0
MUSIC_GAIN = 0.18

# Narration: 16 turns mirroring the template's turn-and-speaker structure.
# SPEAKER_02/03 carry the setup + methodical answer; SPEAKER_01 delivers the
# payoff; SPEAKER_00 handles short punch-lines. Original copy — no source-
# template dialogue is reproduced.
SCRIPT_TURNS: list[dict] = [
    {"idx": 0,  "speaker": "SPEAKER_02", "tstart": 1.357,  "tend": 4.997,  "text": "Imagine you're a router. Fifteen devices in your house all want the internet."},
    {"idx": 1,  "speaker": "SPEAKER_02", "tstart": 5.297,  "tend": 8.361,  "text": "Do you give every phone its own public IP address?"},
    {"idx": 2,  "speaker": "SPEAKER_03", "tstart": 8.561,  "tend": 10.761, "text": "No. That doesn't scale."},
    {"idx": 3,  "speaker": "SPEAKER_03", "tstart": 10.881, "tend": 13.941, "text": "IPv4 only has four billion addresses, and we've already run out."},
    {"idx": 4,  "speaker": "SPEAKER_03", "tstart": 14.061, "tend": 15.041, "text": "It's impossible."},
    {"idx": 5,  "speaker": "SPEAKER_03", "tstart": 15.401, "tend": 17.901, "text": "Every device would need a global slot."},
    {"idx": 6,  "speaker": "SPEAKER_03", "tstart": 18.041, "tend": 20.121, "text": "Better to share one public IP."},
    {"idx": 7,  "speaker": "SPEAKER_03", "tstart": 20.301, "tend": 25.119, "text": "And rewrite the source address on the way out, so replies still find home."},
    {"idx": 8,  "speaker": "SPEAKER_01", "tstart": 25.339, "tend": 26.699, "text": "Network Address Translation."},
    {"idx": 9,  "speaker": "SPEAKER_01", "tstart": 29.519, "tend": 32.986, "text": "Every private IP gets swapped for my public one on the way out."},
    {"idx": 10, "speaker": "SPEAKER_01", "tstart": 32.986, "tend": 36.606, "text": "I log the source port so replies come back right."},
    {"idx": 11, "speaker": "SPEAKER_01", "tstart": 39.046, "tend": 43.184, "text": "One public IP. A hundred devices behind it. All online at once."},
    {"idx": 12, "speaker": "SPEAKER_01", "tstart": 45.584, "tend": 49.549, "text": "A reply hits my port. I find the owner. I send it home."},
    {"idx": 13, "speaker": "SPEAKER_00", "tstart": 51.709, "tend": 52.689, "text": "Port mapped."},
    {"idx": 14, "speaker": "SPEAKER_01", "tstart": 55.389, "tend": 59.029, "text": "A whole LAN pretending to be one address."},
    {"idx": 15, "speaker": "SPEAKER_00", "tstart": 60.229, "tend": 62.129, "text": "That's Network Address Translation."},
    # ── short interjection beats ──────────────────────────────────────────
    # The source template fills the 2.5–3.8s pockets between payoff lines
    # with short rhythmic beats from the backing audio. For the re-skin we
    # insert clean, NAT-themed one-word beats at those same slots so the
    # clip keeps the template's pulse instead of going dry.
    {"idx": 16, "speaker": "SPEAKER_00", "tstart": 27.239, "tend": 28.039, "text": "One IP."},
    {"idx": 17, "speaker": "SPEAKER_00", "tstart": 36.786, "tend": 38.146, "text": "Rewritten."},
    {"idx": 18, "speaker": "SPEAKER_00", "tstart": 43.504, "tend": 44.584, "text": "Shared."},
    {"idx": 19, "speaker": "SPEAKER_00", "tstart": 49.869, "tend": 51.109, "text": "Delivered."},
]

# ElevenLabs' IVC moderation rejects SPEAKER_01's sample (profanity/shouting
# in the source clip triggers the "captcha voice" detector). SPEAKER_00's
# sample is ~1s of song lyrics, which is borderline for the same reason.
# Remap those roles onto the two narration voices that reliably clone:
#   SPEAKER_02 (the questioner / setup voice)
#   SPEAKER_03 (the rational / analytical voice)
# Timeline keeps the original 4-speaker structure; only the synthesis
# identity changes. `speaker` on each turn is preserved in style_dna so the
# frontend still sees 4 diarized speakers in the transcript drawer.
SPEAKER_REMAP: dict[str, str] = {
    "SPEAKER_01": "SPEAKER_03",
    "SPEAKER_00": "SPEAKER_02",
}


def effective_speaker(label: str) -> str:
    return SPEAKER_REMAP.get(label, label)

CAPTION_LINE_CHAR_LIMIT = 22
CAPTION_MAX_LINES = 2
CAPTION_MIN_DURATION_S = 0.6


@dataclass
class TTSTurn:
    idx: int
    speaker: str
    text: str
    tstart: float
    tend: float
    audio_path: Path = Path()
    duration_s: float = 0.0
    start: float = 0.0
    end: float = 0.0


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
    # Normalize legacy animation names to the enum the frontend accepts.
    anim_raw = (tmpl.get("animation") or "static").lower()
    anim_map = {"pop_in": "pop", "popin": "pop", "typewriter": "fade_in"}
    animation = anim_map.get(anim_raw, anim_raw)
    if animation not in ("static", "fade_in", "word_highlight", "pop"):
        animation = "static"
    stroke_px_raw = tmpl.get("stroke_width_px_estimate") or tmpl.get("stroke_width_px") or 4
    stroke_px = max(3, int(stroke_px_raw))
    primary = tmpl.get("primary_color") or "#FFFFFF"
    if isinstance(primary, str) and primary.lower() in ("white",):
        primary = "#FFFFFF"
    stroke_color = tmpl.get("stroke_color") or "#000000"
    if isinstance(stroke_color, str) and stroke_color.lower() in ("black",):
        stroke_color = "#000000"
    return {
        "font_feel": tmpl.get("font_feel") or "rounded-sans",
        "weight": weight_val,
        "size": size_px,
        "color": primary,
        "stroke_color": stroke_color,
        "stroke_width_px": stroke_px,
        "position": "middle",  # USER OVERRIDE — template says center/bottom.
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


# ── bg picker ─────────────────────────────────────────────────────────────

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


def download_voice_samples(storage, work: Path, speakers: list[str]) -> dict[str, Path]:
    """Download a voice sample per speaker; skip any the bucket doesn't have."""
    out: dict[str, Path] = {}
    for spk in speakers:
        dest = work / f"{spk}.opus"
        hit = try_download(
            storage,
            [f"{ARTIFACT_PREFIX}/voices/{spk}.opus"],
            dest,
        )
        if hit:
            out[spk] = dest
            print(f"      voice sample {spk}: {dest} ({dest.stat().st_size} B)")
        else:
            print(f"      voice sample {spk}: MISSING in storage")
    return out


def download_sfx(storage, sfx_manifest: dict, work: Path) -> list[dict]:
    """Download every sfx file the template persisted; return a list of
    {local_path, template_time, gain} dicts (not yet retimed)."""
    items = (sfx_manifest or {}).get("items") or []
    sfx_dir = work / "sfx"
    sfx_dir.mkdir(exist_ok=True)
    rows: list[dict] = []
    for idx, item in enumerate(items):
        t = float(item.get("video_time", item.get("at", 0.0)))
        dest = sfx_dir / f"sfx_{idx:02d}.wav"
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


def download_music(storage, style_dna: dict, work: Path, source_duration: float) -> list[dict]:
    """Download the background music bed for each region the template
    actually plays music during.

    Grok-edit's style_dna.music.sections is empty, so we fall back to
    music.regions ([start, end] pairs) using the merged background.opus.
    The resulting rows are trim-in aligned so each region plays the exact
    source-video audio at that timestamp.
    """
    music_dir = work / "music"
    music_dir.mkdir(exist_ok=True)
    fb_dest = music_dir / "background.opus"
    fallback_path: Path | None = None
    if try_download(
        storage,
        [f"{ARTIFACT_PREFIX}/music/background.opus"],
        fb_dest,
    ):
        fallback_path = fb_dest
        print(f"      music fallback ready: {fb_dest}")

    music_node = (style_dna or {}).get("music") or {}
    sections_raw = music_node.get("sections") or []
    regions = music_node.get("regions") or []

    out: list[dict] = []

    for i, sec in enumerate(sections_raw):
        full_path = sec.get("full_song_path") or ""
        song_id = sec.get("song_id") or ""
        vstart = float(sec.get("video_start", 0.0))
        vend = float(sec.get("video_end", 0.0))
        song_offset_start = float(sec.get("song_offset_start") or 0.0)
        dest = music_dir / f"section_{i:02d}_{song_id or 'unk'}.wav"
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
                "local_path": dest,
                "src_kind": "full_song",
            })
            print(f"      music[{i}] full_song  t=[{vstart:.2f},{vend:.2f}]  <-{hit_key}")
        elif fallback_path is not None:
            out.append({
                "template_start": vstart,
                "template_end": vend,
                "song_offset_start": vstart,
                "local_path": fallback_path,
                "src_kind": "background_fallback",
            })
            print(f"      music[{i}] fallback  t=[{vstart:.2f},{vend:.2f}]  <-background.opus")
        else:
            print(f"      music[{i}] no source available - skipping")

    # If sections was empty but we have explicit regions + the fallback bed,
    # synthesize one entry per region using background.opus. This is the
    # Grok-edit path.
    if not out and fallback_path is not None and regions:
        for i, region in enumerate(regions):
            if not isinstance(region, (list, tuple)) or len(region) != 2:
                continue
            vstart = float(region[0])
            vend = float(region[1])
            if vend <= vstart:
                continue
            out.append({
                "template_start": vstart,
                "template_end": vend,
                "song_offset_start": vstart,
                "local_path": fallback_path,
                "src_kind": "region_fallback",
            })
            print(f"      music[region {i}] t=[{vstart:.2f},{vend:.2f}]  <-background.opus")

    # If still empty but the bed is available, cover the whole source duration
    # so we don't ship a silent climax.
    if not out and fallback_path is not None:
        out.append({
            "template_start": 0.0,
            "template_end": source_duration,
            "song_offset_start": 0.0,
            "local_path": fallback_path,
            "src_kind": "full_bed",
        })
        print("      music[0] full bed  t=[0, source_duration]  <-background.opus")

    return out


# ── effect derivation ─────────────────────────────────────────────────────

EFFECT_TYPE_MAP = {
    "zoom in": "zoom_in",
    "zoom_in": "zoom_in",
    "slow motion": "slow_mo",
    "slow_mo": "slow_mo",
    "speed ramp": "speed_ramp",
    "speed_ramp": "speed_ramp",
    "hard cut": "cut_flash",
    "cut_flash": "cut_flash",
    "fast cut": "cut_flash",
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


# ── publish ───────────────────────────────────────────────────────────────

def compress_for_upload(src: Path, dst: Path) -> Path:
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


def build_clip_style_dna(template_style_dna: dict, tts_turns: list[TTSTurn]) -> dict:
    src = template_style_dna or {}
    captions = dict(src.get("captions") or {})
    captions["position"] = "middle"

    real_turns = [
        {
            "start": round(t.start, 2),
            "end": round(t.end, 2),
            "speaker": t.speaker,
            "text": t.text,
        }
        for t in tts_turns
    ]
    music_sections = []
    for sec in (src.get("music") or {}).get("sections") or []:
        music_sections.append({
            "song": sec.get("song"),
            "artist": sec.get("artist"),
            "song_id": sec.get("song_id"),
        })

    return {
        "hook": {
            "description": "Setup question → methodical 'no, that doesn't scale' → triumphant NAT payoff",
            "style": "four-speaker networking explainer",
        },
        "pacing": dict(src.get("pacing") or {}),
        "captions": captions,
        "voice": {
            "num_speakers": len({t.speaker for t in tts_turns}),
            "energy": "Setup (SPEAKER_02) → analytical (SPEAKER_03) → payoff (SPEAKER_01) → punch-line (SPEAKER_00)",
            "turns": real_turns,
        },
        "music": {
            "bpm": (src.get("music") or {}).get("bpm"),
            "sections": music_sections,
        },
        "visual": {
            "description": "Top-middle white NAT diagrams over random gameplay bg; center-middle captions.",
        },
        "beat_alignment": dict(src.get("beat_alignment") or {}),
    }


def publish_to_library(rendered_mp4: Path, duration_s: float, *, style_dna: dict | None = None) -> dict | None:
    if os.environ.get("NAT_NO_PUBLISH") == "1":
        print("      [publish] skipped (NAT_NO_PUBLISH=1)")
        return None

    import uuid
    from supabase_client import get_supabase

    sb = get_supabase()
    storage = get_storage()

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

    compressed = rendered_mp4.parent / (rendered_mp4.stem + "_compressed.mp4")
    compress_for_upload(rendered_mp4, compressed)
    size_kb = compressed.stat().st_size // 1024
    print(f"      [publish] compressed: {compressed} ({size_kb} KB)")

    job_id = str(uuid.uuid4())
    clip_id = str(uuid.uuid4())
    video_key = f"{user_id}/clips/{clip_id}/video.mp4"
    storage.put_file(compressed, video_key)
    print(f"      [publish] uploaded -> {video_key}")

    thumb_local = rendered_mp4.parent / "thumb.jpg"
    thumb_key: str | None = None
    try:
        extract_thumbnail(rendered_mp4, thumb_local, duration_s)
        thumb_key = f"{user_id}/clips/{clip_id}/thumb.jpg"
        storage.put_file(thumb_local, thumb_key)
        print(f"      [publish] thumbnail -> {thumb_key}")
    except Exception as e:
        print(f"      [publish] thumbnail skipped: {e}")

    job_artifacts: dict[str, str] = {"video": video_key}
    if thumb_key:
        job_artifacts["thumbnail"] = thumb_key

    # Circular FK: jobs.clip_id → clips.id AND clips.job_id → jobs.id.
    # Resolve by (1) inserting jobs with clip_id=NULL, (2) inserting clips
    # referencing jobs.id, (3) patching jobs.clip_id to close the loop.
    sb.table("jobs").insert({
        "id": job_id,
        "status": "completed",
        "source_type": "generation",
        "user_id": user_id,
        "clip_id": None,
        "artifact_prefix": f"{user_id}/clips/{clip_id}",
        "artifacts": job_artifacts,
        "kind": "generation",
    }).execute()

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

    sb.table("jobs").update({"clip_id": clip_id}).eq("id", job_id).execute()

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

    print("[1/9] Downloading template payloads from Supabase...")
    from supabase_client import get_supabase
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
    print(f"      music regions: {len((style_dna.get('music') or {}).get('regions') or [])}")

    # ── 2. voice samples ──
    # Only download samples for the effective speakers we'll actually clone.
    speakers_needed = sorted({effective_speaker(s["speaker"]) for s in SCRIPT_TURNS})
    print(f"[2/9] Downloading voice samples for {speakers_needed}  (remap={SPEAKER_REMAP})")
    voice_samples = download_voice_samples(storage, work, speakers_needed)
    missing = [s for s in speakers_needed if s not in voice_samples]
    if missing:
        raise SystemExit(f"Missing voice samples for {missing}")

    # ── 3. sfx ──
    print("[3/9] Downloading sfx...")
    sfx_rows = download_sfx(storage, sfx_manifest, work)

    # ── 4. music ──
    print("[4/9] Downloading music bed...")
    music_rows = download_music(storage, style_dna, work, source_duration)

    # ── 5/6. IVC clone + TTS (per-turn cache) ──
    # A turn is considered cached when its mp3 exists and is non-empty; we
    # only clone + synthesize the turns that are missing. Lets us resume
    # after a mid-run failure without wasting quota on turns that succeeded.
    def _cached(s: dict) -> bool:
        p = work / "tts" / f"turn_{s['idx']:02d}.mp3"
        return p.exists() and p.stat().st_size > 0

    force_tts = os.environ.get("NAT_FORCE_TTS") == "1"
    pending = [s for s in SCRIPT_TURNS if force_tts or not _cached(s)]
    tts_turns: list[TTSTurn] = []

    if not pending:
        print("[5/9] TTS cache hit - skipping IVC/TTS")
    else:
        pending_speakers = sorted({effective_speaker(s["speaker"]) for s in pending})
        print(f"[5/9] {len(pending)} turns to synthesize across {pending_speakers}...")
        eleven = ElevenClient()
        voice_ids: dict[str, str] = {}
        try:
            for spk in pending_speakers:
                sample = voice_samples[spk]
                vid = eleven.clone_voice(
                    name=f"nat_{spk}",
                    sample_paths=[sample],
                )
                voice_ids[spk] = vid
                print(f"      cloned {spk} -> voice_id={vid}")

            print(f"[6/9] Synthesizing {len(pending)} turns...")
            for s in pending:
                eff = effective_speaker(s["speaker"])
                vid = voice_ids[eff]
                out = work / "tts" / f"turn_{s['idx']:02d}.mp3"
                eleven.tts(voice_id=vid, text=s["text"], out_path=out)
                print(f"      turn {s['idx']} [{s['speaker']}→{eff}]  {s['text'][:48]!r}")
        finally:
            for spk, vid in voice_ids.items():
                try:
                    eleven.delete_voice(vid)
                except Exception as e:
                    print(f"      warn: delete_voice({spk}={vid}) failed: {e}")

    # Load all turns (cached + freshly generated) into TTSTurn list.
    for s in SCRIPT_TURNS:
        out = work / "tts" / f"turn_{s['idx']:02d}.mp3"
        dur = probe_duration(out)
        tts_turns.append(TTSTurn(
            idx=s["idx"], speaker=s["speaker"], text=s["text"],
            tstart=s["tstart"], tend=s["tend"],
            audio_path=out, duration_s=dur,
        ))
        print(f"      turn {s['idx']} [{s['speaker']}]  {dur:.2f}s")

    # ── 7. retime turns onto new timeline ──
    # Sort by template tstart so "next turn's anchor" logic is correct even
    # when SCRIPT_TURNS is authored out-of-order (e.g. appended interjections).
    tts_turns.sort(key=lambda t: t.tstart)
    scale = TARGET_DURATION_S / source_duration
    print(f"[7/9] Retiming  scale={scale:.4f}  target={TARGET_DURATION_S:.2f}s")
    for i, turn in enumerate(tts_turns):
        turn.start = round_to_frame(turn.tstart * scale)
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

    # ── 8. pick random bg ──
    print("[8/9] Picking random background...")
    bg_src, bg_category, bg_src_dur, bg_offset = pick_random_bg(duration_s)
    print(f"      -> {bg_category}/{bg_src.name}  source={bg_src_dur:.1f}s  trim_in={bg_offset:.2f}s")

    # stage assets under remotion/public/
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

    staged_sfx: list[dict] = []
    for row in sfx_rows:
        local: Path | None = row.get("local_path")
        if local is None:
            continue
        dest = public / "sfx" / local.name
        if not dest.exists():
            shutil.copyfile(local, dest)
        at = round_to_frame(row["template_time"] * scale)
        if at >= duration_s:
            continue
        staged_sfx.append({
            "src": f"sfx/{local.name}",
            "at": at,
            "gain": min(1.0, max(0.4, row.get("strength", 1.0))),
            "label": None,
        })

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

    cap_style = caption_style_from_template(style_dna)
    captions = derive_captions(tts_turns, cap_style)
    effects = derive_effects(video_analysis, source_duration, duration_s)

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
        "kind": "nat",
        "start": 1.0,
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

    clip_style_dna = build_clip_style_dna(style_dna, tts_turns)
    published = publish_to_library(out_mp4, dur_probed, style_dna=clip_style_dna)

    spk_turns: dict[str, int] = {}
    for t in tts_turns:
        spk_turns[t.speaker] = spk_turns.get(t.speaker, 0) + 1

    print("")
    print("==============================")
    print(f" OUTPUT: {out_mp4}")
    print(f" duration = {dur_probed:.2f}s   template = {source_duration:.2f}s")
    print(f" music sections = {len(staged_music)}   sfx = {len(staged_sfx)}   effects = {len(effects)}")
    print(f" speaker turns: {spk_turns}")
    print(f" bg: {bg_category}/{bg_src.name} @ {bg_offset:.2f}s")
    if published:
        print(f" published: clip_id={published['clip_id']}  job_id={published['job_id']}")
        print(f"            storage_key={published['video_key']}")
        print(f"            class='{PUBLISH_CLASS_NAME}'  topic_id={published['topic_id']}")
    print("==============================")


if __name__ == "__main__":
    main()
