"""Append-only progress events for the realtime frontend stream.

Each emit() inserts a row into public.job_events; Supabase Realtime broadcasts
the insert to any subscriber whose RLS allows it. Calls never raise — a job
must not fail because telemetry couldn't be persisted.
"""
from __future__ import annotations

import logging
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
    """Insert one event row. Fire-and-forget; logs and swallows errors."""
    row: dict[str, Any] = {"job_id": job_id, "type": type}
    if stage is not None:
        row["stage"] = stage
    if pct is not None:
        row["progress_pct"] = max(0, min(100, int(pct)))
    if message is not None:
        row["message"] = message
    if data is not None:
        row["data"] = data
    try:
        get_supabase().table("job_events").insert(row).execute()
    except Exception as e:  # noqa: BLE001 — telemetry must never crash the job
        log.warning("job_events emit failed (%s): %s", type, e)
