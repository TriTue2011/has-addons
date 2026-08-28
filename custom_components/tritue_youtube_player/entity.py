"""Base entity for TriTue YouTube Player."""

from __future__ import annotations

from homeassistant.const import CONF_URL
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import YouTubePlayerConfigEntry, YouTubePlayerCoordinator


class YouTubePlayerEntity(CoordinatorEntity[YouTubePlayerCoordinator]):
    """Represent an entity belonging to one player server."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: YouTubePlayerCoordinator,
        entry: YouTubePlayerConfigEntry,
    ) -> None:
        super().__init__(coordinator)
        self.entry = entry
        server_id = entry.unique_id or entry.entry_id
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, server_id)},
            name=entry.title,
            manufacturer="TriTue",
            model="YouTube Player",
            sw_version=str(coordinator.data.get("app_version", "unknown")),
            configuration_url=entry.data[CONF_URL],
        )
