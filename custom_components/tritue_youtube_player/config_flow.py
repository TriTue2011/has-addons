"""Config flow for TriTue YouTube Player."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.const import CONF_TOKEN, CONF_URL
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    EntitySelector,
    EntitySelectorConfig,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)
from yarl import URL

from .api import (
    AuthenticationError,
    CannotConnectError,
    YouTubePlayerApiError,
    YouTubePlayerClient,
)
from .const import (
    API_VERSION,
    CONF_TARGET_ENTITY_ID,
    DEFAULT_ADDON_URL,
    DOMAIN,
    LOGGER,
)


class InvalidUrlError(ValueError):
    """The supplied server URL cannot be used."""


class UnsupportedApiError(YouTubePlayerApiError):
    """The server speaks an unsupported API version."""


STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_URL, default=DEFAULT_ADDON_URL): TextSelector(
            TextSelectorConfig(type=TextSelectorType.URL, autocomplete="url")
        ),
        vol.Required(CONF_TOKEN): TextSelector(
            TextSelectorConfig(type=TextSelectorType.PASSWORD)
        ),
    }
)


def normalize_base_url(value: str) -> str:
    """Validate and normalize an HTTP(S) server root URL."""
    try:
        parsed = URL(value.strip())
    except ValueError as error:
        raise InvalidUrlError from error
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.host is None
        or parsed.user is not None
        or parsed.password is not None
        or parsed.query_string
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise InvalidUrlError
    return str(parsed.with_path("")).rstrip("/")


async def validate_input(
    hass: HomeAssistant, base_url: str, token: str
) -> dict[str, Any]:
    """Verify connectivity, authentication and API compatibility."""
    client = YouTubePlayerClient(base_url, token, async_get_clientsession(hass))
    health = await client.async_health()
    if str(health.get("api_version")) != API_VERSION:
        raise UnsupportedApiError("unsupported_api")
    return health


class TriTueYouTubePlayerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Configure a Docker or Home Assistant App player instance."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> YouTubePlayerOptionsFlow:
        """Create the output media player options flow."""
        return YouTubePlayerOptionsFlow()

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle initial configuration."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                base_url = normalize_base_url(user_input[CONF_URL])
                token = str(user_input[CONF_TOKEN]).strip()
                await validate_input(self.hass, base_url, token)
            except InvalidUrlError:
                errors[CONF_URL] = "invalid_url"
            except AuthenticationError:
                errors["base"] = "invalid_auth"
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            except UnsupportedApiError:
                errors["base"] = "unsupported_api"
            except YouTubePlayerApiError:
                LOGGER.exception("Unexpected player API response during setup")
                errors["base"] = "unknown"
            else:
                await self.async_set_unique_id(base_url.casefold())
                self._abort_if_unique_id_configured()
                host = URL(base_url).host or "player"
                return self.async_create_entry(
                    title=f"TriTue YouTube Player ({host})",
                    data={CONF_URL: base_url, CONF_TOKEN: token},
                )

        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(
                STEP_USER_DATA_SCHEMA, user_input or {}
            ),
            errors=errors,
        )

    async def async_step_reconfigure(
        self, user_input: Mapping[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Update server URL or token and reload the entry."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                base_url = normalize_base_url(str(user_input[CONF_URL]))
                token = str(user_input[CONF_TOKEN]).strip()
                await validate_input(self.hass, base_url, token)
            except InvalidUrlError:
                errors[CONF_URL] = "invalid_url"
            except AuthenticationError:
                errors["base"] = "invalid_auth"
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            except UnsupportedApiError:
                errors["base"] = "unsupported_api"
            except YouTubePlayerApiError:
                LOGGER.exception("Unexpected player API response during reconfigure")
                errors["base"] = "unknown"
            else:
                return self.async_update_reload_and_abort(
                    entry,
                    data_updates={CONF_URL: base_url, CONF_TOKEN: token},
                    unique_id=base_url.casefold(),
                )

        suggested = dict(user_input or {CONF_URL: entry.data[CONF_URL]})
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(
                STEP_USER_DATA_SCHEMA, suggested
            ),
            errors=errors,
        )

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        """Start token reauthentication."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Validate and store a replacement token."""
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            token = str(user_input[CONF_TOKEN]).strip()
            try:
                await validate_input(self.hass, entry.data[CONF_URL], token)
            except AuthenticationError:
                errors["base"] = "invalid_auth"
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            except YouTubePlayerApiError:
                errors["base"] = "unknown"
            else:
                return self.async_update_reload_and_abort(
                    entry, data_updates={CONF_TOKEN: token}
                )

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_TOKEN): TextSelector(
                        TextSelectorConfig(type=TextSelectorType.PASSWORD)
                    )
                }
            ),
            errors=errors,
        )


class YouTubePlayerOptionsFlow(OptionsFlowWithReload):
    """Configure the physical media player used for playback."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Select or clear the default playback target."""
        if user_input is not None:
            return self.async_create_entry(data=user_input)

        schema = vol.Schema(
            {
                vol.Optional(CONF_TARGET_ENTITY_ID): EntitySelector(
                    EntitySelectorConfig(domain="media_player")
                )
            }
        )
        return self.async_show_form(
            step_id="init",
            data_schema=self.add_suggested_values_to_schema(
                schema, self.config_entry.options
            ),
        )
