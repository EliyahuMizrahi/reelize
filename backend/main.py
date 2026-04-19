import asyncio
import json
import logging
import os
import shutil
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)

from auth import CurrentUser, get_current_user
from storage import get_storage
from supabase_client import get_supabase
from worker import process_job


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

async def _reconcile_orphaned_jobs() -> None:
    """Mark stuck `queued`/`running` jobs as failed at boot.

    We run a single bulk UPDATE instead of one-per-row; an orphaned job from
    before the container restart has no process to finish it. Limited to rows
    older than 1h so we don't stomp on in-flight jobs in multi-replica
    deployments (currently single replica, but be safe).
    """
    def _do_update() -> int:
        sb = get_supabase()
        now = datetime.now(timezone.utc).isoformat()
        cutoff = (
            datetime.now(timezone.utc).timestamp() - 3600
        )
        cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
        # supabase-py doesn't do bulk UPDATE ... WHERE expression directly; the
        # closest we get is a single .update().in_().lt() round-trip which the
        # PostgREST side flattens into one SQL statement.
        resp = (
            sb.table("jobs")
            .update({
                "status": "failed",
                "error": "RuntimeError: orphaned by container restart",
                "updated_at": now,
            })
            .in_("status", ["queued", "running"])
            .lt("created_at", cutoff_iso)
            .execute()
        )
        return len(resp.data or [])

    try:
        n = await asyncio.wait_for(asyncio.to_thread(_do_update), timeout=5.0)
        if n:
            log.warning("reconciled %d orphaned job(s) on startup", n)
    except asyncio.TimeoutError:
        log.warning("orphan reconciliation timed out after 5s; skipping")
    except Exception as e:  # noqa: BLE001
        log.warning("orphan reconciliation failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Skip orphan sweep in dev/reload to avoid wiping active jobs during
    # hot-reload loops.
    is_dev = (
        os.environ.get("ENV", "").lower() in {"dev", "development", "local"}
        or os.environ.get("UVICORN_RELOAD") == "1"
    )
    if is_dev:
        log.info("skipping orphan reconciliation (dev mode)")
    else:
        await _reconcile_orphaned_jobs()
    yield


app = FastAPI(title="Reelize Backend", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Middleware: CORS + TrustedHost
# ---------------------------------------------------------------------------

def _split_env_list(name: str) -> list[str]:
    raw = os.environ.get(name, "")
    return [x.strip() for x in raw.split(",") if x.strip()]


_ENV = os.environ.get("ENV", "").lower()
_IS_DEV = _ENV in {"dev", "development", "local"}

_cors_origins = _split_env_list("CORS_ALLOWED_ORIGINS")
if not _cors_origins:
    if _IS_DEV:
        _cors_origins = ["*"]
        log.warning("CORS_ALLOWED_ORIGINS unset; defaulting to '*' (dev mode)")
    else:
        _cors_origins = []
        log.warning(
            "CORS_ALLOWED_ORIGINS unset in non-dev env; no origins allowed"
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["authorization", "content-type", "accept", "x-requested-with"],
)

_allowed_hosts = _split_env_list("ALLOWED_HOSTS")
if not _allowed_hosts:
    _allowed_hosts = ["*"]
    log.warning(
        "ALLOWED_HOSTS unset; defaulting to ['*']. Set this in production."
    )
app.add_middleware(TrustedHostMiddleware, allowed_hosts=_allowed_hosts)


# ---------------------------------------------------------------------------
# Concurrency + rate limit state
# ---------------------------------------------------------------------------

_MAX_CONCURRENT_JOBS = max(1, int(os.environ.get("MAX_CONCURRENT_JOBS", "1")))
_PROCESS_JOB_SEM = asyncio.Semaphore(_MAX_CONCURRENT_JOBS)

# Simple per-user token bucket for /analyze.
_RATE_LIMIT_WINDOW = 60.0  # seconds
_RATE_LIMIT_MAX = int(os.environ.get("ANALYZE_RATE_LIMIT", "5"))
_rate_state: dict[str, deque[float]] = {}
_rate_lock = asyncio.Lock()


async def _rate_limit_check(user_id: str) -> None:
    """Raise 429 if `user_id` exceeds `_RATE_LIMIT_MAX` calls per window."""
    now = time.monotonic()
    cutoff = now - _RATE_LIMIT_WINDOW
    async with _rate_lock:
        dq = _rate_state.get(user_id)
        if dq is None:
            dq = deque()
            _rate_state[user_id] = dq
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= _RATE_LIMIT_MAX:
            retry_after = int(max(1, _RATE_LIMIT_WINDOW - (now - dq[0])))
            raise HTTPException(
                429,
                detail=f"Rate limit exceeded; retry in {retry_after}s",
                headers={"Retry-After": str(retry_after)},
            )
        dq.append(now)


async def _run_with_sem(job_id: str, **kwargs) -> None:
    """BackgroundTasks wrapper that serializes worker execution.

    `process_job` is an async coroutine; gate it behind a semaphore so we
    never run more than `_MAX_CONCURRENT_JOBS` analyses simultaneously
    (GPU VRAM + Gemini rate limits).
    """
    async with _PROCESS_JOB_SEM:
        await process_job(job_id=job_id, **kwargs)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"ok": True}


# ---------------------------------------------------------------------------
# Upload signing
# ---------------------------------------------------------------------------

class SignUploadBody(BaseModel):
    filename: str
    content_type: Optional[str] = "video/mp4"


_UPLOAD_PREFIX = "uploads"


@app.post("/uploads/sign")
def sign_upload(
    body: SignUploadBody,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Mint a one-shot direct-upload URL for the frontend."""
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


# ---------------------------------------------------------------------------
# /analyze
# ---------------------------------------------------------------------------

def _write_multipart(src_file, dest_path: str) -> None:
    """Copy an UploadFile stream to disk. Blocking — call via to_thread."""
    with open(dest_path, "wb") as f:
        shutil.copyfileobj(src_file, f)


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
    """Kick off an analysis job."""
    await _rate_limit_check(user.id)

    provided = [p for p in (url, upload_key, video) if p]
    if len(provided) == 0:
        raise HTTPException(400, "Provide one of `url`, `upload_key`, or `video`")
    if len(provided) > 1:
        raise HTTPException(400, "Provide only one of `url`, `upload_key`, or `video`")
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(500, "GEMINI_API_KEY not set")

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
        # shutil.copyfileobj blocks — push it off the event loop.
        await asyncio.to_thread(_write_multipart, video.file, upload_path)

    background.add_task(
        _run_with_sem,
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


# ---------------------------------------------------------------------------
# Job read endpoints
# ---------------------------------------------------------------------------

_SUMMARY_FIELDS = "id,status,progress_pct,stage,reason,updated_at"


@app.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
    fields: Optional[str] = None,
) -> dict:
    """Fetch a single job row.

    `fields=summary` returns only the lightweight status columns and omits
    the heavy `video_analysis` / `audio_manifest` / `artifacts` blobs —
    useful for polling without redownloading the full payload every tick.
    """
    select = _SUMMARY_FIELDS + ",user_id" if fields == "summary" else "*"
    resp = (
        get_supabase()
        .table("jobs")
        .select(select)
        .eq("id", job_id)
        .maybe_single()
        .execute()
    )
    data = resp.data
    if not data:
        raise HTTPException(404, "job not found")
    if data.get("user_id") and data["user_id"] != user.id:
        raise HTTPException(404, "job not found")
    if fields == "summary":
        data.pop("user_id", None)
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
) -> dict:
    """Replay progress events for a job. Pass `since_id` to fetch only newer ones.

    Returns `{events, has_more, max_id}` so the frontend can drive pagination
    off `max_id` without having to reason about the limit value itself.
    """
    _authorize_job(job_id, user, "user_id")
    capped_limit = max(1, min(2000, limit))
    q = (
        get_supabase()
        .table("job_events")
        .select("id,type,stage,progress_pct,message,data,created_at")
        .eq("job_id", job_id)
    )
    if since_id is not None:
        q = q.gt("id", since_id)
    resp = q.order("id").limit(capped_limit).execute()
    events = resp.data or []
    has_more = len(events) >= capped_limit
    max_id = events[-1]["id"] if events else since_id
    return {"events": events, "has_more": has_more, "max_id": max_id}


# ---------------------------------------------------------------------------
# Signed-URL helpers
# ---------------------------------------------------------------------------

def _is_safe_key(key: str, job_id: str, user_id: Optional[str]) -> bool:
    """Only sign storage keys scoped to this job or this user's upload area.

    Prevents a malformed artifact entry (or a hostile one written by a
    compromised worker) from tricking the API into signing arbitrary paths
    like another user's uploads or system keys.
    """
    if not isinstance(key, str) or not key:
        return False
    if key.startswith(f"{job_id}/"):
        return True
    if user_id and key.startswith(f"{_UPLOAD_PREFIX}/{user_id}/"):
        return True
    return False


def _sign_map(
    value,
    ttl: int,
    job_id: str,
    user_id: Optional[str],
) -> object:
    """Sign a key or a {label: key} dict, guarded by prefix check."""
    storage = get_storage()
    if isinstance(value, str):
        if not _is_safe_key(value, job_id, user_id):
            log.warning(
                "refusing to sign out-of-scope artifact key for job=%s: %s",
                job_id, value,
            )
            return None
        return storage.signed_url(value, ttl)
    if isinstance(value, dict):
        out: dict = {}
        for k, v in value.items():
            if not isinstance(v, str):
                continue
            if not _is_safe_key(v, job_id, user_id):
                log.warning(
                    "refusing to sign out-of-scope artifact key for job=%s: %s",
                    job_id, v,
                )
                continue
            out[k] = storage.signed_url(v, ttl)
        return out
    return value


def _collect_artifact_keys(artifacts: dict, job_id: str, user_id: Optional[str]) -> list[str]:
    keys: list[str] = []
    for value in artifacts.values():
        if isinstance(value, str) and _is_safe_key(value, job_id, user_id):
            keys.append(value)
        elif isinstance(value, dict):
            for v in value.values():
                if isinstance(v, str) and _is_safe_key(v, job_id, user_id):
                    keys.append(v)
    return keys


@app.get("/jobs/{job_id}/artifacts")
async def list_job_artifacts(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
    ttl_seconds: int = 3600,
) -> dict:
    """Return a name → signed-URL map for every artifact attached to the job."""
    data = _authorize_job(job_id, user, "user_id,artifacts")
    artifacts = data.get("artifacts") or {}
    ttl = max(60, min(86400, ttl_seconds))

    # Try batched signing; fall back to per-key if the SDK doesn't support it.
    storage = get_storage()
    all_keys = _collect_artifact_keys(artifacts, job_id, user.id)
    signed_by_key: dict[str, str] = {}
    if all_keys and hasattr(storage, "signed_urls_batch"):
        try:
            signed_by_key = await asyncio.to_thread(
                storage.signed_urls_batch, all_keys, ttl  # type: ignore[attr-defined]
            )
        except Exception as e:  # noqa: BLE001
            log.warning("batched signing failed, falling back: %s", e)
            signed_by_key = {}

    def _sign_one(key: str) -> Optional[str]:
        if key in signed_by_key:
            return signed_by_key[key]
        if not _is_safe_key(key, job_id, user.id):
            log.warning("skipping out-of-scope key %s", key)
            return None
        return storage.signed_url(key, ttl)

    out: dict = {}
    for name, value in artifacts.items():
        if isinstance(value, str):
            out[name] = _sign_one(value)
        elif isinstance(value, dict):
            out[name] = {
                k: _sign_one(v)
                for k, v in value.items()
                if isinstance(v, str)
            }
        else:
            out[name] = value
    return {"ttl_seconds": ttl, "artifacts": out}


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
    return {
        "name": name,
        "ttl_seconds": ttl,
        "url": _sign_map(value, ttl, job_id, user.id),
        "key": value,
    }


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
        url = (
            storage.signed_url(key, ttl)
            if isinstance(key, str) and _is_safe_key(key, job_id, user.id)
            else None
        )
        out.append({**item, "url": url})
    return {"ttl_seconds": ttl, "items": out}


# ---------------------------------------------------------------------------
# Job mutations
# ---------------------------------------------------------------------------

@app.post("/jobs/{job_id}/cancel")
def cancel_job(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
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


def _batch_delete(storage, keys: list[str]) -> tuple[list[str], list[tuple[str, str]]]:
    """Delete keys, preferring a batched API if the storage adapter exposes one."""
    if not keys:
        return [], []
    if hasattr(storage, "delete_many"):
        try:
            deleted = storage.delete_many(keys)  # type: ignore[attr-defined]
            return list(deleted), []
        except Exception as e:  # noqa: BLE001
            log.warning("batched delete failed, falling back: %s", e)
    deleted: list[str] = []
    failed: list[tuple[str, str]] = []
    for k in keys:
        try:
            storage.delete(k)
            deleted.append(k)
        except Exception as e:  # noqa: BLE001
            failed.append((k, str(e)))
    return deleted, failed


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
    to_delete: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if item.get("id") in keep:
            kept.append(item)
            continue
        key = item.get("key")
        if isinstance(key, str):
            to_delete.append(key)

    deleted, failed = _batch_delete(storage, to_delete)
    for key, err in failed:
        log.warning("sfx delete failed (%s): %s", key, err)

    manifest_key = sfx.get("manifest") or f"{job_id}/sfx/manifest.json"
    try:
        storage.put_bytes(
            json.dumps({"items": kept}, indent=2).encode("utf-8"),
            manifest_key,
            content_type="application/json",
        )
    except Exception as e:
        log.warning("sfx manifest rewrite failed: %s", e)

    new_artifacts = dict(artifacts)
    new_artifacts["sfx"] = {"manifest": manifest_key, "items": kept}
    now = datetime.now(timezone.utc).isoformat()
    try:
        get_supabase().table("jobs").update(
            {"artifacts": new_artifacts, "updated_at": now}
        ).eq("id", job_id).execute()
    except Exception as e:
        log.warning("jobs.artifacts update failed: %s", e)
    clip_id = data.get("clip_id")
    if clip_id:
        try:
            get_supabase().table("clips").update(
                {"artifacts": new_artifacts, "updated_at": now}
            ).eq("id", clip_id).execute()
        except Exception as e:
            log.warning("clips.artifacts update failed: %s", e)

    return {"kept": kept, "deleted": deleted}
