"""Home Assistant actions exposed by TriTue YouTube Player."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import ATTR_ENTITY_ID, STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv, entity_registry as er

from .actions import async_play_on_players
from .api import InvalidTargetError, YouTubePlayerApiError
from .const import (
    CONF_ENTRY_ID,
    CONF_SOURCE,
    CONF_TARGET,
    CONF_VOLUME_LEVEL,
    DOMAIN,
    SERVICE_PLAY_ON_PLAYERS,
)
from .playback import UnsupportedCastMediaError, normalize_target_entity_ids


PLAY_ON_PLAYERS_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_ENTRY_ID): cv.string,
        vol.Required(CONF_SOURCE): vol.In({"youtube", "zing"}),
        vol.Required(CONF_TARGET): cv.string,
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,
        vol.Optional(CONF_VOLUME_LEVEL): vol.All(
            vol.Coerce(float), vol.Range(min=0, max=1)
        ),
    }
)


def _validation_error(key: str) -> ServiceValidationError:
    return ServiceValidationError(translation_domain=DOMAIN, translation_key=key)


async def _async_handle_play_on_players(
    hass: HomeAssistant, call: ServiceCall
) -> None:
    """Resolve a selected result and play it on all requested entities."""
    entry = hass.config_entries.async_get_entry(call.data[CONF_ENTRY_ID])
    if (
        entry is None
        or entry.domain != DOMAIN
        or entry.state is not ConfigEntryState.LOADED
    ):
        raise _validation_error("entry_unavailable")

    registry = er.async_get(hass)
    excluded = {
        registry_entry.entity_id
        for registry_entry in registry.entities.values()
        if registry_entry.config_entry_id == entry.entry_id
        and registry_entry.domain == "media_player"
    }
    try:
        entity_ids = normalize_target_entity_ids(
            call.data[ATTR_ENTITY_ID], excluded=excluded
        )
    except ValueError as error:
        raise _validation_error("invalid_target_entities") from error

    for entity_id in entity_ids:
        state = hass.states.get(entity_id)
        if state is None or state.state == STATE_UNAVAILABLE:
            raise _validation_error("target_unavailable")

    platforms = {}
    for entity_id in entity_ids:
        registry_entry = registry.async_get(entity_id)
        platforms[entity_id] = registry_entry.platform if registry_entry else None

    try:
        await async_play_on_players(
            hass,
            entry.runtime_data.client,
            source=call.data[CONF_SOURCE],
            target=call.data[CONF_TARGET],
            entity_ids=entity_ids,
            target_platforms=platforms,
            volume_level=call.data.get(CONF_VOLUME_LEVEL),
            excluded_entity_ids=excluded,
        )
    except InvalidTargetError as error:
        raise _validation_error("invalid_target") from error
    except UnsupportedCastMediaError as error:
        raise _validation_error("cast_playlist_requires_video") from error
    except (YouTubePlayerApiError, ValueError) as error:
        raise _validation_error("playback_error") from error


def async_register_services(hass: HomeAssistant) -> None:
    """Register integration actions once for all config entries."""
    if hass.services.has_service(DOMAIN, SERVICE_PLAY_ON_PLAYERS):
        return

    async def handle(call: ServiceCall) -> None:
        await _async_handle_play_on_players(hass, call)

    hass.services.async_register(
        DOMAIN,
        SERVICE_PLAY_ON_PLAYERS,
        handle,
        schema=PLAY_ON_PLAYERS_SCHEMA,
    )
