"""
video_clip_analyzer.py
----------------------
Gaming video clip analyzer using Gemini + scene detection + smart frame
extraction. Multi-pass: coarse segmentation -> refinement -> boundary
verification + scene-cut snapping.

Usage:
    from video_clip_analyzer import VideoClipAnalyzer, AnalyzerConfig

    analyzer = VideoClipAnalyzer(api_key="...", config=AnalyzerConfig())
    result = analyzer.analyze(
        video_path="my_clip.mp4",
        clip_context="air dribble bump goal in rl",
        game_hint=None,
    )
    # result is a ClipAnalysis pydantic model
    print(result.model_dump_json(indent=2))

    # Optional helpers
    analyzer.export_json(result, "my_clip_analysis.json")
    analyzer.cut_clips(result, "my_clip.mp4", out_dir="clips/")

Requirements:
    pip install "click<8.2" google-genai "scenedetect[opencv]" imagehash Pillow pydantic
    + ffmpeg / ffprobe available on PATH
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from pydantic import BaseModel
from PIL import Image
import imagehash

from google import genai
from google.genai import types

from scenedetect import open_video, SceneManager
from scenedetect.detectors import ContentDetector


# ffmpeg/ffprobe timeouts — every subprocess call in this module must pass one
# so a wedged child can't hang the worker indefinitely. 300s covers even the
# slowest single-frame extract on a long video over a slow disk.
_FFMPEG_FRAME_TIMEOUT = 300
_FFMPEG_CUT_TIMEOUT = 300
_FFPROBE_TIMEOUT = 60


def _run_ff(cmd: list[str], *, timeout: int, label: str) -> subprocess.CompletedProcess:
    """subprocess.run that enforces a timeout and raises a clear error.

    subprocess.run already kills the child when it times out; we re-raise as a
    ``RuntimeError`` so the analyzer's usual try/except paths can handle it.
    """
    try:
        return subprocess.run(cmd, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f"{label} timed out after {timeout}s") from e


# =====================================================================
# Config
# =====================================================================
@dataclass
class AnalyzerConfig:
    model: str = "gemini-3.1-flash-lite-preview"

    # Frame extraction
    scene_threshold: float = 22.0
    max_frames: int = 60
    min_frame_gap: float = 0.2
    hash_distance_threshold: int = 5
    frame_resize_width: int = 768

    # Refinement (pass 2)
    refinement_threshold_seconds: float = 3.0
    refinement_max_frames: int = 30
    refinement_min_frame_gap: float = 0.15

    # Boundary verification (pass 3)
    snap_tolerance: float = 0.5

    # Per-segment Gemini calls (Pass 2 refine, Pass 3 verify) run in
    # parallel up to this many in flight. Segments are independent so the
    # wall clock drops ~linearly. Keep modest on a single API key so the
    # burst doesn't trip free-tier 429s; _safe_generate already retries.
    segment_concurrency: int = 6

    # Retries — max_retries is the number of attempts we'll make against a
    # single Gemini call before giving up with the last error. Key rotations
    # on 429/quota don't consume this budget (see max_key_rotations) because
    # rotating is cheap and the next key might be perfectly healthy.
    max_retries: int = 3
    max_key_rotations: int = 10

    # Refinement failure rate — if >25% of per-segment refine/verify calls
    # fail, the pass aborts with RuntimeError instead of silently returning
    # incomplete results. Tune lower if you want stricter safety.
    refinement_failure_threshold: float = 0.25

    # Logging
    verbose: bool = True

    # Cooperative cancellation — the worker sets a flag when a sibling stage
    # fails so we can stop burning Gemini calls mid-run. Python threads can't
    # be killed, so every long-running loop polls this between API calls.
    should_cancel: Callable[[], bool] = field(default=lambda: False)

    # Per-stage progress reporter. Worker binds this to emit job_events rows
    # so the frontend sees "refining 3/7" instead of a dead spinner.
    # Signature: (event_type, message, data_dict_or_None).
    progress_callback: Optional[Callable[[str, str, Optional[dict]], None]] = None


class AnalysisCancelled(RuntimeError):
    """Raised from inside the analyzer when the cancel flag flips."""


# =====================================================================
# Output schemas
# =====================================================================
class Segment(BaseModel):
    segment_index: int
    start_seconds: float
    end_seconds: float
    duration_seconds: float
    description: str
    game_action: str
    is_replay: bool
    replay_of_segment: Optional[int]
    camera_angle: str
    confidence: float
    is_highlight: bool
    intensity: float
    text_on_screen: Optional[str]
    suggested_edit_style: str
    emotion: str


class CaptionStyle(BaseModel):
    present: bool
    style_description: str
    font_feel: str              # impact-bold | rounded-sans | system-sans | handwritten | serif | mono
    weight: str                 # regular | bold | black
    case: str                   # UPPERCASE | Title Case | lowercase | Mixed
    primary_color: str          # hex or name
    stroke_color: Optional[str]
    stroke_width_px_estimate: Optional[int]
    position: str               # top | upper-third | center | lower-third | bottom
    size: str                   # small | medium | large | huge
    word_highlight: str         # none | color_swap | box | underline | scale_pulse
    highlight_color: Optional[str]
    animation: str              # static | typewriter | word_by_word | pop_in | bounce
    emoji_usage: str            # none | sparse | frequent
    background: str             # none | semi-transparent-box | solid-box


class ClipAnalysis(BaseModel):
    game_detected: str
    total_duration_seconds: float
    clip_summary: str
    highlight_summary: str
    caption_style: Optional[CaptionStyle] = None
    segments: list[Segment]


class BoundaryCheck(BaseModel):
    what_is_happening: str
    game_action: str
    is_replay: bool
    text_visible: Optional[str]
    is_highlight: bool
    boundary_looks_correct: bool


# =====================================================================
# Constants
# =====================================================================
ALLOWED_EDIT_STYLES = [
    "slow motion", "speed ramp", "hard cut", "beat sync",
    "normal", "zoom in", "freeze frame", "fast cut",
]

EDIT_STYLE_NORMALIZE = {
    "slow_motion": "slow motion", "speed_ramp": "speed ramp",
    "hard_cut": "hard cut", "fast_cut": "fast cut",
    "beat_sync": "beat sync", "zoom_in": "zoom in",
    "freeze_frame": "freeze frame", "zoom in": "zoom in",
    "slow motion": "slow motion", "speed ramp": "speed ramp",
    "hard cut": "hard cut", "fast cut": "fast cut",
    "beat sync": "beat sync", "freeze frame": "freeze frame",
    "normal": "normal",
}


def normalize_edit_style(style: str) -> str:
    lower = style.lower().strip()
    if lower in EDIT_STYLE_NORMALIZE:
        return EDIT_STYLE_NORMALIZE[lower]
    for key, val in EDIT_STYLE_NORMALIZE.items():
        if key in lower or val in lower:
            return val
    if "slow" in lower or "mo" in lower: return "slow motion"
    if "zoom" in lower: return "zoom in"
    if "fast" in lower or "cut" in lower or "hard" in lower: return "hard cut"
    if "ramp" in lower or "speed" in lower: return "speed ramp"
    if "beat" in lower or "sync" in lower: return "beat sync"
    if "freeze" in lower: return "freeze frame"
    return "normal"


# =====================================================================
# Main analyzer
# =====================================================================
class VideoClipAnalyzer:
    def __init__(self, api_key: str | list[str], config: Optional[AnalyzerConfig] = None):
        keys = [api_key] if isinstance(api_key, str) else list(api_key)
        keys = [k.strip() for k in keys if k and k.strip()]
        if not keys:
            raise ValueError("at least one api_key is required")
        self.config = config or AnalyzerConfig()
        self._clients = [genai.Client(api_key=k) for k in keys]
        self._client_idx = 0
        self._temp_dirs: list[str] = []
        self._state_lock = threading.Lock()

    @property
    def client(self):
        """Current active client (rotates on rate-limit errors)."""
        return self._clients[self._client_idx]

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    def analyze(
        self,
        video_path: str,
        clip_context: str = "",
        game_hint: Optional[str] = None,
    ) -> ClipAnalysis:
        """Run the full 3-pass pipeline on a video and return ClipAnalysis."""
        if not os.path.exists(video_path):
            raise FileNotFoundError(video_path)

        try:
            self._log(f"🎬 Scene detection on {video_path} ...")
            self._emit("video.scenes.start", "Detecting scene cuts")
            scene_boundaries, cut_points = self._detect_scenes(video_path)
            self._log(f"   {len(scene_boundaries)} scenes, {len(cut_points)} cut points")
            self._emit(
                "video.scenes.done",
                f"{len(scene_boundaries)} scene(s), {len(cut_points)} cut point(s)",
                {"scenes": len(scene_boundaries), "cuts": len(cut_points)},
            )

            self._log("🖼️  Extracting smart frames ...")
            self._emit("video.frames.start", "Extracting frames")
            frames, video_duration = self._extract_frames_smart(
                video_path, scene_boundaries, cut_points
            )
            self._log(f"   {len(frames)} frames over {video_duration:.1f}s")
            self._emit(
                "video.frames.done",
                f"{len(frames)} frame(s) over {video_duration:.1f}s",
                {"frames": len(frames), "duration_s": video_duration},
            )

            # PASS 1 — coarse
            self._check_cancel()
            prompt = self._build_prompt(
                cut_points, video_duration, len(frames), clip_context, game_hint
            )
            self._log(f"🔍 Pass 1: coarse analysis ({self.config.model}) ...")
            self._emit("video.coarse.start", f"Pass 1: coarse analysis ({self.config.model})")
            coarse = self._run_coarse_pass(frames, prompt)
            self._log(f"   {len(coarse.segments)} coarse segments")
            self._emit(
                "video.coarse.done",
                f"{len(coarse.segments)} coarse segment(s)",
                {"segments": len(coarse.segments), "game": coarse.game_detected},
            )

            # PASS 2 — refinement
            self._check_cancel()
            result = self._run_refinement_pass(
                coarse, video_path, video_duration, clip_context
            )

            # PASS 3 — snapping + boundary verification
            self._check_cancel()
            self._log("🔧 Pass 3: snapping + boundary verification ...")
            self._emit(
                "video.verify.start",
                f"Pass 3: verifying {len(result.segments)} segment(s)",
                {"total": len(result.segments)},
            )
            self._snap_boundaries_to_scene_cuts(result.segments, cut_points)
            self._verify_and_relabel_segments(
                result.segments, video_path, result.game_detected
            )
            self._emit(
                "video.verify.done",
                f"Verified {len(result.segments)} segment(s)",
                {"total": len(result.segments)},
            )
            for i, seg in enumerate(result.segments):
                seg.segment_index = i
                seg.duration_seconds = round(seg.end_seconds - seg.start_seconds, 2)

            warnings = self._validate_analysis(result, video_duration, clip_context)
            for w in warnings:
                self._log(f"   ⚠️  {w}")

            self._log(f"✅ Done — {len(result.segments)} segments")
            return result
        finally:
            self._cleanup_temp_dirs()

    # ------------------------------------------------------------------
    # Optional output helpers
    # ------------------------------------------------------------------
    def export_json(self, result: ClipAnalysis, out_path: str) -> str:
        with open(out_path, "w") as f:
            json.dump(result.model_dump(), f, indent=2)
        return out_path

    def cut_clips(
        self,
        result: ClipAnalysis,
        video_path: str,
        out_dir: str = "clips",
    ) -> list[dict]:
        """Cut each segment into its own MP4 file. Returns list of {seg, path}."""
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        clip_files = []
        for seg in result.segments:
            tag = seg.game_action.replace(" ", "_").replace("/", "-")
            replay = "_REPLAY" if seg.is_replay else ""
            highlight = "_HIGHLIGHT" if seg.is_highlight else ""
            out_file = out / f"{seg.segment_index:02d}_{tag}{replay}{highlight}.mp4"
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(seg.start_seconds),
                "-i", video_path,
                "-t", str(seg.duration_seconds),
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-c:a", "aac", "-b:a", "128k",
                "-avoid_negative_ts", "make_zero",
                str(out_file),
            ]
            _run_ff(cmd, timeout=_FFMPEG_CUT_TIMEOUT, label="ffmpeg cut_clips")
            clip_files.append({"seg": seg, "path": str(out_file)})
        return clip_files

    # ==================================================================
    # Internals
    # ==================================================================
    def _log(self, msg: str) -> None:
        if self.config.verbose:
            print(msg)

    def _check_cancel(self) -> None:
        """Raise AnalysisCancelled if the worker has signalled abort."""
        if self.config.should_cancel():
            raise AnalysisCancelled("analysis cancelled by sibling stage failure")

    def _emit(self, event_type: str, message: str,
              data: Optional[dict] = None) -> None:
        """Forward a progress event to the worker, swallowing errors."""
        cb = self.config.progress_callback
        if cb is None:
            return
        try:
            cb(event_type, message, data)
        except Exception:  # noqa: BLE001 — telemetry never crashes analysis
            pass

    def _track_temp(self, path: str) -> str:
        self._temp_dirs.append(path)
        return path

    def _cleanup_temp_dirs(self) -> None:
        for d in self._temp_dirs:
            if os.path.exists(d):
                shutil.rmtree(d, ignore_errors=True)
        self._temp_dirs.clear()

    # ---------------- Scene detection / frame extraction --------------
    def _detect_scenes(self, video_path: str):
        video = open_video(video_path)
        sm = SceneManager()
        sm.add_detector(ContentDetector(threshold=self.config.scene_threshold))
        sm.detect_scenes(video)
        scene_list = sm.get_scene_list()
        boundaries = [
            {"start": round(s[0].get_seconds(), 2),
             "end": round(s[1].get_seconds(), 2)}
            for s in scene_list
        ]
        cut_points = [round(s[0].get_seconds(), 2) for s in scene_list]
        if cut_points and cut_points[0] == 0.0:
            cut_points = cut_points[1:]
        return boundaries, cut_points

    @staticmethod
    def _get_video_duration(video_path: str) -> float:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=_FFPROBE_TIMEOUT,
            )
        except subprocess.TimeoutExpired as e:
            raise RuntimeError(f"ffprobe timed out after {_FFPROBE_TIMEOUT}s") from e
        return float(result.stdout.strip())

    def _extract_frames_smart(self, video_path, scene_boundaries, cut_points):
        cfg = self.config
        duration = self._get_video_duration(video_path)
        candidates = set()

        for cp in cut_points:
            candidates.add(round(cp + 0.05, 2))
            if cp > 0.1:
                candidates.add(round(cp - 0.05, 2))

        interval = max(cfg.min_frame_gap, duration / (cfg.max_frames * 1.5))
        t = 0.1
        while t < duration - 0.1:
            candidates.add(round(t, 2))
            t += interval
        candidates.add(0.1)
        candidates.add(round(max(0.1, duration - 0.5), 2))

        sorted_times = sorted(candidates)
        filtered = [sorted_times[0]]
        for t in sorted_times[1:]:
            if t - filtered[-1] >= cfg.min_frame_gap:
                filtered.append(t)

        frame_dir = self._track_temp(tempfile.mkdtemp(prefix="frames_"))
        extracted = []
        for i, t in enumerate(filtered):
            out_path = os.path.join(frame_dir, f"frame_{i:04d}_{t:.2f}s.png")
            cmd = [
                "ffmpeg", "-y", "-ss", str(t), "-i", video_path,
                "-vframes", "1", "-vf", f"scale={cfg.frame_resize_width}:-1",
                "-q:v", "2", out_path,
            ]
            _run_ff(cmd, timeout=_FFMPEG_FRAME_TIMEOUT, label="ffmpeg extract_frames")
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                extracted.append({"time": t, "path": out_path})

        # Dedup by perceptual hash
        if cfg.hash_distance_threshold > 0:
            deduped, seen = [], []
            for f in extracted:
                h = imagehash.phash(Image.open(f["path"]))
                if not any(h - sh < cfg.hash_distance_threshold for sh in seen):
                    deduped.append(f)
                    seen.append(h)
            extracted = deduped

        # Trim to max_frames, prioritizing scene cuts and gap-filling
        if len(extracted) > cfg.max_frames:
            cut_set = set(round(cp + 0.05, 2) for cp in cut_points)
            cut_set.update(round(cp - 0.05, 2) for cp in cut_points if cp > 0.1)
            tagged = [
                {**f, "is_cut": any(abs(f["time"] - c) < 0.15 for c in cut_set)}
                for f in extracted
            ]
            kept = [f for f in tagged if f["is_cut"]]
            others = [f for f in tagged if not f["is_cut"]]
            remaining = cfg.max_frames - len(kept)
            all_sorted = sorted(kept, key=lambda f: f["time"])
            available = list(others)
            for _ in range(max(0, remaining)):
                if not available:
                    break
                current = sorted([f["time"] for f in all_sorted])
                if current:
                    gaps = [(0, current[0])]
                    for j in range(len(current) - 1):
                        gaps.append((current[j], current[j + 1]))
                    gaps.append((current[-1], duration))
                else:
                    gaps = [(0, duration)]
                largest = max(gaps, key=lambda g: g[1] - g[0])
                mid = (largest[0] + largest[1]) / 2
                best = min(available, key=lambda f: abs(f["time"] - mid))
                all_sorted.append(best)
                available.remove(best)
            extracted = sorted(all_sorted, key=lambda f: f["time"])[: cfg.max_frames]
            extracted = [{"time": f["time"], "path": f["path"]} for f in extracted]

        return extracted, duration

    # ---------------- Prompt building ---------------------------------
    @staticmethod
    def _build_prompt(cut_points, video_duration, num_frames,
                      clip_context="", game_hint=None) -> str:
        scene_hint = ""
        if cut_points:
            cuts_str = ", ".join(f"{t:.1f}s" for t in cut_points)
            scene_hint = (
                "SCENE BOUNDARY HINTS (from automated detection):\n"
                f"Visual scene changes were detected at: {cuts_str}\n"
                "These are likely segment boundaries. Use them as anchors "
                "but adjust based on what you see.\n"
            )

        context_hint = ""
        if clip_context:
            context_hint = (
                f'\nUSER CONTEXT (player describes this clip as):\n"{clip_context}"\n'
                "Mark the segment(s) corresponding to this action as is_highlight=true. "
                "Setup/aftermath segments are NOT highlights.\n"
            )

        game_hint_str = ""
        if game_hint:
            game_hint_str = (
                f"\nGAME IDENTIFICATION:\nThis clip is from: {game_hint}\n"
                "Use game-specific knowledge for actions, UI, and mechanics.\n"
            )

        edit_styles_str = ", ".join(f'"{s}"' for s in ALLOWED_EDIT_STYLES)

        return f"""You are an expert gaming clip analyst. You are given {num_frames} timestamped frames
