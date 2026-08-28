"""Media player entity for TriTue YouTube Player."""

from __future__ import annotations

from contextlib import suppress
from typing import Any

from homeassistant.components.media_player import (
    ATTR_MEDIA_CONTENT_ID,
    ATTR_MEDIA_CONTENT_TYPE,
    BrowseMedia,
    DOMAIN as MEDIA_PLAYER_DOMAIN,
    SERVICE_PLAY_MEDIA,
    MediaClass,
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
    MediaType,
    SearchMedia,
    SearchMediaQuery,
)
from homeassistant.const import ATTR_ENTITY_ID, SERVICE_MEDIA_STOP
from homeassistant.core import HomeAssistant, State
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import InvalidTargetError, YouTubePlayerApiError
from .const import CONF_TARGET_ENTITY_ID, DOMAIN
from .coordinator import YouTubePlayerConfigEntry
from .entity import YouTubePlayerEntity
from .playback import (
    UnsupportedCastMediaError,
    build_target_request,
    canonical_youtube_url,
)


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
        MediaPlayerEntityFeature.PLAY_MEDIA
        | MediaPlayerEntityFeature.STOP
        | MediaPlayerEntityFeature.BROWSE_MEDIA
        | MediaPlayerEntityFeature.SEARCH_MEDIA
    )
    _attr_translation_key = "player"

    def __init__(self, entry: YouTubePlayerConfigEntry) -> None:
        super().__init__(entry.runtime_data, entry)
        self._attr_unique_id = f"{entry.entry_id}_player"

    @property
    def target_entity_id(self) -> str:
        """Return the configured physical playback target."""
        return str(self.entry.options.get(CONF_TARGET_ENTITY_ID) or "")

    @property
    def target_state(self) -> State | None:
        """Return the current target entity state, if configured and loaded."""
        if not self.target_entity_id:
            return None
        return self.hass.states.get(self.target_entity_id)

    @property
    def assumed_state(self) -> bool:
        """Only assume state when playback is limited to the web player."""
        return not bool(self.target_entity_id)

    @property
    def state(self) -> MediaPlayerState:
        """Mirror the physical target, or return the server-side player state."""
        if target_state := self.target_state:
            try:
                return MediaPlayerState(target_state.state)
            except ValueError:
                pass
        if self.coordinator.data.get("state") == "playing":
            return MediaPlayerState.PLAYING
        return MediaPlayerState.IDLE

    @property
    def extra_state_attributes(self) -> dict[str, str | None]:
        """Expose the selected output and dispatch mode."""
        return {
            "target_entity_id": self.target_entity_id or None,
            "target_platform": self._target_platform(),
        }

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

    async def async_browse_media(
        self,
        media_content_type: MediaType | str | None = None,
        media_content_id: str | None = None,
    ) -> BrowseMedia:
        """Show recent items and expose native Home Assistant search."""
        try:
            payload = await self.coordinator.client.async_history()
        except YouTubePlayerApiError as error:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="communication_error"
            ) from error
        children = [
            self._browse_item(item)
            for item in payload.get("items") or []
            if isinstance(item, dict) and item.get("id")
        ]
        return BrowseMedia(
            title="TriTue YouTube Player",
            media_class=MediaClass.DIRECTORY,
            media_content_type=MediaType.MUSIC,
            media_content_id="history",
            can_play=False,
            can_expand=True,
            children=children,
            children_media_class=MediaClass.TRACK,
            can_search=True,
            search_media_classes=[MediaClass.TRACK, MediaClass.VIDEO],
        )

    async def async_search_media(self, query: SearchMediaQuery) -> SearchMedia:
        """Search songs through the add-on's metadata-only search endpoint."""
        search_query = query.search_query.strip()
        if not search_query:
            return SearchMedia(result=[])
        try:
            payload = await self.coordinator.client.async_search(search_query)
        except YouTubePlayerApiError as error:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="search_error"
            ) from error
        return SearchMedia(
            result=[
                self._browse_item(item, media_type=MediaType.MUSIC)
                for item in payload.get("items") or []
                if isinstance(item, dict) and item.get("id")
            ]
        )

    async def async_play_media(
        self, media_type: MediaType | str, media_id: str, **kwargs: Any
    ) -> None:
        """Send YouTube media to the web player and selected HA media player."""
        if self.target_entity_id:
            self._target_or_raise()
        try:
            played = await self.coordinator.client.async_play(media_id)
        except InvalidTargetError as error:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="invalid_target"
            ) from error
        except YouTubePlayerApiError as error:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="communication_error"
            ) from error

        if self.target_entity_id:
            try:
                await self._async_play_on_target(played.get("item") or {}, media_type)
            except HomeAssistantError:
                with suppress(YouTubePlayerApiError):
                    await self.coordinator.client.async_stop()
                await self.coordinator.async_request_refresh()
                raise
        await self.coordinator.async_request_refresh()

    async def async_media_stop(self) -> None:
        """Stop the player page and selected HA media player."""
        try:
            await self.coordinator.client.async_stop()
        except YouTubePlayerApiError as error:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="communication_error"
            ) from error
        if self.target_entity_id:
            target = self._target_or_raise()
            await self.hass.services.async_call(
                MEDIA_PLAYER_DOMAIN,
                SERVICE_MEDIA_STOP,
                blocking=True,
                target={ATTR_ENTITY_ID: target},
            )
        await self.coordinator.async_request_refresh()

    def _target_or_raise(self) -> str:
        """Return a loaded physical target which is not this virtual player."""
        target = self.target_entity_id
        if not target or self.hass.states.get(target) is None:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="target_unavailable"
            )
        if target == self.entity_id:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="invalid_target_entity"
            )
        return target

    def _target_platform(self) -> str | None:
        """Return the integration platform which owns the selected entity."""
        if not self.target_entity_id:
            return None
        registry_entry = er.async_get(self.hass).async_get(self.target_entity_id)
        return registry_entry.platform if registry_entry else None

    async def _async_play_on_target(
        self, item: dict[str, Any], media_type: MediaType | str
    ) -> None:
        """Dispatch normalized media to the configured physical entity."""
        target = self._target_or_raise()
        try:
            service_data = build_target_request(
                item,
                target_platform=self._target_platform(),
                requested_media_type=media_type,
            )
        except UnsupportedCastMediaError as error:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="cast_playlist_requires_video",
            ) from error

        await self.hass.services.async_call(
            MEDIA_PLAYER_DOMAIN,
            SERVICE_PLAY_MEDIA,
            {
                ATTR_MEDIA_CONTENT_ID: service_data[ATTR_MEDIA_CONTENT_ID],
                ATTR_MEDIA_CONTENT_TYPE: service_data[ATTR_MEDIA_CONTENT_TYPE],
            },
            blocking=True,
            target={ATTR_ENTITY_ID: target},
        )

    @staticmethod
    def _browse_item(
        item: dict[str, Any], *, media_type: MediaType = MediaType.VIDEO
    ) -> BrowseMedia:
        """Convert stable API metadata into a playable HA browser item."""
        title = str(item.get("title") or item.get("id") or "YouTube")
        if channel := str(item.get("channel") or ""):
            title = f"{title} — {channel}"
        return BrowseMedia(
            title=title,
            media_class=MediaClass.TRACK,
            media_content_type=media_type,
            media_content_id=str(item.get("url") or canonical_youtube_url(item)),
            can_play=True,
            can_expand=False,
            thumbnail=str(item.get("thumbnail") or "") or None,
        )
