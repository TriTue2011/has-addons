import asyncio
import importlib.util
import sys
import tempfile
import threading
import unittest
from pathlib import Path

import aiohttp

ROOT = Path(__file__).resolve().parents[2]
SERVER_APP_DIR = ROOT / "youtube_player" / "app"
API_MODULE_PATH = ROOT / "custom_components" / "tritue_youtube_player" / "api.py"
sys.path.insert(0, str(SERVER_APP_DIR))

from server import create_server


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


class YouTubePlayerClientTests(unittest.IsolatedAsyncioTestCase):
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
