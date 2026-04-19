"""Append-only progress events for the realtime frontend stream.

Each emit() inserts a row into public.job_events; Supabase Realtime broadcasts
the insert to any subscriber whose RLS allows it. Calls never raise — a job
must not fail because telemetry couldn't be persisted.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

from supabase_client import get_supabase

log = logging.getLogger(__name__)


def emit(
    job_id: str,
    type: str,
    *,
    stage: Optional[str] = None,
    pct: Optional[int] = None,
    message: Optional[str] = None,
    data: Optional[dict[str, Any]] = None,
) -> None:
    """Insert one event row. Fire-and-forget; logs and swallows errors.

    Retries once with a short backoff on transient connection errors so we
    don't lose load-bearing first-event signals (audio.start, video.start)
    when Supabase momentarily drops the keep-alive.
    """
    row: dict[str, Any] = {"job_id": job_id, "type": type}
    if stage is not None:
        row["stage"] = stage
    if pct is not None:
        row["progress_pct"] = max(0, min(100, int(pct)))
    if message is not None:
        row["message"] = message
    if data is not None:
        row["data"] = data

    last_err: Exception | None = None
    for attempt in range(2):
        try:
            get_supabase().table("job_events").insert(row).execute()
            if attempt > 0:
                log.info("job_events emit recovered on retry (%s)", type)
            return
        except Exception as e:  # noqa: BLE001 — telemetry must never crash the job
            last_err = e
            if attempt == 0:
                time.sleep(0.25)
                continue
    log.warning("job_events emit failed (%s): %s", type, last_err)
