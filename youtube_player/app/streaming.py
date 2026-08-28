"""Short-lived, signed streaming support for public Zing song pages."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import subprocess
import time
from urllib.parse import urlsplit


ZING_ID = re.compile(r"^[A-Z0-9]{8,12}$")
CONTENT_TYPES = {
    "aac": "audio/aac",
    "flac": "audio/flac",
    "m4a": "audio/mp4",
    "mp3": "audio/mpeg",
    "ogg": "audio/ogg",
    "opus": "audio/ogg",
    "wav": "audio/wav",
    "webm": "audio/webm",
}
SAFE_UPSTREAM_HEADERS = {
    "accept",
    "accept-language",
    "origin",
    "referer",
    "user-agent",
}
ZING_CDN_HOSTS = ("zmdcdn.me", "zadn.vn", "zing.vn", "zingmp3.vn")


class InvalidStreamTokenError(ValueError):
    """The public stream token is invalid, tampered with, or expired."""


class StreamUnavailableError(RuntimeError):
    """The upstream public stream could not be resolved."""


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def validate_zing_target(target_url: str) -> str:
    """Return a normalized public Zing song URL or raise ``ValueError``."""
    target_url = str(target_url or "").strip()
    parsed = urlsplit(target_url)
    host = (parsed.hostname or "").lower()
    song_id = parsed.path.rsplit("/", 1)[-1].removesuffix(".html")
    if (
        parsed.scheme != "https"
        or not (host == "zingmp3.vn" or host.endswith(".zingmp3.vn"))
        or parsed.username is not None
        or parsed.password is not None
        or not parsed.path.startswith("/bai-hat/")
        or not ZING_ID.fullmatch(song_id)
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("invalid_zing_target")
    return target_url


def normalize_public_base_url(base_url: str) -> str:
    """Validate the LAN URL speakers use to reach this add-on."""
    base_url = str(base_url or "").strip()
    parsed = urlsplit(base_url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("invalid_public_base_url")
    return base_url.rstrip("/")


def create_stream_token(
    target_url: str,
    secret: str,
    *,
    now: int | None = None,
    ttl: int = 300,
) -> str:
    """Create a signed, URL-safe token for one public Zing song."""
    target_url = validate_zing_target(target_url)
    secret = str(secret or "")
    if not secret:
        raise ValueError("invalid_stream_secret")
    if not 30 <= int(ttl) <= 7200:
        raise ValueError("invalid_stream_ttl")
    issued_at = int(time.time() if now is None else now)
    payload = _b64encode(
        json.dumps(
            {"exp": issued_at + int(ttl), "source": "zing", "url": target_url},
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
    )
    signature = _b64encode(
        hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    )
    return f"{payload}.{signature}"


def verify_stream_token(
    token: str, secret: str, *, now: int | None = None
) -> str:
    """Verify a stream token and return its restricted Zing target URL."""
    try:
        payload, provided_signature = str(token).split(".", 1)
        expected_signature = _b64encode(
            hmac.new(str(secret).encode(), payload.encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(provided_signature, expected_signature):
            raise InvalidStreamTokenError("invalid_stream_token")
        value = json.loads(_b64decode(payload))
        current_time = int(time.time() if now is None else now)
        if value.get("source") != "zing" or int(value.get("exp", 0)) < current_time:
            raise InvalidStreamTokenError("expired_stream_token")
        return validate_zing_target(value.get("url"))
    except InvalidStreamTokenError:
        raise
    except (TypeError, ValueError, KeyError, json.JSONDecodeError) as error:
        raise InvalidStreamTokenError("invalid_stream_token") from error


def build_signed_stream_url(
    public_base_url: str,
    target_url: str,
    secret: str,
    *,
    now: int | None = None,
    ttl: int = 300,
) -> str:
    """Build the short-lived URL passed to a Home Assistant media player."""
    base_url = normalize_public_base_url(public_base_url)
    token = create_stream_token(target_url, secret, now=now, ttl=ttl)
    return f"{base_url}/api/stream/{token}"


def resolve_zing_stream(target_url: str, *, timeout: int = 30) -> dict:
    """Resolve one public Zing song to its upstream audio URL without download."""
    target_url = validate_zing_target(target_url)
    command = [
        "yt-dlp",
        "--dump-single-json",
        "--skip-download",
        "--no-warnings",
        "--no-playlist",
        "--format",
        "bestaudio/best",
        target_url,
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise StreamUnavailableError("stream_resolver_failed") from error
    if completed.returncode != 0:
        raise StreamUnavailableError("stream_provider_failed")
    try:
        payload = json.loads(completed.stdout)
    except (json.JSONDecodeError, TypeError) as error:
        raise StreamUnavailableError("invalid_stream_response") from error

    stream_url = str(payload.get("url") or "")
    parsed_stream = urlsplit(stream_url)
    stream_host = (parsed_stream.hostname or "").lower()
    if (
        parsed_stream.scheme not in {"http", "https"}
        or not any(
            stream_host == suffix or stream_host.endswith(f".{suffix}")
            for suffix in ZING_CDN_HOSTS
        )
        or str(payload.get("vcodec") or "none") != "none"
    ):
        raise StreamUnavailableError("unsupported_stream_format")
    headers = {
        str(key): str(value)
        for key, value in (payload.get("http_headers") or {}).items()
        if str(key).lower() in SAFE_UPSTREAM_HEADERS
        and "\r" not in str(value)
        and "\n" not in str(value)
    }
    extension = str(payload.get("ext") or "").lower()
    return {
        "url": stream_url,
        "headers": headers,
        "content_type": CONTENT_TYPES.get(extension, "application/octet-stream"),
    }
