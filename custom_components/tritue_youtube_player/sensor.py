"""Diagnostic entities for TriTue YouTube Player."""

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import YouTubePlayerConfigEntry
from .entity import YouTubePlayerEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: YouTubePlayerConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up history diagnostics."""
    async_add_entities([YouTubePlayerHistorySensor(entry)])


class YouTubePlayerHistorySensor(YouTubePlayerEntity, SensorEntity):
    """Expose the number of retained history items."""

    _attr_icon = "mdi:history"
    _attr_translation_key = "history_count"

    def __init__(self, entry: YouTubePlayerConfigEntry) -> None:
        super().__init__(entry.runtime_data, entry)
        self._attr_unique_id = f"{entry.entry_id}_history_count"

    @property
    def native_value(self) -> int:
        """Return the current history item count."""
        return int(self.coordinator.data.get("history_count", 0))