extracted from a {video_duration:.1f}-second video clip. Analyze them and break the video
into discrete segments — every distinct action or event gets its own segment.

{scene_hint}{context_hint}{game_hint_str}
RULES:
1. Each segment = one distinct action.
2. Detect REPLAYS: if the game shows the same play from a different camera angle,
   mark is_replay=true and set replay_of_segment to the original segment's index.
3. Identify the game (Rocket League, Minecraft Bedwars, Valorant, etc.).
4. Use DECIMAL SECONDS for timestamps. Sub-second precision matters.
5. Be granular — aim for segments 1-3 seconds each. >3s should be rare.
6. Describe camera_angle for each segment.
7. Set confidence 0.0-1.0 realistically (avg ~0.7-0.8).
8. Frame timestamps are provided — anchor segments precisely.

ENHANCED FIELDS:
9. is_highlight: true ONLY for actual impact moments (kills, goals, clutch).
10. intensity: DECIMAL 0.0-1.0 (NOT 1-10). e.g. walking=0.2, kill=0.85, ace=1.0.
11. text_on_screen: any visible text or null.
12. suggested_edit_style: MUST be one of: {edit_styles_str}.
13. emotion: "hype", "tense", "funny", "calm", "satisfying", "dramatic", "intense", "neutral", "focused".
14. highlight_summary: one-sentence summary of just the highlight.

