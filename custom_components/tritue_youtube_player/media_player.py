"""Media player entity for TriTue YouTube Player."""

from __future__ import annotations

from typing import Any

from homeassistant.components.media_player import (
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
    MediaType,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import InvalidTargetError, YouTubePlayerApiError
from .const import DOMAIN
from .coordinator import YouTubePlayerConfigEntry
from .entity import YouTubePlayerEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YouTubePlayerConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the media player entity."""
    async_add_entities([TriTueYouTubePlayer(entry)])


class TriTueYouTubePlayer(YouTubePlayerEntity, MediaPlayerEntity):
    """Control the player page through Home Assistant."""

    _attr_supported_features = (
        MediaPlayerEntityFeature.PLAY_MEDIA | MediaPlayerEntityFeature.STOP
    )
    _attr_translation_key = "player"

    def __init__(self, entry: YouTubePlayerConfigEntry) -> None:
        super().__init__(entry.runtime_data, entry)
        self._attr_unique_id = f"{entry.entry_id}_player"

    @property
    def state(self) -> MediaPlayerState:
        """Return current server-side player state."""
        if self.coordinator.data.get("state") == "playing":
            return MediaPlayerState.PLAYING
        return MediaPlayerState.IDLE

    @property
    def media_content_id(self) -> str | None:
        """Return the current YouTube identifier."""
        item = self.coordinator.data.get("item") or {}
        return item.get("id")

    @property
    def media_content_type(self) -> str | None:
        """Return whether the current item is a video or playlist."""
        item = self.coordinator.data.get("item") or {}
        return item.get("kind")

    @property
    def media_title(self) -> str | None:
        """Use the normalized identifier as the current media title."""
        return self.media_content_id

    @property
    def media_image_url(self) -> str | None:
        """Return a YouTube thumbnail for video items."""
        item = self.coordinator.data.get("item") or {}
        if item.get("kind") != "video" or not item.get("id"):
            return None
        return f"https://i.ytimg.com/vi/{item['id']}/hqdefault.jpg"

    async def async_play_media(
        self, media_type: MediaType | str, media_id: str, **kwargs: Any
    ) -> None:
        """Send a video, Shorts or playlist URL/ID to the player page."""
        try:
            await self.coordinator.client.async_play(media_id)
        except InvalidTargetError as error:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="invalid_target"
            ) from error
        except YouTubePlayerApiError as error:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="communication_error"
            ) from error
        await self.coordinator.async_request_refresh()

    async def async_media_stop(self) -> None:
        """Stop the player page."""
        try:
            await self.coordinator.client.async_stop()
        except YouTubePlayerApiError as error:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="communication_error"
            ) from error
        await self.coordinator.async_request_refresh()
