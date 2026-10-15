"""Authenticated Home Assistant HTTP API for the Lovelace card."""

from __future__ import annotations

from http import HTTPStatus

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntryState

from .api import YouTubePlayerApiError
from .const import DOMAIN


class TriTueSearchView(HomeAssistantView):
    """Proxy card searches through the configured local add-on client."""

    url = "/api/tritue_youtube_player/search"
    name = "api:tritue_youtube_player:search"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        """Return normalized results without exposing the add-on bearer token."""
        hass = request.app["hass"]
        entry_id = str(request.query.get("entry_id") or "")
        source = str(request.query.get("source") or "youtube").lower()
        query = str(request.query.get("q") or "").strip()
        try:
            limit = int(request.query.get("limit", "20"))
        except ValueError:
            limit = 0
        entry = hass.config_entries.async_get_entry(entry_id)
        if (
            entry is None
            or entry.domain != DOMAIN
            or entry.state is not ConfigEntryState.LOADED
        ):
            return self.json(
                {"error": "entry_unavailable"}, HTTPStatus.NOT_FOUND
            )
        if source not in {"youtube", "zing"}:
            return self.json(
                {"error": "invalid_search_source"}, HTTPStatus.BAD_REQUEST
            )
        if not 1 <= len(query) <= 120 or not 1 <= limit <= 30:
            return self.json(
                {"error": "invalid_search_query"}, HTTPStatus.BAD_REQUEST
            )
        try:
            payload = await entry.runtime_data.client.async_search(
                query, source=source, limit=limit
            )
        except YouTubePlayerApiError:
            return self.json(
                {"error": "search_unavailable"}, HTTPStatus.BAD_GATEWAY
            )
        return self.json(payload)
