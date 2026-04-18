import json
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
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
    BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile,
)
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from auth import CurrentUser, get_current_user
from storage import get_storage
from supabase_client import get_supabase
from worker import process_job

app = FastAPI(title="Reelize Backend")


@app.on_event("startup")
def _reconcile_orphaned_jobs() -> None:
    """Mark any `queued` / `running` jobs as failed at boot.

    If the container restarts (rebuild, OOM, crash) while a worker is
    processing a job, the DB row is left stuck forever — the Python process
    that owned it is gone. Because we run exactly one backend instance in
    this deployment, any non-terminal job at startup must be an orphan from
    the previous container.
    """
    try:
        sb = get_supabase()
        stale = (
            sb.table("jobs")
            .select("id,status")
            .in_("status", ["queued", "running"])
            .execute()
            .data or []
        )
        if not stale:
            return
        now = datetime.now(timezone.utc).isoformat()
        for row in stale:
            jid = row["id"]
            sb.table("jobs").update({
                "status": "failed",
                "error": "RuntimeError: orphaned by container restart",
                "updated_at": now,
            }).eq("id", jid).execute()
        logging.getLogger(__name__).warning(
            "reconciled %d orphaned job(s) on startup: %s",
            len(stale), [r["id"] for r in stale],
        )
    except Exception as e:  # noqa: BLE001 — reconciliation must not block startup
        logging.getLogger(__name__).warning("orphan reconciliation failed: %s", e)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


class SignUploadBody(BaseModel):
    filename: str
    content_type: Optional[str] = "video/mp4"


_UPLOAD_PREFIX = "uploads"
# Keys expire on the server side (~2h); we'll clean them up from the worker
# after downloading the bytes, so dangling upload blobs are the exception not
# the rule.