CAPTION STYLE (top-level `caption_style` field — describes captions/subtitles across the whole clip):
- present: true only if on-screen captions/subtitles/word-text exist.
- style_description: one concise sentence describing the look.
- font_feel: "impact-bold" | "rounded-sans" | "system-sans" | "handwritten" | "serif" | "mono".
- weight: "regular" | "bold" | "black".
- case: "UPPERCASE" | "Title Case" | "lowercase" | "Mixed".
- primary_color: hex "#RRGGBB" or common name ("white").
- stroke_color: hex or null.
- stroke_width_px_estimate: integer px or null.
- position: "top" | "upper-third" | "center" | "lower-third" | "bottom".
- size: "small" | "medium" | "large" | "huge".
- word_highlight: "none" | "color_swap" | "box" | "underline" | "scale_pulse".
- highlight_color: hex or null.
- animation: "static" | "typewriter" | "word_by_word" | "pop_in" | "bounce".
- emoji_usage: "none" | "sparse" | "frequent".
- background: "none" | "semi-transparent-box" | "solid-box".
If no captions are present, set present=false; other fields may use neutral defaults.

Return ONLY valid JSON matching the provided schema."""

    # ---------------- Gemini calls ------------------------------------
    def _safe_generate(self, contents, config=None):
        """Call Gemini with retries; rotate API keys on rate-limit/503 errors.

        Key rotations are free — they don't consume ``max_retries``. A user
        with 3 keys hitting rate limits should cycle through all three before
        the retry budget drops at all. The hard cap is
        ``max_retries + max_key_rotations`` total iterations of the loop so an
        adversarial sequence of errors can't spin forever.
        """
        num_clients = len(self._clients)
        error_retries = 0
        key_rotations = 0
        max_iterations = self.config.max_retries + self.config.max_key_rotations
        last_err: Exception | None = None

        for _iter in range(max_iterations):
            self._check_cancel()
            try:
                response = self.client.models.generate_content(
                    model=self.config.model, contents=contents, config=config
                )
                if not response.text:
                    error_retries += 1
                    self._log(
                        f"⚠️ Empty response "
                        f"(retry {error_retries}/{self.config.max_retries})"
                    )
                    if error_retries >= self.config.max_retries:
                        raise RuntimeError("Gemini returned empty response after all retries")
                    time.sleep(2 ** (error_retries - 1))
                    continue
                return response
            except AnalysisCancelled:
                raise
            except Exception as e:
                last_err = e
                key_tag = f"key {self._client_idx + 1}/{num_clients}"
                msg = str(e).lower()
                rate_limited = any(
                    t in msg for t in
                    ("429", "resource_exhausted", "quota", "rate limit")
                )
                if rate_limited and num_clients > 1 and key_rotations < self.config.max_key_rotations:
                    with self._state_lock:
                        self._client_idx = (self._client_idx + 1) % num_clients
                        new_idx = self._client_idx
                    key_rotations += 1
                    self._log(
                        f"   ↪ rotating to key {new_idx + 1}/{num_clients} "
                        f"({key_rotations}/{self.config.max_key_rotations})"
                    )
                    continue  # rotation doesn't consume retry budget
                error_retries += 1
                self._log(
                    f"❌ Error on {key_tag} "
                    f"(retry {error_retries}/{self.config.max_retries}): {e}"
                )
                if error_retries >= self.config.max_retries:
                    break
                time.sleep(2 ** (error_retries - 1))
        if last_err:
            raise last_err
        raise RuntimeError("Gemini generate_content exhausted retries with no response")

    def _frames_to_contents(self, frames) -> list:
        contents = []
        for i, frame in enumerate(frames):
            contents.append(f"[Frame {i + 1}/{len(frames)} — t={frame['time']:.2f}s]")
            with open(frame["path"], "rb") as f:
                data = f.read()
            contents.append(
                types.Part(inline_data=types.Blob(data=data, mime_type="image/png"))
            )
        return contents

    def _run_coarse_pass(self, frames, prompt) -> ClipAnalysis:
        contents = self._frames_to_contents(frames) + [prompt]
        response = self._safe_generate(
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ClipAnalysis,
            ),
        )
        return ClipAnalysis.model_validate_json(response.text)

    # ---------------- Pass 2: refinement ------------------------------
    def _run_refinement_pass(self, coarse: ClipAnalysis, video_path: str,
                             video_duration: float, clip_context: str) -> ClipAnalysis:
        cfg = self.config
        long_indices = [
            i for i, s in enumerate(coarse.segments)
            if s.duration_seconds > cfg.refinement_threshold_seconds
        ]
        if not long_indices:
            return coarse

        self._log(f"🔬 Pass 2: refining {len(long_indices)} long segments ...")
        self._emit(
            "video.refine.start",
            f"Pass 2: refining {len(long_indices)} long segment(s)",
            {"total": len(long_indices)},
        )

        # Independent per-segment Gemini calls — run the long ones in parallel.
        # Short segs pass through unchanged; results are merged back in original
        # timeline order so downstream indexing stays sane.
        refined_by_idx: dict[int, list[Segment]] = {}
        progress = {"done": 0, "failed": 0}
        progress_lock = threading.Lock()
        workers = max(1, min(cfg.segment_concurrency, len(long_indices)))

        def _refine(idx: int) -> tuple[int, list[Segment], bool]:
            self._check_cancel()
            seg = coarse.segments[idx]
            subs, failed = self._refine_segment(
                seg, video_path, coarse.game_detected, clip_context
            )
            with progress_lock:
                progress["done"] += 1
                if failed:
                    progress["failed"] += 1
                self._emit(
                    "video.refine.progress",
                    f"Refining {progress['done']}/{len(long_indices)}",
                    {
                        "current": progress["done"],
                        "total": len(long_indices),
                        "failed": progress["failed"],
                    },
                )
            return idx, subs, failed

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_refine, i) for i in long_indices]
            for fut in as_completed(futures):
                idx, subs, _failed = fut.result()
                refined_by_idx[idx] = subs

        failed_count = progress["failed"]
        total = len(long_indices)
        if total and (failed_count / total) > cfg.refinement_failure_threshold:
            raise RuntimeError(
                f"refinement failure rate {failed_count}/{total} exceeds "
                f"{cfg.refinement_failure_threshold:.0%} threshold"
            )

        # Assemble the flat timeline AND a per-old-index → new-index map so we
        # can remap replay_of_segment references below. An old segment that
        # got split produces multiple new indices; point the replay at the
        # first chunk (that's where the action the replay references starts).
        # If an old index was dropped entirely (refinement returned []),
        # we record None so the caller can null the backref.
        all_refined: list[Segment] = []
        old_to_new: dict[int, Optional[int]] = {}
        was_split: dict[int, bool] = {}
        for i, seg in enumerate(coarse.segments):
            new_idx = len(all_refined)
            if i in refined_by_idx:
                subs = refined_by_idx[i]
                if not subs:
                    old_to_new[i] = None
                    was_split[i] = True
                    continue
                old_to_new[i] = new_idx
                was_split[i] = len(subs) > 1
                all_refined.extend(subs)
            else:
                old_to_new[i] = new_idx
                was_split[i] = False
                all_refined.append(seg)

        self._remap_replay_refs(all_refined, coarse.segments, old_to_new, was_split)

        self._emit(
            "video.refine.done",
            f"Refined into {len(all_refined)} segment(s)",
            {
                "total": len(all_refined),
                "failed": failed_count,
                "attempted": total,
            },
        )

        for i, s in enumerate(all_refined):
            s.segment_index = i

        return ClipAnalysis(
            game_detected=coarse.game_detected,
            total_duration_seconds=coarse.total_duration_seconds,
            clip_summary=coarse.clip_summary,
            highlight_summary=coarse.highlight_summary,
            caption_style=coarse.caption_style,
            segments=all_refined,
        )

    def _remap_replay_refs(
        self,
        refined: list[Segment],
        original: list[Segment],
        old_to_new: dict[int, Optional[int]],
        was_split: dict[int, bool],
    ) -> None:
        """Rewrite ``replay_of_segment`` values to point at the new indices.

        After refinement splits some coarse segments, the indices move. If the
        referenced original segment was split (or dropped), clear the backref —
        pointing at "the first chunk of a split" is usually wrong and would
        show confusing replay relationships in the UI. Better to drop it.
        """
        for seg in refined:
            ref = seg.replay_of_segment
            if ref is None:
                continue
            if ref < 0 or ref >= len(original):
                seg.replay_of_segment = None
                continue
            new_idx = old_to_new.get(ref)
            if new_idx is None or was_split.get(ref, False):
                self._log(
                    f"   ↳ dropping replay_of_segment={ref} "
                    f"(segment was split or removed during refinement)"
                )
                seg.replay_of_segment = None
            else:
                seg.replay_of_segment = new_idx

    def _refine_segment(self, seg: Segment, video_path: str,
                        game_detected: str, clip_context: str) -> tuple[list[Segment], bool]:
        """Return (sub_segments, failed).

        On success: a list of refined segments (or [seg] if the segment was too
        short to split) and failed=False. On an exception inside the Gemini
        call we return the original segment and failed=True so the caller can
        track the refinement failure rate across the batch.
        """
        cfg = self.config
        seg_dir = self._track_temp(
            tempfile.mkdtemp(prefix=f"refine_seg{seg.segment_index}_")
        )
        seg_frames = []
        interval = max(cfg.refinement_min_frame_gap,
                       seg.duration_seconds / cfg.refinement_max_frames)
        t = seg.start_seconds
        idx = 0
        while t < seg.end_seconds and idx < cfg.refinement_max_frames:
            out_path = os.path.join(seg_dir, f"frame_{idx:04d}_{t:.2f}s.png")
            cmd = [
                "ffmpeg", "-y", "-ss", str(t), "-i", video_path,
                "-vframes", "1", "-vf", f"scale={cfg.frame_resize_width}:-1",
                "-q:v", "2", out_path,
            ]
            _run_ff(cmd, timeout=_FFMPEG_FRAME_TIMEOUT, label="ffmpeg refine_frame")
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                seg_frames.append({"time": round(t, 2), "path": out_path})
            t += interval
            idx += 1

        # Dedup
        if cfg.hash_distance_threshold > 0 and len(seg_frames) > 1:
            deduped, seen = [], []
            for sf in seg_frames:
                h = imagehash.phash(Image.open(sf["path"]))
                if not any(h - sh < cfg.hash_distance_threshold for sh in seen):
                    deduped.append(sf)
                    seen.append(h)
            seg_frames = deduped

        if len(seg_frames) < 3:
            return [seg], False

        context_reminder = ""
        if clip_context:
            context_reminder = (
                f'\nREMINDER — full clip context: "{clip_context}"\n'
                "Use it for is_highlight and emotion.\n"
            )

        edit_styles_str = ", ".join(f'"{s}"' for s in ALLOWED_EDIT_STYLES)
        refine_prompt = f"""You are refining a segment of a gaming clip. The COARSE analysis identified this
