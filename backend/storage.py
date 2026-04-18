"""Pluggable object-storage backend.

Default: Supabase Storage. Switch to Cloudflare R2 (or any S3-compatible
backend) by setting STORAGE_BACKEND=r2 and the R2_* env vars below.

Call sites should depend on the Storage protocol, not the concrete class.
"""
from __future__ import annotations

import logging
import mimetypes
import os
from functools import lru_cache
from pathlib import Path
from typing import Protocol

log = logging.getLogger(__name__)


class Storage(Protocol):
    """Minimal interface every backend implements. Keep it boring."""
    def put_file(self, local: Path, key: str) -> str: ...
    def put_bytes(self, data: bytes, key: str, content_type: str | None = None) -> str: ...
    def signed_url(self, key: str, ttl_seconds: int = 3600) -> str: ...
    def delete(self, key: str) -> None: ...


def _guess_mime(name: str) -> str:
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


class SupabaseStorage:
    def __init__(self, bucket: str) -> None:
        from supabase_client import get_supabase
        self._client = get_supabase()
        self._bucket = bucket

    def put_file(self, local: Path, key: str) -> str:
        with open(local, "rb") as f:
            data = f.read()
        return self.put_bytes(data, key, _guess_mime(str(local)))

    def put_bytes(self, data: bytes, key: str, content_type: str | None = None) -> str:
        self._client.storage.from_(self._bucket).upload(
            path=key,
            file=data,
            file_options={
                "content-type": content_type or _guess_mime(key),
                "upsert": "true",
            },
        )
        return key

    def signed_url(self, key: str, ttl_seconds: int = 3600) -> str:
        resp = self._client.storage.from_(self._bucket).create_signed_url(key, ttl_seconds)
        return (
            resp.get("signedURL")
            or resp.get("signedUrl")
            or resp.get("signed_url")
            or ""
        )

    def delete(self, key: str) -> None:
        self._client.storage.from_(self._bucket).remove([key])


class R2Storage:
    """Cloudflare R2 via boto3 (S3 API). boto3 is only imported when selected."""

    def __init__(self, bucket: str) -> None:
        import boto3  # noqa: PLC0415 — lazy so supabase-only installs don't need boto3
        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=os.environ["R2_ENDPOINT_URL"],
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )

    def put_file(self, local: Path, key: str) -> str:
        self._client.upload_file(
            str(local),
            self._bucket,
            key,
            ExtraArgs={"ContentType": _guess_mime(str(local))},
        )
        return key

    def put_bytes(self, data: bytes, key: str, content_type: str | None = None) -> str:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type or _guess_mime(key),
        )
        return key

    def signed_url(self, key: str, ttl_seconds: int = 3600) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=ttl_seconds,
        )

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)


def _bucket() -> str:
    return (
        os.environ.get("STORAGE_BUCKET")
        or os.environ.get("SUPABASE_BUCKET")
        or "reelize-artifacts"
    )


@lru_cache(maxsize=1)
def get_storage() -> Storage:
    backend = os.environ.get("STORAGE_BACKEND", "supabase").lower()
    if backend == "r2":
        return R2Storage(_bucket())
    return SupabaseStorage(_bucket())
