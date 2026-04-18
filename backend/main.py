import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

# Put local ffmpeg-shared build on PATH so torchcodec can find avcodec/avformat DLLs.
# Must happen before any import that loads torchaudio/torchcodec (worker chain).
_FFMPEG_BIN = Path(__file__).parent / "ffmpeg_shared" / "bin"
if _FFMPEG_BIN.exists():
    os.environ["PATH"] = str(_FFMPEG_BIN) + os.pathsep + os.environ.get("PATH", "")
    try:
        os.add_dll_directory(str(_FFMPEG_BIN))
    except (AttributeError, OSError):
        pass

from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile,
)

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from supabase_client import get_supabase
from worker import process_job

app = FastAPI(title="Reelize Backend")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/analyze")
async def analyze(
    background: BackgroundTasks,
    video: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None),
    clip_context: str = Form(""),
    game_hint: Optional[str] = Form(None),
) -> dict:
    """Kick off a new analysis job. Provide either a `url` or an uploaded `video`."""
    if not url and not video:
        raise HTTPException(400, "Provide either `url` or `video`")
    if url and video:
        raise HTTPException(400, "Provide only one of `url` or `video`")
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(500, "GEMINI_API_KEY not set")

    source_type = "url" if url else "upload"

    row = {
        "status": "queued",
        "source_type": source_type,
        "source_url": url,
        "clip_context": clip_context,
        "game_hint": game_hint,
    }
    resp = get_supabase().table("jobs").insert(row).execute()
    job_id = resp.data[0]["id"]

    upload_path: Optional[str] = None
    if video is not None:
        upload_dir = Path(f"tmp/jobs/{job_id}")
        upload_dir.mkdir(parents=True, exist_ok=True)
        upload_path = str(upload_dir / "video.mp4")
        with open(upload_path, "wb") as f:
            shutil.copyfileobj(video.file, f)

    background.add_task(
        process_job,
        job_id=job_id,
        source_type=source_type,
        source_url=url,
        upload_path=upload_path,
        clip_context=clip_context,
        game_hint=game_hint,
    )
    return {"job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    resp = (
        get_supabase()
        .table("jobs")
        .select("*")
        .eq("id", job_id)
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(404, "job not found")
    return resp.data


@app.get("/jobs")
def list_jobs(limit: int = 20) -> list[dict]:
    resp = (
        get_supabase()
        .table("jobs")
        .select("id,status,source_type,source_url,created_at,updated_at,error")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data or []
