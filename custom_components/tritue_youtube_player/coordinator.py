"""Data coordinator for TriTue YouTube Player."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import (
    AuthenticationError,
    CannotConnectError,
    YouTubePlayerApiError,
    YouTubePlayerClient,
)
from .const import DEFAULT_UPDATE_INTERVAL, DOMAIN, LOGGER


class YouTubePlayerCoordinator(DataUpdateCoordinator[dict]):
    """Poll the local player server for current state."""

    def __init__(
        self,
        hass: HomeAssistant,
        config_entry: ConfigEntry,
        client: YouTubePlayerClient,
    ) -> None:
        super().__init__(
            hass,
            logger=LOGGER,
            config_entry=config_entry,
            name=DOMAIN,
            update_interval=DEFAULT_UPDATE_INTERVAL,
        )
        self.client = client

    async def _async_update_data(self) -> dict:
        try:
            return await self.client.async_status()
        except AuthenticationError as error:
            raise ConfigEntryAuthFailed from error
        except (CannotConnectError, YouTubePlayerApiError) as error:
            raise UpdateFailed(f"Player API update failed: {error}") from error


YouTubePlayerConfigEntry = ConfigEntry[YouTubePlayerCoordinator]
