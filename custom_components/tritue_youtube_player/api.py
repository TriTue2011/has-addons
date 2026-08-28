"""Async client for the TriTue YouTube Player integration API."""

from __future__ import annotations

import asyncio
from typing import Any

import aiohttp


class YouTubePlayerApiError(Exception):
    """Base error returned by the player API."""


class AuthenticationError(YouTubePlayerApiError):
    """The configured bearer token was rejected."""


class CannotConnectError(YouTubePlayerApiError):
    """The player server could not be reached."""


class InvalidTargetError(YouTubePlayerApiError):
    """The requested YouTube target is not supported."""


class YouTubePlayerClient:
    """Small client around the stable integration API contract."""

    def __init__(
        self, base_url: str, token: str, session: aiohttp.ClientSession
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token = token
        self._session = session

    async def async_health(self) -> dict[str, Any]:
        """Validate authentication and return server capabilities."""
        return await self._async_request("GET", "/api/integration/health")

    async def async_status(self) -> dict[str, Any]:
        """Return current playback and history state."""
        return await self._async_request("GET", "/api/integration/status")

    async def async_history(self) -> dict[str, Any]:
        """Return the bounded server-side playback history."""
        return await self._async_request("GET", "/api/integration/history")

    async def async_search(self, query: str, *, limit: int = 20) -> dict[str, Any]:
        """Search YouTube Music metadata without a YouTube API key."""
        return await self._async_request(
            "GET",
            "/api/integration/search",
            params={"q": query, "limit": limit},
            request_timeout=35,
        )

    async def async_play(self, target: str) -> dict[str, Any]:
        """Send a YouTube URL or identifier to the web player."""
        return await self._async_request(
            "POST", "/api/integration/play", json={"target": target}
        )

    async def async_stop(self) -> dict[str, Any]:
        """Stop the active web player."""
        return await self._async_request("POST", "/api/integration/stop")

    async def _async_request(
        self, method: str, path: str, **kwargs: Any
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._token}"}
        request_timeout = kwargs.pop("request_timeout", 10)
        try:
            async with self._session.request(
                method,
                f"{self.base_url}{path}",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=request_timeout),
                **kwargs,
            ) as response:
                try:
                    payload = await response.json(content_type=None)
                except (aiohttp.ContentTypeError, ValueError) as error:
                    raise YouTubePlayerApiError("invalid_response") from error

                error_code = (
                    payload.get("error", "request_failed")
                    if isinstance(payload, dict)
                    else "invalid_response"
                )
                if response.status == 401:
                    raise AuthenticationError(error_code)
                if response.status == 400 and error_code == "invalid_youtube_target":
                    raise InvalidTargetError(error_code)
                if response.status >= 400:
                    raise YouTubePlayerApiError(error_code)
                if not isinstance(payload, dict):
                    raise YouTubePlayerApiError("invalid_response")
                return payload
        except (aiohttp.ClientError, asyncio.TimeoutError) as error:
            raise CannotConnectError("cannot_connect") from error
