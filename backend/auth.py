"""Supabase JWT verification for FastAPI.

Stateless: we pass the incoming bearer token through to
supabase.auth.get_user(token), which asks the Supabase Auth server
to validate it and return the user. Service-role client is used
because it has unrestricted access to the Auth API.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Header, HTTPException, status

from supabase_client import get_supabase


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
        resp = get_supabase().auth.get_user(token)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}"
        ) from e

    user = getattr(resp, "user", None)
    user_id = getattr(user, "id", None) if user else None
    if not user_id:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Token did not resolve to a user"
        )
    return CurrentUser(id=str(user_id), email=getattr(user, "email", None))


async def get_optional_user(
    authorization: Optional[str] = Header(default=None),
) -> Optional[CurrentUser]:
    """Like `get_current_user` but returns None instead of 401 when no token."""
    if not authorization:
        return None
    try:
        return await get_current_user(authorization=authorization)
    except HTTPException:
        return None
