import asyncio
import hashlib
import importlib.util
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import aiohttp

ROOT = Path(__file__).resolve().parents[2]
SERVER_APP_DIR = ROOT / "youtube_player" / "app"
API_MODULE_PATH = ROOT / "custom_components" / "tritue_youtube_player" / "api.py"
CONST_MODULE_PATH = API_MODULE_PATH.with_name("const.py")
sys.path.insert(0, str(SERVER_APP_DIR))

from server import create_server  # noqa: E402


def load_api_module():
    spec = importlib.util.spec_from_file_location(
        "tritue_youtube_player_api", API_MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("unable_to_load_api_module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_const_module():
    spec = importlib.util.spec_from_file_location(
        "tritue_youtube_player_const", CONST_MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("unable_to_load_const_module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class YouTubePlayerClientTests(unittest.IsolatedAsyncioTestCase):
    def test_default_addon_hostname_matches_supervisor_repository_hash(self):
        repository_url = "https://github.com/TriTue2011/has-addons"
        repository_hash = hashlib.sha1(repository_url.lower().encode()).hexdigest()[:8]
        constants = load_const_module()

        self.assertEqual(
            f"http://{repository_hash}-youtube-player:8099",
            constants.DEFAULT_ADDON_URL,
        )

    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.server = create_server(
            host="127.0.0.1",
            port=0,
            data_dir=Path(self.temp_dir.name),
            app_title="API Contract Test",
            max_history=5,
            integration_token="contract-token",
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.session = aiohttp.ClientSession()
        self.api = load_api_module()
        self.client = self.api.YouTubePlayerClient(
            f"http://127.0.0.1:{self.server.server_port}",
            "contract-token",
            self.session,
        )

    async def asyncTearDown(self):
        await self.session.close()
        await asyncio.to_thread(self.server.shutdown)
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp_dir.cleanup()

    async def test_client_controls_server_through_v1_contract(self):
        health = await self.client.async_health()
        self.assertEqual("1", health["api_version"])

        played = await self.client.async_play("dQw4w9WgXcQ")
        self.assertEqual("dQw4w9WgXcQ", played["item"]["id"])

        status = await self.client.async_status()
        self.assertEqual("playing", status["state"])

        history = await self.client.async_history()
        self.assertEqual(1, history["total"])

        with patch(
            "server.search_youtube",
            return_value=[
                {
                    "kind": "video",
                    "id": "M7lc1UVf-VE",
                    "url": "https://www.youtube.com/watch?v=M7lc1UVf-VE",
                    "title": "YouTube Developers Live",
                    "channel": "Google for Developers",
                    "duration": 120,
                    "thumbnail": "https://img.example/cover.jpg",
                }
            ],
        ):
            search = await self.client.async_search("YouTube Developers", limit=5)
        self.assertEqual("M7lc1UVf-VE", search["items"][0]["id"])

        stopped = await self.client.async_stop()
        self.assertEqual("idle", stopped["state"])

    async def test_client_maps_invalid_token_to_authentication_error(self):
        client = self.api.YouTubePlayerClient(
            f"http://127.0.0.1:{self.server.server_port}",
            "wrong-token",
            self.session,
        )

        with self.assertRaises(self.api.AuthenticationError):
            await client.async_health()
