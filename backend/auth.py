"""Supabase JWT verification for FastAPI.

Stateless: we pass the incoming bearer token through to
supabase.auth.get_user(token), which asks the Supabase Auth server
to validate it and return the user. Anon client is sufficient for
this — service-role is reserved for subsequent DB writes.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from fastapi import Header, HTTPException, status

from supabase_client import get_supabase_anon

log = logging.getLogger(__name__)

# gotrue raises AuthApiError on actual auth failures (bad/expired token).
# Anything else (httpx timeouts, DNS, etc.) means the Auth service is
# unreachable — surface as 503, not 401.
try:
    from gotrue.errors import AuthApiError  # type: ignore
except Exception:  # noqa: BLE001
    try:
        from supabase.lib.auth_client import AuthApiError  # type: ignore
    except Exception:  # noqa: BLE001
        class AuthApiError(Exception):  # type: ignore
            """Fallback when gotrue isn't importable at this path."""


@dataclass
class CurrentUser:
    id: str
    email: Optional[str]


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> CurrentUser:
    """FastAPI dependency: resolve Authorization: Bearer <jwt> into a Supabase user."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Empty bearer token")

    try:
        resp = get_supabase_anon().auth.get_user(token)
    except AuthApiError:
        # Real auth failure: invalid signature, expired, revoked. Log full
        # detail server-side but don't leak it to the caller.
        log.info("auth: token rejected by Supabase", exc_info=True)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or expired token"
        )
    except Exception:  # noqa: BLE001 — transport/unknown
        log.exception("auth: Supabase Auth call failed")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Auth service unavailable"
        )

    user = getattr(resp, "user", None)
    user_id = getattr(user, "id", None) if user else None
    if not user_id:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or expired token"
        )
    return CurrentUser(id=str(user_id), email=getattr(user, "email", None))
