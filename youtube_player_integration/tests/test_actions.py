import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


ROOT = Path(__file__).resolve().parents[2]
COMPONENT_DIR = ROOT / "custom_components" / "tritue_youtube_player"


def load_actions_module():
    component_package = types.ModuleType("custom_components.tritue_youtube_player")
    component_package.__path__ = [str(COMPONENT_DIR)]
    modules = {"custom_components.tritue_youtube_player": component_package}
    module_name = "custom_components.tritue_youtube_player.actions"
    spec = importlib.util.spec_from_file_location(
        module_name, COMPONENT_DIR / "actions.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("unable_to_load_actions_module")
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module


class FakeServices:
    def __init__(self):
        self.calls = []

    async def async_call(
        self, domain, service, service_data=None, *, blocking=False, target=None
    ):
        self.calls.append(
            {
                "domain": domain,
                "service": service,
                "service_data": service_data or {},
                "blocking": blocking,
                "target": target,
            }
        )


class MultiPlayerActionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.actions = load_actions_module()
        self.hass = types.SimpleNamespace(services=FakeServices())
        self.client = types.SimpleNamespace(
            async_play=AsyncMock(
                return_value={
                    "item": {
                        "source": "youtube",
                        "kind": "video",
                        "id": "dQw4w9WgXcQ",
                    }
                }
            ),
            async_create_stream=AsyncMock(
                return_value={
                    "stream_url": "http://192.0.2.10:8099/api/stream/signed",
                    "media_content_type": "audio/mpeg",
                }
            ),
        )

    async def test_youtube_dispatches_for_each_platform_and_sets_group_volume(self):
        result = await self.actions.async_play_on_players(
            self.hass,
            self.client,
            source="youtube",
            target="dQw4w9WgXcQ",
            entity_ids=["media_player.cast", "media_player.other"],
            target_platforms={
                "media_player.cast": "cast",
                "media_player.other": "dlna_dmr",
            },
            volume_level=0.35,
        )

        self.assertEqual(2, result["target_count"])
        self.assertEqual("volume_set", self.hass.services.calls[0]["service"])
        self.assertEqual(
            {"entity_id": ["media_player.cast", "media_player.other"]},
            self.hass.services.calls[0]["target"],
        )
        cast_call = self.hass.services.calls[1]
        self.assertEqual("cast", cast_call["service_data"]["media_content_type"])
        other_call = self.hass.services.calls[2]
        self.assertEqual(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            other_call["service_data"]["media_content_id"],
        )

    async def test_zing_creates_one_signed_stream_for_all_selected_speakers(self):
        target = "https://zingmp3.vn/bai-hat/Thuc-Giac/ZZ90FD0B.html"
        result = await self.actions.async_play_on_players(
            self.hass,
            self.client,
            source="zing",
            target=target,
            entity_ids=["media_player.living_room", "media_player.kitchen"],
            target_platforms={},
        )

        self.client.async_create_stream.assert_awaited_once_with("zing", target)
        self.assertEqual("audio/mpeg", self.hass.services.calls[0]["service_data"]["media_content_type"])
        self.assertEqual(
            {"entity_id": ["media_player.living_room", "media_player.kitchen"]},
            self.hass.services.calls[0]["target"],
        )
        self.assertEqual("zing", result["source"])


if __name__ == "__main__":
    unittest.main()
