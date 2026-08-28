"""Build playback requests for physical Home Assistant media players."""

from __future__ import annotations

import json
from typing import Any


class UnsupportedCastMediaError(ValueError):
    """The normalized item cannot be started by the YouTube Cast app."""


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