@app.post("/uploads/sign")
def sign_upload(
    body: SignUploadBody,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Mint a one-shot direct-upload URL for the frontend.

    The tunnel/proxy between the browser and this host can't carry multi-MB
    uploads reliably — it times out before the handler fires. Instead, the
    frontend asks here for a signed URL, uploads the bytes straight to object
    storage (Supabase/R2), and then hits `/analyze` with the resulting key.
    """
    # Scope the key under the user so a stolen signed URL can't be used to
    # target someone else's bucket space, and so /analyze can cheaply verify
    # ownership without a DB round-trip.
    ext = Path(body.filename).suffix.lower() or ".mp4"
    if ext not in {".mp4", ".mov", ".webm", ".mkv", ".m4v"}:
        raise HTTPException(400, f"unsupported video extension: {ext}")
    key = f"{_UPLOAD_PREFIX}/{user.id}/{uuid.uuid4()}{ext}"
    try:
        info = get_storage().signed_upload_url(key)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"failed to sign upload: {e}") from e
    return {
        "key": key,
        "upload_url": info["url"],
        "token": info["token"],
        "path": info["path"],
        "bucket": info["bucket"],
        "content_type": body.content_type or "video/mp4",
    }


@app.post("/analyze")
async def analyze(
    background: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    video: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None),
    upload_key: Optional[str] = Form(None),
    clip_context: str = Form(""),
    game_hint: Optional[str] = Form(None),
    clip_id: Optional[str] = Form(None),
) -> dict:
    """Kick off an analysis job.

    Source selection (provide exactly one):
      - `url`        — yt-dlp downloads server-side.
      - `upload_key` — storage key from a prior `/uploads/sign` upload. Preferred.
      - `video`      — multipart file (legacy/dev fallback; don't use over tunnels).

    Requires a Supabase bearer token. `user_id` is stamped from the JWT.
    If `clip_id` is provided the job is linked back to that clip row so the
    worker can promote its status to `ready` on completion.
    """
    provided = [p for p in (url, upload_key, video) if p]
    if len(provided) == 0:
        raise HTTPException(400, "Provide one of `url`, `upload_key`, or `video`")
    if len(provided) > 1:
        raise HTTPException(400, "Provide only one of `url`, `upload_key`, or `video`")
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(500, "GEMINI_API_KEY not set")

    # Ownership check on the upload_key — cheap and blocks cross-user use of
    # a leaked signed URL before we spawn a worker.
    if upload_key and not upload_key.startswith(f"{_UPLOAD_PREFIX}/{user.id}/"):
        raise HTTPException(403, "upload_key is not owned by this user")

    source_type = "url" if url else "upload"

    row = {
        "status": "queued",
        "source_type": source_type,
        "source_url": url,
        "clip_context": clip_context,
        "game_hint": game_hint,
        "user_id": user.id,
        "clip_id": clip_id,
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
        upload_key=upload_key,
        clip_context=clip_context,
        game_hint=game_hint,
        clip_id=clip_id,
    )
    return {"job_id": job_id, "status": "queued", "clip_id": clip_id}


@app.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    resp = (
        get_supabase()
        .table("jobs")
        .select("*")
        .eq("id", job_id)
        .maybe_single()
        .execute()
    )
    data = resp.data
    if not data:
        raise HTTPException(404, "job not found")
    if data.get("user_id") and data["user_id"] != user.id:
        # Don't leak existence of other users' jobs.
        raise HTTPException(404, "job not found")
    return data


@app.get("/jobs")
def list_jobs(
    user: CurrentUser = Depends(get_current_user),
    limit: int = 20,
) -> list[dict]:
    resp = (
        get_supabase()
        .table("jobs")
        .select(
            "id,status,source_type,source_url,clip_id,created_at,updated_at,error"
        )
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data or []


def _authorize_job(job_id: str, user: CurrentUser, select: str) -> dict:
    """Fetch the job row with `select` columns, 404 if the caller doesn't own it."""
    resp = (
        get_supabase()
        .table("jobs")
        .select(select)
        .eq("id", job_id)
        .maybe_single()
        .execute()
    )
    data = resp.data
    if not data or data.get("user_id") != user.id:
        raise HTTPException(404, "job not found")
    return data


@app.get("/jobs/{job_id}/events")
def get_job_events(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
    since_id: Optional[int] = None,
    limit: int = 500,
) -> list[dict]:
    """Replay progress events for a job. Pass `since_id` to fetch only newer ones.

    The frontend should call this on mount (to rebuild the timeline after a
    refresh) and then subscribe to Supabase Realtime for live inserts.
    """
    _authorize_job(job_id, user, "user_id")
    q = (
        get_supabase()
        .table("job_events")
        .select("id,type,stage,progress_pct,message,data,created_at")
        .eq("job_id", job_id)
    )
    if since_id is not None:
        q = q.gt("id", since_id)
    resp = q.order("id").limit(max(1, min(2000, limit))).execute()
    return resp.data or []


def _sign(value, ttl: int) -> object:
    """Turn a storage key (str) or a {label: key} dict into signed URL(s)."""
    storage = get_storage()
    if isinstance(value, str):
        return storage.signed_url(value, ttl)
    if isinstance(value, dict):
        return {k: storage.signed_url(v, ttl) for k, v in value.items() if isinstance(v, str)}
    return value


@app.get("/jobs/{job_id}/artifacts")
def list_job_artifacts(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
    ttl_seconds: int = 3600,
) -> dict:
    """Return a name → signed-URL map for every artifact attached to the job."""
    data = _authorize_job(job_id, user, "user_id,artifacts")
    artifacts = data.get("artifacts") or {}
    ttl = max(60, min(86400, ttl_seconds))
    return {
        "ttl_seconds": ttl,
        "artifacts": {name: _sign(value, ttl) for name, value in artifacts.items()},
    }


@app.get("/jobs/{job_id}/artifacts/{name}")
def get_job_artifact(
    job_id: str,
    name: str,
    user: CurrentUser = Depends(get_current_user),
    ttl_seconds: int = 3600,
) -> dict:
    """Single-artifact signed URL. For `voices` this returns a map keyed by speaker."""
    data = _authorize_job(job_id, user, "user_id,artifacts")
    artifacts = data.get("artifacts") or {}
    value = artifacts.get(name)
    if value is None:
        raise HTTPException(404, f"artifact '{name}' not found")
    ttl = max(60, min(86400, ttl_seconds))
    return {"name": name, "ttl_seconds": ttl, "url": _sign(value, ttl), "key": value}


@app.get("/jobs/{job_id}/sfx")
def list_sfx_with_urls(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
    ttl_seconds: int = 3600,
) -> dict:
    """Return each SFX candidate merged with a signed URL for playback."""
    data = _authorize_job(job_id, user, "user_id,artifacts")
    artifacts = data.get("artifacts") or {}
    sfx = artifacts.get("sfx") or {}
    items = sfx.get("items") or []
    ttl = max(60, min(86400, ttl_seconds))
    storage = get_storage()
    out: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        url = storage.signed_url(key, ttl) if isinstance(key, str) else None
        out.append({**item, "url": url})
    return {"ttl_seconds": ttl, "items": out}


@app.post("/jobs/{job_id}/cancel")
def cancel_job(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Flip the job to status='cancelled'. The worker picks this up at the next
    checkpoint and bails out with a `job.cancelled` event."""
    _authorize_job(job_id, user, "user_id,status")
    get_supabase().table("jobs").update(
        {
            "status": "cancelled",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", job_id).execute()
    return {"status": "cancelled"}


class SelectSfxBody(BaseModel):
    keep_ids: list[int]


@app.post("/jobs/{job_id}/sfx/select")
def select_sfx(
    job_id: str,
    body: SelectSfxBody,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Keep only the listed SFX ids; delete every other SFX blob from storage
    and rewrite the manifest + artifact map to reflect the trimmed set."""
    data = _authorize_job(job_id, user, "user_id,artifacts,clip_id")
    artifacts = data.get("artifacts") or {}
    sfx = artifacts.get("sfx") or {}
    items = sfx.get("items") or []
    if not items:
        return {"kept": [], "deleted": []}

    keep = set(body.keep_ids)
    storage = get_storage()
    kept: list[dict] = []
    deleted: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if item.get("id") in keep:
            kept.append(item)
            continue
        key = item.get("key")
        if not isinstance(key, str):
            continue
        try:
            storage.delete(key)
            deleted.append(key)
        except Exception as e:
            logging.getLogger(__name__).warning("sfx delete failed (%s): %s", key, e)

    # Rewrite the manifest on storage so future artifact listings see only kept.
    manifest_key = sfx.get("manifest") or f"{job_id}/sfx/manifest.json"
    try:
        storage.put_bytes(
            json.dumps({"items": kept}, indent=2).encode("utf-8"),
            manifest_key,
            content_type="application/json",
        )
    except Exception as e:
        logging.getLogger(__name__).warning("sfx manifest rewrite failed: %s", e)

    # Sync artifact maps on both jobs and (if linked) clips.
    new_artifacts = dict(artifacts)
    new_artifacts["sfx"] = {"manifest": manifest_key, "items": kept}
    now = datetime.now(timezone.utc).isoformat()
    try:
        get_supabase().table("jobs").update(
            {"artifacts": new_artifacts, "updated_at": now}
        ).eq("id", job_id).execute()
    except Exception as e:
        logging.getLogger(__name__).warning("jobs.artifacts update failed: %s", e)
    clip_id = data.get("clip_id")
    if clip_id:
        try:
            get_supabase().table("clips").update(
                {"artifacts": new_artifacts, "updated_at": now}
            ).eq("id", clip_id).execute()
        except Exception as e:
            logging.getLogger(__name__).warning("clips.artifacts update failed: %s", e)

    return {"kept": kept, "deleted": deleted}
