import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


APP_DIR = Path(__file__).resolve().parents[1] / "app"
STREAMING_MODULE_PATH = APP_DIR / "streaming.py"


def load_streaming_module():
    spec = importlib.util.spec_from_file_location(
        "tritue_youtube_player_streaming", STREAMING_MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("unable_to_load_streaming_module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class SignedZingStreamTests(unittest.TestCase):
    def setUp(self):
        self.streaming = load_streaming_module()
        self.target = (
            "https://zingmp3.vn/bai-hat/Thuc-Giac-Da-LAB/ZZ90FD0B.html"
        )

    def test_signed_url_round_trip_is_bound_to_zing_and_expiry(self):
        stream_url = self.streaming.build_signed_stream_url(
            "http://172.16.10.200:8099/",
            self.target,
            "integration-secret",
            now=1_000,
            ttl=300,
        )

        self.assertTrue(stream_url.startswith("http://172.16.10.200:8099/api/stream/"))
        token = stream_url.rsplit("/", 1)[-1]
        self.assertEqual(
            self.target,
            self.streaming.verify_stream_token(
                token, "integration-secret", now=1_299
            ),
        )

        with self.assertRaises(self.streaming.InvalidStreamTokenError):
            self.streaming.verify_stream_token(
                token, "integration-secret", now=1_301
            )

    def test_tampered_token_and_non_zing_targets_are_rejected(self):
        token = self.streaming.create_stream_token(
            self.target, "integration-secret", now=1_000, ttl=300
        )
        with self.assertRaises(self.streaming.InvalidStreamTokenError):
            self.streaming.verify_stream_token(
                f"{token}x", "integration-secret", now=1_001
            )
        with self.assertRaises(ValueError):
            self.streaming.create_stream_token(
                "https://youtube.com/watch?v=dQw4w9WgXcQ",
                "integration-secret",
                now=1_000,
                ttl=300,
            )

    def test_resolver_selects_audio_without_downloading_or_transcoding(self):
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(
                {
                    "url": "https://audio.zmdcdn.me/song.mp3",
                    "protocol": "https",
                    "ext": "mp3",
                    "vcodec": "none",
                    "acodec": "mp3",
                    "http_headers": {"Referer": "https://zingmp3.vn/"},
                }
            ),
            stderr="",
        )
        with patch("subprocess.run", return_value=completed) as run:
            result = self.streaming.resolve_zing_stream(self.target)

        self.assertEqual("https://audio.zmdcdn.me/song.mp3", result["url"])
        self.assertEqual("audio/mpeg", result["content_type"])
        command = run.call_args.args[0]
        self.assertIn("--skip-download", command)
        self.assertIn("bestaudio/best", command)
        self.assertNotIn("--extract-audio", command)


if __name__ == "__main__":
    unittest.main()
