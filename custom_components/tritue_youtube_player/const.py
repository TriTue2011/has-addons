"""Constants for the TriTue YouTube Player integration."""

import logging
from datetime import timedelta

DOMAIN = "tritue_youtube_player"
LOGGER = logging.getLogger(__package__)

CONF_TOKEN = "token"
API_VERSION = "1"
DEFAULT_ADDON_URL = "http://36f3bad2-youtube-player:8099"
DEFAULT_UPDATE_INTERVAL = timedelta(seconds=5)
