import os
from functools import lru_cache

from supabase import Client, create_client


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Service-role client. Full DB access; use only server-side."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


@lru_cache(maxsize=1)
def get_supabase_anon() -> Client:
    """Anon client. Used for verifying user-supplied JWTs via auth.get_user().

    Using service-role for token verification works but is overkill and
    leaks service-role client state into the auth code path. The anon key
    is sufficient for the auth endpoint.
    """
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_ANON_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def bucket_name() -> str:
    return os.environ.get("SUPABASE_BUCKET", "reelize-artifacts")
