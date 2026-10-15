"""Serve the bundled Lovelace card through Home Assistant HTTP."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import CARD_URL
from .http import TriTueSearchView


async def async_register_frontend(hass: HomeAssistant) -> None:
    """Register the authenticated search view and static card module."""
    card_path = Path(__file__).with_name("www") / "tritue-youtube-player-card.js"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL, str(card_path), cache_headers=False)]
    )
    hass.http.register_view(TriTueSearchView)