as one segment, but it's too long ({seg.duration_seconds:.1f}s). Break it into SMALLER sub-segments.

ORIGINAL SEGMENT:
- Time: {seg.start_seconds:.1f}s to {seg.end_seconds:.1f}s
- Action: {seg.game_action}
- Description: {seg.description}
- Game: {game_detected}
{context_reminder}
You are given {len(seg_frames)} timestamped frames from ONLY this segment window.
Break this segment into 2-5 smaller sub-segments (aim for 1-2 seconds each).

RULES:
1. All timestamps MUST be between {seg.start_seconds:.2f}s and {seg.end_seconds:.2f}s.
2. Sub-segments must cover the full range with no gaps.
3. Be granular — every distinct action gets its own sub-segment.
4. Fill ALL fields including is_highlight, intensity, text_on_screen, suggested_edit_style, emotion.
5. Use segment_index starting from 0 (we'll re-index later).
6. Set game_detected to "{game_detected}".

CRITICAL FIELD RULES:
- intensity MUST be DECIMAL 0.0-1.0 (NOT 1-10). e.g. walking=0.2, kill=0.85.
- is_highlight: ONLY true for actual impact moments.
- suggested_edit_style MUST be one of: {edit_styles_str}
- confidence: realistic, mostly 0.6-0.8.

Return ONLY valid JSON matching the provided schema."""

        contents = self._frames_to_contents(seg_frames) + [refine_prompt]
        try:
            resp = self._safe_generate(
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ClipAnalysis,
                ),
            )
            if resp and resp.text:
                refined = ClipAnalysis.model_validate_json(resp.text)
                return list(refined.segments), False
        except AnalysisCancelled:
            raise
        except Exception as e:
            self._log(f"   ❌ Refinement failed for seg {seg.segment_index}: {e}")
            self._emit(
                "video.refine.segment_failed",
                f"Refinement failed for seg {seg.segment_index}: {e}",
                {"segment_index": seg.segment_index, "error": str(e)},
            )
            return [seg], True
        # Empty-but-no-exception path: treat as a non-fatal pass-through.
        return [seg], False

    # ---------------- Pass 3: snap + verify ---------------------------
    def _snap_boundaries_to_scene_cuts(self, segments, cut_points) -> int:
        if not cut_points:
            return 0
        snapped = 0
        tol = self.config.snap_tolerance
        for seg in segments:
            best_s = min(cut_points, key=lambda cp: abs(seg.start_seconds - cp))
            if abs(seg.start_seconds - best_s) <= tol:
                seg.start_seconds = best_s
                snapped += 1
            best_e = min(cut_points, key=lambda cp: abs(seg.end_seconds - cp))
            if abs(seg.end_seconds - best_e) <= tol:
                seg.end_seconds = best_e
                snapped += 1
            seg.duration_seconds = round(seg.end_seconds - seg.start_seconds, 2)
        return snapped

    def _verify_and_relabel_segments(self, segments, video_path, game_detected) -> int:
        cfg = self.config
        total = len(segments)
        if total == 0:
            return 0

        state = {"fixes": 0, "done": 0, "failed": 0}
        state_lock = threading.Lock()
        workers = max(1, min(cfg.segment_concurrency, total))

        def _verify(seg) -> None:
            self._check_cancel()
            fixed, failed = self._verify_single_segment(seg, video_path, game_detected)
            with state_lock:
                state["done"] += 1
                state["fixes"] += fixed
                if failed:
                    state["failed"] += 1
                self._emit(
                    "video.verify.progress",
                    f"Verifying {state['done']}/{total}",
                    {
                        "current": state["done"],
                        "total": total,
                        "failed": state["failed"],
                    },
                )

        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(_verify, segments))

        failed = state["failed"]
        if total and (failed / total) > cfg.refinement_failure_threshold:
            raise RuntimeError(
                f"verification failure rate {failed}/{total} exceeds "
                f"{cfg.refinement_failure_threshold:.0%} threshold"
            )
        return state["fixes"]

    def _verify_single_segment(self, seg, video_path, game_detected) -> tuple[int, bool]:
        """Return (fixes_applied, failed).

        failed=True means the Gemini call raised (not just "no changes needed").
        The caller uses failed to compute a batch failure rate and may abort
        the whole pass if too many segments flake out.
        """
        cfg = self.config
        check_times = [
            seg.start_seconds,
            min(seg.start_seconds + 0.2, seg.end_seconds),
            min(seg.start_seconds + 0.5, seg.end_seconds),
        ]
        check_dir = self._track_temp(
            tempfile.mkdtemp(prefix=f"verify_seg{seg.segment_index}_")
        )
        check_frames = []
        for frame_idx, t in enumerate(check_times):
            out_path = os.path.join(check_dir, f"check_{frame_idx}_{t:.2f}s.png")
            cmd = [
                "ffmpeg", "-y", "-ss", str(t), "-i", video_path,
                "-vframes", "1", "-vf", f"scale={cfg.frame_resize_width}:-1",
                "-q:v", "2", out_path,
            ]
            _run_ff(cmd, timeout=_FFMPEG_FRAME_TIMEOUT, label="ffmpeg verify_frame")
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                check_frames.append({"time": t, "path": out_path})

        if len(check_frames) < 2:
            return 0, False

        verify_prompt = f"""Look at these {len(check_frames)} frames from a {game_detected} clip.
Current label: "{seg.game_action}" ({seg.start_seconds:.1f}s to {seg.end_seconds:.1f}s)
Current description: "{seg.description}"

Tell me:
1. What is ACTUALLY happening on screen? Be specific.
2. What should the game_action label be? (e.g. "goal explosion", "aerial dribble",
   "kickoff", "replay start", "scoreboard", "demolition", etc.)
3. Is this a replay?
4. What text is visible?
5. Is this a highlight moment?
6. Does the start frame look like a clean cut for this action, or did the action
   start before?

Return JSON."""

        verify_contents = self._frames_to_contents(check_frames) + [verify_prompt]
        fixed = 0
        failed = False
        try:
            resp = self._safe_generate(
                contents=verify_contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=BoundaryCheck,
                ),
            )
            if resp and resp.text:
                check = BoundaryCheck.model_validate_json(resp.text)
                old_action = seg.game_action
                if check.game_action.lower().strip() != old_action.lower().strip():
                    seg.game_action = check.game_action
                    seg.description = check.what_is_happening
                    fixed = 1
                if check.is_replay != seg.is_replay:
                    seg.is_replay = check.is_replay
                if check.is_highlight != seg.is_highlight:
                    seg.is_highlight = check.is_highlight
                if check.text_visible:
                    seg.text_on_screen = check.text_visible
                if not check.boundary_looks_correct:
                    seg.confidence = min(seg.confidence, 0.6)
        except AnalysisCancelled:
            raise
        except Exception as e:
            self._log(f"   ❌ Verify failed for seg {seg.segment_index}: {e}")
            self._emit(
                "video.verify.segment_failed",
                f"Verify failed for seg {seg.segment_index}: {e}",
                {"segment_index": seg.segment_index, "error": str(e)},
            )
            failed = True
        return fixed, failed

    # ---------------- Validation --------------------------------------
    def _validate_analysis(self, result: ClipAnalysis, actual_duration: float,
                           clip_context: str = "") -> list[str]:
        warnings: list[str] = []

        # Drop / fix zero- and negative-duration segments *before* doing any
        # other validation work. Previously we only warned and left them in,
        # which produced ffmpeg "duration=0" errors down the line in cut_clips.
        # For start > end we try a swap when it keeps the range inside the
        # video; for start == end there's nothing to salvage, drop it.
        cleaned: list[Segment] = []
        dropped_count = 0
        for seg in result.segments:
            if seg.start_seconds < seg.end_seconds:
                cleaned.append(seg)
                continue
            if seg.start_seconds == seg.end_seconds:
                dropped_count += 1
                warnings.append(
                    f"Segment {seg.segment_index}: start == end "
                    f"({seg.start_seconds}s) — dropped"
                )
                continue
            # start > end: swap if the swapped range is valid.
            lo, hi = seg.end_seconds, seg.start_seconds
            if lo >= 0 and hi <= actual_duration + 1.0 and hi > lo:
                warnings.append(
                    f"Segment {seg.segment_index}: start ({seg.start_seconds}) "
                    f"> end ({seg.end_seconds}) — swapped"
                )
                seg.start_seconds = lo
                seg.end_seconds = hi
                seg.duration_seconds = round(hi - lo, 2)
                cleaned.append(seg)
            else:
                dropped_count += 1
                warnings.append(
                    f"Segment {seg.segment_index}: start > end and swap "
                    f"out-of-bounds — dropped"
                )

        if dropped_count:
            self._log(
                f"   ⚠️  dropped {dropped_count} invalid-duration segment(s)"
            )
        # Re-index after drop so downstream users get 0..N-1.
        for i, seg in enumerate(cleaned):
            seg.segment_index = i
        result.segments = cleaned

        for seg in result.segments:
            expected_dur = round(seg.end_seconds - seg.start_seconds, 2)
            if abs(seg.duration_seconds - expected_dur) > 0.5:
                warnings.append(
                    f"Segment {seg.segment_index}: duration {seg.duration_seconds}s "
                    f"doesn't match start/end (expected {expected_dur}s)"
                )
                seg.duration_seconds = expected_dur

            if not (0 <= seg.confidence <= 1):
                warnings.append(
                    f"Segment {seg.segment_index}: confidence {seg.confidence} "
                    "out of [0,1] — clamped"
                )
                seg.confidence = max(0, min(1, seg.confidence))

            # Auto-fix intensity scale
            if seg.intensity > 1.0:
                old = seg.intensity
                seg.intensity = round(seg.intensity / 10.0, 2) if seg.intensity <= 10.0 else 1.0
                warnings.append(
                    f"Segment {seg.segment_index}: intensity {old} on wrong scale "
                    f"— auto-fixed to {seg.intensity}"
                )
            elif seg.intensity < 0:
                seg.intensity = 0.0

            original_style = seg.suggested_edit_style
            seg.suggested_edit_style = normalize_edit_style(original_style)
            if seg.suggested_edit_style != original_style:
                warnings.append(
                    f"Segment {seg.segment_index}: edit style '{original_style}' "
                    f"normalized to '{seg.suggested_edit_style}'"
                )

            if seg.is_replay and seg.replay_of_segment is not None:
                valid_indices = [s.segment_index for s in result.segments if not s.is_replay]
                if seg.replay_of_segment not in valid_indices:
                    warnings.append(
                        f"Segment {seg.segment_index}: replay_of_segment "
                        f"{seg.replay_of_segment} doesn't reference a valid non-replay segment"
                    )

            if seg.start_seconds < 0 or seg.end_seconds > actual_duration + 1.0:
                warnings.append(
                    f"Segment {seg.segment_index}: timestamps "
                    f"[{seg.start_seconds}, {seg.end_seconds}] outside video "
                    f"duration ({actual_duration}s)"
                )

        for i in range(1, len(result.segments)):
            if result.segments[i].start_seconds < result.segments[i - 1].start_seconds:
                warnings.append(f"Segments {i-1} and {i} are out of order")

        for i in range(1, len(result.segments)):
            prev = result.segments[i - 1]
            curr = result.segments[i]
            if curr.start_seconds < prev.end_seconds - 0.1:
                warnings.append(
                    f"Segments {prev.segment_index} and {curr.segment_index} "
                    f"overlap: {prev.end_seconds} > {curr.start_seconds}"
                )

        if result.segments and actual_duration > 0:
            covered = sum(s.duration_seconds for s in result.segments)
            coverage_pct = covered / actual_duration * 100
            if coverage_pct < 70:
                warnings.append(
                    f"Segments only cover {coverage_pct:.0f}% of video "
                    f"({covered:.1f}s / {actual_duration:.1f}s)"
                )

        if clip_context:
            highlights = [s for s in result.segments if s.is_highlight]
            if not highlights:
                warnings.append(
                    "No segments marked as is_highlight=true despite user providing clip context"
                )

        return warnings


# =====================================================================
# CLI entry point
# =====================================================================
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Analyze a gaming video clip with Gemini.")
    parser.add_argument("video", help="Path to the input MP4 file")
    parser.add_argument("--api-key", default=os.environ.get("GEMINI_API_KEY"),
                        help="Gemini API key (or set GEMINI_API_KEY env var)")
    parser.add_argument("--context", default="", help="User-provided clip context")
    parser.add_argument("--game", default=None, help="Game hint (optional)")
    parser.add_argument("--model", default="gemini-3.1-flash-lite-preview")
    parser.add_argument("--output", default=None, help="Output JSON path")
    parser.add_argument("--cut-clips", action="store_true",
                        help="Also cut segment MP4s into ./clips/")
    args = parser.parse_args()

    if not args.api_key:
        raise SystemExit("Provide --api-key or set GEMINI_API_KEY env var")

    cfg = AnalyzerConfig(model=args.model)
    analyzer = VideoClipAnalyzer(api_key=args.api_key, config=cfg)
    result = analyzer.analyze(
        video_path=args.video,
        clip_context=args.context,
        game_hint=args.game,
    )

    out_path = args.output or args.video.rsplit(".", 1)[0] + "_analysis.json"
    analyzer.export_json(result, out_path)
    print(f"💾 Saved analysis -> {out_path}")

    if args.cut_clips:
        clips = analyzer.cut_clips(result, args.video)
        print(f"✂️  Cut {len(clips)} clips into ./clips/")
