"""Constants for the TriTue YouTube Player integration."""

import logging
from datetime import timedelta

DOMAIN = "tritue_youtube_player"
LOGGER = logging.getLogger(__package__)

CONF_TOKEN = "token"
CONF_TARGET_ENTITY_ID = "target_entity_id"
CONF_ENTRY_ID = "entry_id"
CONF_SOURCE = "source"
CONF_TARGET = "target"
CONF_VOLUME_LEVEL = "volume_level"
SERVICE_PLAY_ON_PLAYERS = "play_on_players"
CARD_URL = "/tritue_youtube_player/tritue-youtube-player-card.js"
API_VERSION = "1"
DEFAULT_ADDON_URL = "http://36f3bad2-youtube-player:8099"
DEFAULT_UPDATE_INTERVAL = timedelta(seconds=5)
