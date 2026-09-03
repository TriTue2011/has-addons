import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLAYBACK_MODULE_PATH = (
    ROOT / "custom_components" / "tritue_youtube_player" / "playback.py"
)


def load_playback_module():
    spec = importlib.util.spec_from_file_location(
        "tritue_youtube_player_playback", PLAYBACK_MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("unable_to_load_playback_module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class PlaybackRequestTests(unittest.TestCase):
    def setUp(self):
        self.playback = load_playback_module()

    def test_cast_video_uses_official_youtube_quick_play_payload(self):
        request = self.playback.build_target_request(
            {"kind": "video", "id": "dQw4w9WgXcQ"},
            target_platform="cast",
            requested_media_type="video",
        )

        self.assertEqual("cast", request["media_content_type"])
        self.assertEqual(
            {"app_name": "youtube", "media_id": "dQw4w9WgXcQ"},
            json.loads(request["media_content_id"]),
        )

    def test_cast_video_preserves_playlist_context(self):
        request = self.playback.build_target_request(
            {
                "kind": "video",
                "id": "dQw4w9WgXcQ",
                "playlist_id": "PL1234567890",
            },
            target_platform="cast",
            requested_media_type="video",
        )

        self.assertEqual(
            {
                "app_name": "youtube",
                "media_id": "dQw4w9WgXcQ",
                "playlist_id": "PL1234567890",
            },
            json.loads(request["media_content_id"]),
        )

    def test_cast_playlist_requires_a_starting_video(self):
        with self.assertRaises(self.playback.UnsupportedCastMediaError):
            self.playback.build_target_request(
                {"kind": "playlist", "id": "PL1234567890"},
                target_platform="cast",
                requested_media_type="playlist",
            )

    def test_audio_only_cast_rejects_a_youtube_video_page(self):
        with self.assertRaises(self.playback.UnsupportedTargetMediaError):
            self.playback.build_target_request(
                {"kind": "video", "id": "dQw4w9WgXcQ"},
                target_platform="cast",
                target_device_class="speaker",
                requested_media_type="video",
            )

    def test_android_tv_opens_youtube_with_a_supported_url_deep_link(self):
        request = self.playback.build_target_request(
            {"kind": "video", "id": "dQw4w9WgXcQ"},
            target_platform="androidtv_remote",
            target_device_class="tv",
            requested_media_type="video",
        )

        self.assertEqual("url", request["media_content_type"])
        self.assertEqual(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            request["media_content_id"],
        )

    def test_non_cast_entity_receives_a_canonical_url_for_a_video_id(self):
        request = self.playback.build_target_request(
            {"kind": "video", "id": "dQw4w9WgXcQ"},
            target_platform="sonos",
            requested_media_type="video",
        )

        self.assertEqual("video", request["media_content_type"])
        self.assertEqual(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            request["media_content_id"],
        )

    def test_non_cast_entity_receives_a_canonical_playlist_url(self):
        request = self.playback.build_target_request(
            {"kind": "playlist", "id": "PL1234567890"},
            target_platform="androidtv_remote",
            requested_media_type="playlist",
        )

        self.assertEqual("url", request["media_content_type"])
        self.assertEqual(
            "https://www.youtube.com/playlist?list=PL1234567890",
            request["media_content_id"],
        )

    def test_zing_stream_payload_becomes_generic_audio_media(self):
        request = self.playback.build_stream_request(
            {
                "stream_url": "http://192.0.2.10:8099/api/stream/signed-token",
                "media_content_type": "audio/mpeg",
            }
        )

        self.assertEqual(
            {
                "media_content_id": (
                    "http://192.0.2.10:8099/api/stream/signed-token"
                ),
                "media_content_type": "audio/mpeg",
            },
            request,
        )

    def test_target_entity_list_is_ordered_deduplicated_and_bounded(self):
        self.assertEqual(
            ["media_player.living_room", "media_player.kitchen"],
            self.playback.normalize_target_entity_ids(
                [
                    "media_player.living_room",
                    "media_player.kitchen",
                    "media_player.living_room",
                ],
                excluded={"media_player.virtual_player"},
            ),
        )
        for invalid in (
            [],
            ["light.kitchen"],
            ["media_player.virtual_player"],
            [f"media_player.speaker_{index}" for index in range(17)],
        ):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    self.playback.normalize_target_entity_ids(
                        invalid, excluded={"media_player.virtual_player"}
                    )


if __name__ == "__main__":
    unittest.main()
