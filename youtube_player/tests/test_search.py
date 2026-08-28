import importlib.util
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


APP_DIR = Path(__file__).resolve().parents[1] / "app"
SEARCH_MODULE_PATH = APP_DIR / "search.py"


def load_search_module():
    spec = importlib.util.spec_from_file_location(
        "tritue_youtube_player_search", SEARCH_MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("unable_to_load_search_module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class YouTubeMetadataSearchTests(unittest.TestCase):
    def setUp(self):
        self.search = load_search_module()

    def test_parse_search_payload_returns_only_playable_video_metadata(self):
        payload = {
            "entries": [
                {
                    "id": "dQw4w9WgXcQ",
                    "title": "Never Gonna Give You Up",
                    "channel": "Rick Astley",
                    "duration": 213,
                    "thumbnails": [
                        {"url": "https://img.example/small.jpg"},
                        {"url": "https://img.example/large.jpg"},
                    ],
                },
                {"id": "not-playable", "title": "Invalid"},
                None,
            ]
        }

        self.assertEqual(
            [
                {
                    "source": "youtube",
                    "kind": "video",
                    "id": "dQw4w9WgXcQ",
                    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    "title": "Never Gonna Give You Up",
                    "channel": "Rick Astley",
                    "duration": 213,
                    "thumbnail": "https://img.example/large.jpg",
                }
            ],
            self.search.parse_search_payload(payload, limit=10),
        )

    def test_search_is_metadata_only_and_uses_youtube_music_songs(self):
        completed = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=json.dumps({"entries": []}), stderr=""
        )
        with patch("subprocess.run", return_value=completed) as run:
            results = self.search.search_youtube("da LAB", limit=12)

        self.assertEqual([], results)
        command = run.call_args.args[0]
        self.assertIn("--flat-playlist", command)
        self.assertIn("--dump-single-json", command)
        self.assertIn("--skip-download", command)
        self.assertIn("--playlist-end", command)
        self.assertIn("12", command)
        self.assertEqual("https://music.youtube.com/search?q=da+LAB#songs", command[-1])

    def test_parse_search_payload_adds_a_stable_thumbnail_fallback(self):
        results = self.search.parse_search_payload(
            {"entries": [{"id": "M7lc1UVf-VE", "title": "Live"}]},
            limit=1,
        )

        self.assertEqual(
            "https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg",
            results[0]["thumbnail"],
        )

    def test_parse_zing_payload_returns_public_song_metadata(self):
        payload = {
            "data": {
                "items": [
                    {
                        "keywords": [{"type": 0, "keyword": "da lab"}],
                    },
                    {
                        "suggestions": [
                            {
                                "type": 1,
                                "id": "ZZ90FD0B",
                                "title": "Thức Giấc",
                                "thumb": "https://photo-resize-zmp3.zmdcdn.me/cover.jpg",
                                "duration": 269,
                                "link": "https://zingmp3.vn/bai-hat/Thuc-Giac-Da-LAB/ZZ90FD0B.html",
                                "status": 1,
                                "playStatus": 2,
                                "artists": [{"name": "Da LAB"}],
                            },
                            {"type": 4, "id": "IWZAWB8O", "name": "Da LAB"},
                        ]
                    },
                ]
            }
        }

        self.assertEqual(
            [
                {
                    "source": "zing",
                    "kind": "song",
                    "id": "ZZ90FD0B",
                    "url": "https://zingmp3.vn/bai-hat/Thuc-Giac-Da-LAB/ZZ90FD0B.html",
                    "title": "Thức Giấc",
                    "channel": "Da LAB",
                    "duration": 269,
                    "thumbnail": "https://photo-resize-zmp3.zmdcdn.me/cover.jpg",
                }
            ],
            self.search.parse_zing_payload(payload, limit=10),
        )

    def test_parse_zing_payload_rejects_lookalike_domains(self):
        payload = {
            "data": {
                "items": [
                    {
                        "suggestions": [
                            {
                                "type": 1,
                                "id": "ZZ90FD0B",
                                "title": "Unsafe result",
                                "link": (
                                    "https://notzingmp3.vn/bai-hat/Unsafe/"
                                    "ZZ90FD0B.html"
                                ),
                            }
                        ]
                    }
                ]
            }
        }

        self.assertEqual([], self.search.parse_zing_payload(payload, limit=10))

    def test_search_zing_uses_public_suggestion_endpoint(self):
        payload = json.dumps({"err": 0, "data": {"items": []}}).encode()
        response = io.BytesIO(payload)
        response.headers = {}
        with patch.object(self.search, "urlopen", return_value=response) as open_url:
            results = self.search.search_zing("Da LAB", limit=7)

        self.assertEqual([], results)
        request = open_url.call_args.args[0]
        self.assertEqual(
            "https://ac.zingmp3.vn/v1/web/ac-suggestions?query=Da+LAB&num=7",
            request.full_url,
        )
        self.assertEqual("application/json", request.get_header("Accept"))

    def test_search_rejects_empty_or_oversized_queries(self):
        for query in ("", "x" * 121):
            with self.subTest(query=query):
                with self.assertRaises(ValueError):
                    self.search.search_youtube(query)


if __name__ == "__main__":
    unittest.main()
