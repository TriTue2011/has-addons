"""Metadata-only search providers used by the player service."""

from __future__ import annotations

import gzip
import json
import re
import subprocess
from urllib.parse import quote_plus, urlsplit
from urllib.request import Request, urlopen


VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
ZING_ID = re.compile(r"^[A-Z0-9]{8,12}$")
ZING_SEARCH_URL = "https://ac.zingmp3.vn/v1/web/ac-suggestions"


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
                "source": "youtube",
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


def _validated_query_and_limit(query, limit):
    query = str(query or "").strip()
    if not 1 <= len(query) <= 120:
        raise ValueError("invalid_search_query")
    try:
        limit = int(limit)
    except (TypeError, ValueError) as error:
        raise ValueError("invalid_search_limit") from error
    if not 1 <= limit <= 30:
        raise ValueError("invalid_search_limit")
    return query, limit


def _zing_suggestions(payload):
    """Yield suggestion entries from Zing's nested autocomplete response."""
    data = payload.get("data") if isinstance(payload, dict) else None
    groups = data.get("items") if isinstance(data, dict) else []
    for group in groups or []:
        if not isinstance(group, dict):
            continue
        suggestions = group.get("suggestions")
        if isinstance(suggestions, list):
            yield from suggestions


def parse_zing_payload(payload, *, limit):
    """Convert public Zing song suggestions into the stable search shape."""
    results = []
    for entry in _zing_suggestions(payload):
        if not isinstance(entry, dict) or entry.get("type") != 1:
            continue
        song_id = str(entry.get("id") or "")
        song_url = str(entry.get("link") or "")
        parsed_url = urlsplit(song_url)
        song_host = (parsed_url.hostname or "").lower()
        if (
            not ZING_ID.fullmatch(song_id)
            or parsed_url.scheme != "https"
            or not (
                song_host == "zingmp3.vn"
                or song_host.endswith(".zingmp3.vn")
            )
            or not parsed_url.path.startswith("/bai-hat/")
            or entry.get("status") != 1
            or entry.get("privacy") != 1
            or entry.get("playStatus") != 2
        ):
            continue
        artists = entry.get("artists") or []
        artist_names = [
            str(artist.get("name"))
            for artist in artists
            if isinstance(artist, dict) and artist.get("name")
        ]
        duration = entry.get("duration")
        try:
            duration = int(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration = None
        results.append(
            {
                "source": "zing",
                "kind": "song",
                "id": song_id,
                "url": song_url,
                "title": str(entry.get("title") or song_id),
                "channel": ", ".join(artist_names),
                "duration": duration,
                "thumbnail": str(entry.get("thumb") or ""),
            }
        )
        if len(results) >= limit:
            break
    return results


def search_youtube(query, *, limit=20, timeout=30):
    """Search song metadata without downloading or resolving media streams."""
    query, limit = _validated_query_and_limit(query, limit)

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


def search_zing(query, *, limit=20, timeout=10):
    """Search public Zing song metadata through its autocomplete endpoint."""
    query, limit = _validated_query_and_limit(query, limit)
    request = Request(
        f"{ZING_SEARCH_URL}?query={quote_plus(query)}&num={limit}",
        headers={
            "Accept": "application/json",
            "User-Agent": "TriTue-YouTube-Player/0.4",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read()
            if response.headers.get("Content-Encoding", "").lower() == "gzip":
                body = gzip.decompress(body)
        payload = json.loads(body)
    except (OSError, ValueError, gzip.BadGzipFile) as error:
        raise SearchUnavailableError("search_provider_failed") from error
    if not isinstance(payload, dict) or payload.get("err") != 0:
        raise SearchUnavailableError("invalid_search_response")
    return parse_zing_payload(payload, limit=limit)
