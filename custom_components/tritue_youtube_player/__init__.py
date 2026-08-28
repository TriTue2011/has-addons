"""TriTue YouTube Player integration."""

from homeassistant.const import CONF_URL, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import YouTubePlayerClient
from .const import CONF_TOKEN
from .coordinator import YouTubePlayerConfigEntry, YouTubePlayerCoordinator

PLATFORMS: list[Platform] = [Platform.MEDIA_PLAYER, Platform.SENSOR]


async def async_setup_entry(
    hass: HomeAssistant, entry: YouTubePlayerConfigEntry
) -> bool:
    """Set up a configured player server."""
    client = YouTubePlayerClient(
        entry.data[CONF_URL],
        entry.data[CONF_TOKEN],
        async_get_clientsession(hass),
    )
    coordinator = YouTubePlayerCoordinator(hass, entry, client)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: YouTubePlayerConfigEntry
) -> bool:
    """Unload a configured player server."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
