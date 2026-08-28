"""Metadata-only YouTube Music search backed by yt-dlp."""

from __future__ import annotations

import json
import re
import subprocess
from urllib.parse import quote_plus


VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


class SearchUnavailableError(RuntimeError):
    """The metadata provider could not complete a search."""


def parse_search_payload(payload, *, limit):
    """Convert yt-dlp flat search output into the stable integration shape."""
    results = []
    entries = payload.get("entries") if isinstance(payload, dict) else []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        video_id = str(entry.get("id") or "")
        if not VIDEO_ID.fullmatch(video_id):
            continue
        thumbnails = entry.get("thumbnails") or []
        thumbnail = next(
            (
                str(candidate.get("url"))
                for candidate in reversed(thumbnails)
                if isinstance(candidate, dict) and candidate.get("url")
            ),
            str(entry.get("thumbnail") or ""),
        )
        if not thumbnail:
            thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
        duration = entry.get("duration")
        try:
            duration = int(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration = None
        results.append(
            {
                "kind": "video",
                "id": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "title": str(entry.get("title") or video_id),
                "channel": str(entry.get("channel") or entry.get("uploader") or ""),
                "duration": duration,
                "thumbnail": thumbnail,
            }
        )
        if len(results) >= limit:
            break
    return results


def search_youtube(query, *, limit=20, timeout=30):
    """Search song metadata without downloading or resolving media streams."""
    query = str(query or "").strip()
    if not 1 <= len(query) <= 120:
        raise ValueError("invalid_search_query")
    try:
        limit = int(limit)
    except (TypeError, ValueError) as error:
        raise ValueError("invalid_search_limit") from error
    if not 1 <= limit <= 30:
        raise ValueError("invalid_search_limit")

    search_url = f"https://music.youtube.com/search?q={quote_plus(query)}#songs"
    command = [
        "yt-dlp",
        "--flat-playlist",
        "--dump-single-json",
        "--skip-download",
        "--no-warnings",
        "--ignore-errors",
        "--playlist-end",
        str(limit),
        search_url,
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
        raise SearchUnavailableError("search_process_failed") from error
    if completed.returncode != 0:
        raise SearchUnavailableError("search_provider_failed")
    try:
        payload = json.loads(completed.stdout)
    except (json.JSONDecodeError, TypeError) as error:
        raise SearchUnavailableError("invalid_search_response") from error
    return parse_search_payload(payload, limit=limit)
