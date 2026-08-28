"""Build playback requests for physical Home Assistant media players."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlsplit


MEDIA_PLAYER_ENTITY_ID = re.compile(r"^media_player\.[a-z0-9_]+$")


class UnsupportedCastMediaError(ValueError):
    """The normalized item cannot be started by the YouTube Cast app."""


def normalize_target_entity_ids(
    value: Any, *, excluded: set[str] | None = None
) -> list[str]:
    """Validate, deduplicate and bound physical media player targets."""
    candidates = [value] if isinstance(value, str) else list(value or [])
    normalized = []
    for candidate in candidates:
        entity_id = str(candidate or "").strip()
        if (
            not MEDIA_PLAYER_ENTITY_ID.fullmatch(entity_id)
            or entity_id in (excluded or set())
        ):
            raise ValueError("invalid_target_entity")
        if entity_id not in normalized:
            normalized.append(entity_id)
    if not 1 <= len(normalized) <= 16:
        raise ValueError("invalid_target_entities")
    return normalized


def build_stream_request(payload: dict[str, Any]) -> dict[str, str]:
    """Build generic Home Assistant audio media from an add-on stream response."""
    stream_url = str(payload.get("stream_url") or "")
    parsed = urlsplit(stream_url)
    content_type = str(payload.get("media_content_type") or "audio/mpeg")
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or not content_type.startswith("audio/")
    ):
        raise ValueError("invalid_stream_response")
    return {
        "media_content_id": stream_url,
        "media_content_type": content_type,
    }


def _media_type_value(value: Any, fallback: str) -> str:
    """Return a Home Assistant media type as a plain string."""
    normalized = getattr(value, "value", value)
    return str(normalized or fallback)


def canonical_youtube_url(item: dict[str, Any]) -> str:
    """Build a canonical public YouTube URL from a normalized server item."""
    identifier = str(item.get("id") or "")
    if item.get("kind") == "video":
        url = f"https://www.youtube.com/watch?v={identifier}"
        if playlist_id := str(item.get("playlist_id") or ""):
            url = f"{url}&list={playlist_id}"
        return url
    return f"https://www.youtube.com/playlist?list={identifier}"


def build_target_request(
    item: dict[str, Any],
    *,
    target_platform: str | None,
    requested_media_type: Any,
) -> dict[str, str]:
    """Build ``media_player.play_media`` data for the selected output entity."""
    if target_platform == "cast":
        if item.get("kind") != "video" or not item.get("id"):
            raise UnsupportedCastMediaError("cast_playlist_requires_video")
        payload = {
            "app_name": "youtube",
            "media_id": str(item["id"]),
        }
        if playlist_id := str(item.get("playlist_id") or ""):
            payload["playlist_id"] = playlist_id
        return {
            "media_content_type": "cast",
            "media_content_id": json.dumps(payload, separators=(",", ":")),
        }

    fallback_type = "playlist" if item.get("kind") == "playlist" else "video"
    return {
        "media_content_type": _media_type_value(
            requested_media_type, fallback=fallback_type
        ),
        "media_content_id": canonical_youtube_url(item),
    }
