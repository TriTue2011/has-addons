import importlib.util
import gzip
import hashlib
import hmac
import io
import json
import sys
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
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

    def test_resolver_follows_public_id_redirect_and_selects_320k_audio(self):
        redirected_target = (
            "https://zingmp3.vn/bai-hat/Thuc-Giac-Da-LAB/XwsdXWtaDHNH.html"
        )
        api_payload = gzip.compress(
            json.dumps(
                {
                    "err": 0,
                    "msg": "Success",
                    "data": {
                        "128": "https://audio.zmdcdn.me/song-128.mp3",
                        "320": "https://audio.zmdcdn.me/song-320.mp3",
                    },
                }
            ).encode()
        )

        class FakeResponse(io.BytesIO):
            def __init__(self, body=b"", *, url, headers=None):
                super().__init__(body)
                self._url = url
                self.headers = headers or {}

            def geturl(self):
                return self._url

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                self.close()

        opener = unittest.mock.Mock()
        opener.open.side_effect = [
            FakeResponse(url=redirected_target),
            FakeResponse(
                api_payload,
                url="https://zingmp3.vn/api/v2/song/get/streaming",
                headers={"Content-Encoding": "gzip"},
            ),
        ]
        with patch.object(self.streaming, "build_opener", return_value=opener):
            result = self.streaming.resolve_zing_stream(
                self.target, timeout=20, now=1_787_976_165
            )

        self.assertEqual("https://audio.zmdcdn.me/song-320.mp3", result["url"])
        self.assertEqual("audio/mpeg", result["content_type"])
        self.assertEqual(2, opener.open.call_count)
        api_request = opener.open.call_args_list[1].args[0]
        query = parse_qs(urlsplit(api_request.full_url).query)
        self.assertEqual(["XwsdXWtaDHNH"], query["id"])
        self.assertEqual(["1787976165"], query["ctime"])
        self.assertEqual(["1.20.4"], query["version"])
        canonical = "ctime=1787976165id=XwsdXWtaDHNHversion=1.20.4"
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        expected_signature = hmac.new(
            self.streaming.ZING_API_SECRET.encode(),
            f"/api/v2/song/get/streaming{digest}".encode(),
            hashlib.sha512,
        ).hexdigest()
        self.assertEqual([expected_signature], query["sig"])


if __name__ == "__main__":
    unittest.main()
