import io
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

APP_DIR = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_DIR))

from server import (  # noqa: E402
    StreamUnavailableError,
    create_server,
    resolve_integration_token,
)


class YouTubePlayerHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.server = create_server(
            host="127.0.0.1",
            port=0,
            data_dir=Path(self.temp_dir.name),
            app_title="Test Player",
            max_history=2,
            integration_token="test-integration-token",
            public_base_url="http://172.16.10.200:8099",
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp_dir.cleanup()

    def request(self, path, *, method="GET", payload=None, headers=None):
        body = None
        request_headers = dict(headers or {})
        if payload is not None:
            body = json.dumps(payload).encode()
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=body, headers=request_headers, method=method
        )
        with urllib.request.urlopen(request, timeout=2) as response:
            return response.status, json.load(response)

    def remember_public_zing_target(self, target):
        self.server.remember_public_zing_results(
            [{"source": "zing", "kind": "song", "url": target}]
        )

    def test_health_reports_ready(self):
        status, body = self.request("/api/health")

        self.assertEqual(200, status)
        self.assertEqual({"status": "ok"}, body)

    def test_integration_token_is_created_once_and_reused(self):
        token = resolve_integration_token(Path(self.temp_dir.name), "")
        reused = resolve_integration_token(Path(self.temp_dir.name), "")

        self.assertEqual(token, reused)
        self.assertGreaterEqual(len(token), 32)
        self.assertEqual(
            token,
            (Path(self.temp_dir.name) / "integration_token").read_text(
                encoding="utf-8"
            ),
        )

    def test_integration_api_requires_bearer_authentication(self):
        for headers in ({}, {"Authorization": "Bearer wrong-token"}):
            with self.subTest(headers=headers):
                with self.assertRaises(urllib.error.HTTPError) as raised:
                    self.request("/api/integration/health", headers=headers)
                self.assertEqual(401, raised.exception.code)
                self.assertEqual({"error": "invalid_auth"}, json.load(raised.exception))

        status, body = self.request(
            "/api/integration/health",
            headers={"Authorization": "Bearer test-integration-token"},
        )

        self.assertEqual(200, status)
        self.assertEqual("ok", body["status"])
        self.assertEqual("1", body["api_version"])
        self.assertIn("play", body["capabilities"])

    def test_integration_can_play_and_read_status_and_history(self):
        headers = {"Authorization": "Bearer test-integration-token"}

        status, played = self.request(
            "/api/integration/play",
            method="POST",
            payload={"target": "https://youtu.be/dQw4w9WgXcQ"},
            headers=headers,
        )

        self.assertEqual(200, status)
        self.assertTrue(played["success"])
        self.assertEqual("dQw4w9WgXcQ", played["item"]["id"])

        _, player = self.request("/api/player")
        self.assertEqual("playing", player["state"])
        self.assertEqual("dQw4w9WgXcQ", player["item"]["id"])

        _, integration_status = self.request("/api/integration/status", headers=headers)
        self.assertEqual("playing", integration_status["state"])
        self.assertEqual(1, integration_status["history_count"])

        _, history = self.request("/api/integration/history", headers=headers)
        self.assertEqual(1, history["total"])
        self.assertEqual("dQw4w9WgXcQ", history["items"][0]["id"])

        _, stopped = self.request(
            "/api/integration/stop", method="POST", headers=headers
        )
        self.assertTrue(stopped["success"])
        _, player = self.request("/api/player")
        self.assertEqual({"state": "idle", "item": None}, player)

    @patch("server.search_youtube")
    def test_integration_can_search_music_metadata(self, search_youtube):
        search_youtube.return_value = [
            {
                "kind": "video",
                "id": "dQw4w9WgXcQ",
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "title": "Never Gonna Give You Up",
                "channel": "Rick Astley",
                "duration": 213,
                "thumbnail": "https://img.example/cover.jpg",
            }
        ]

        status, body = self.request(
            "/api/integration/search?q=Rick+Astley&limit=5",
            headers={"Authorization": "Bearer test-integration-token"},
        )

        self.assertEqual(200, status)
        self.assertTrue(body["success"])
        self.assertEqual(1, body["total"])
        self.assertEqual("dQw4w9WgXcQ", body["items"][0]["id"])
        search_youtube.assert_called_once_with("Rick Astley", limit=5)

    @patch("server.search_zing")
    def test_integration_can_select_the_zing_search_provider(self, search_zing):
        search_zing.return_value = [
            {
                "source": "zing",
                "kind": "song",
                "id": "ZZ90FD0B",
                "url": "https://zingmp3.vn/bai-hat/Thuc-Giac/ZZ90FD0B.html",
                "title": "Thức Giấc",
                "channel": "Da LAB",
                "duration": 269,
                "thumbnail": "https://photo-resize-zmp3.zmdcdn.me/cover.jpg",
            }
        ]

        status, body = self.request(
            "/api/integration/search?source=zing&q=Da+LAB&limit=5",
            headers={"Authorization": "Bearer test-integration-token"},
        )

        self.assertEqual(200, status)
        self.assertEqual("zing", body["source"])
        self.assertEqual("ZZ90FD0B", body["items"][0]["id"])
        search_zing.assert_called_once_with("Da LAB", limit=5)

    def test_integration_rejects_unknown_search_provider(self):
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.request(
                "/api/integration/search?source=unknown&q=music",
                headers={"Authorization": "Bearer test-integration-token"},
            )

        self.assertEqual(400, raised.exception.code)
        self.assertEqual(
            {"error": "invalid_search_source"}, json.load(raised.exception)
        )

    @patch("server.resolve_zing_stream")
    def test_integration_creates_a_short_lived_zing_stream_url(self, resolve):
        target = "https://zingmp3.vn/bai-hat/Thuc-Giac-Da-LAB/ZZ90FD0B.html"
        self.remember_public_zing_target(target)
        resolve.return_value = {
            "url": "https://audio.zmdcdn.me/song.mp3",
            "headers": {},
            "content_type": "audio/mpeg",
        }
        status, body = self.request(
            "/api/integration/stream",
            method="POST",
            payload={
                "source": "zing",
                "target": target,
            },
            headers={"Authorization": "Bearer test-integration-token"},
        )

        self.assertEqual(200, status)
        self.assertEqual("zing", body["source"])
        self.assertEqual("audio/mpeg", body["media_content_type"])
        self.assertTrue(
            body["stream_url"].startswith(
                "http://172.16.10.200:8099/api/stream/"
            )
        )
        resolve.assert_called_once()

    @patch("server.resolve_zing_stream")
    def test_stream_api_rejects_a_zing_url_not_returned_by_search(self, resolve):
        resolve.return_value = {
            "url": "https://audio.zmdcdn.me/song.mp3",
            "headers": {},
            "content_type": "audio/mpeg",
        }

        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.request(
                "/api/integration/stream",
                method="POST",
                payload={
                    "source": "zing",
                    "target": (
                        "https://zingmp3.vn/bai-hat/Unverified/ZZ90FD0B.html"
                    ),
                },
                headers={"Authorization": "Bearer test-integration-token"},
            )

        self.assertEqual(403, raised.exception.code)
        self.assertEqual(
            {"error": "unverified_zing_target"}, json.load(raised.exception)
        )
        resolve.assert_not_called()

    @patch("server.urlopen")
    @patch("server.resolve_zing_stream")
    def test_signed_stream_relays_audio_and_range_requests(
        self, resolve, open_upstream
    ):
        target = "https://zingmp3.vn/bai-hat/Thuc-Giac/ZZ90FD0B.html"
        self.remember_public_zing_target(target)
        resolve.return_value = {
            "url": "https://audio.zmdcdn.me/song.mp3",
            "headers": {"Referer": "https://zingmp3.vn/"},
            "content_type": "audio/mpeg",
        }
        upstream = io.BytesIO(b"MP3!")
        upstream.headers = {
            "Content-Type": "audio/mpeg",
            "Content-Length": "4",
            "Content-Range": "bytes 0-3/4",
            "Accept-Ranges": "bytes",
        }
        upstream.getcode = lambda: 206
        open_upstream.return_value = upstream
        _, created = self.request(
            "/api/integration/stream",
            method="POST",
            payload={
                "source": "zing",
                "target": target,
            },
            headers={"Authorization": "Bearer test-integration-token"},
        )
        token = created["stream_url"].rsplit("/", 1)[-1]
        request = urllib.request.Request(
            f"{self.base_url}/api/stream/{token}",
            headers={"Range": "bytes=0-3"},
        )

        with urllib.request.urlopen(request, timeout=2) as response:
            self.assertEqual(206, response.status)
            self.assertEqual("audio/mpeg", response.headers["Content-Type"])
            self.assertEqual(b"MP3!", response.read())

        upstream_request = open_upstream.call_args.args[0]
        self.assertEqual("bytes=0-3", upstream_request.get_header("Range"))

    @patch("server.resolve_zing_stream")
    def test_stream_creation_reports_an_unplayable_zing_result(self, resolve):
        target = "https://zingmp3.vn/bai-hat/Thuc-Giac/ZZ90FD0B.html"
        self.remember_public_zing_target(target)
        resolve.side_effect = StreamUnavailableError("stream_provider_failed")
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.request(
                "/api/integration/stream",
                method="POST",
                payload={
                    "source": "zing",
                    "target": target,
                },
                headers={"Authorization": "Bearer test-integration-token"},
            )

        self.assertEqual(502, raised.exception.code)
        self.assertEqual({"error": "stream_unavailable"}, json.load(raised.exception))

    def test_public_stream_rejects_an_invalid_signature(self):
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.request("/api/stream/not-a-valid-token")

        self.assertEqual(403, raised.exception.code)
        self.assertEqual({"error": "invalid_stream_token"}, json.load(raised.exception))

    def test_stream_api_does_not_accept_youtube_targets(self):
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.request(
                "/api/integration/stream",
                method="POST",
                payload={
                    "source": "youtube",
                    "target": "https://youtube.com/watch?v=dQw4w9WgXcQ",
                },
                headers={"Authorization": "Bearer test-integration-token"},
            )

        self.assertEqual(400, raised.exception.code)
        self.assertEqual({"error": "unsupported_stream_source"}, json.load(raised.exception))

    def test_video_url_is_normalized_and_persisted(self):
        status, target = self.request(
            "/api/history",
            method="POST",
            payload={"target": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
        )

        self.assertEqual(201, status)
        self.assertEqual("video", target["kind"])
        self.assertEqual("dQw4w9WgXcQ", target["id"])
        self.assertEqual(
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1",
            target["embed_url"],
        )

        _, history = self.request("/api/history")
        self.assertEqual([target], history["items"])

        persisted = json.loads(
            (Path(self.temp_dir.name) / "history.json").read_text(encoding="utf-8")
        )
        self.assertEqual([target], persisted)

    def test_playlist_and_short_urls_are_supported_and_history_is_bounded(self):
        _, playlist = self.request(
            "/api/history",
            method="POST",
            payload={"target": "https://youtube.com/playlist?list=PL1234567890abc"},
        )
        self.assertEqual("playlist", playlist["kind"])
        self.assertEqual(
            "https://www.youtube-nocookie.com/embed/videoseries?list=PL1234567890abc&autoplay=1",
            playlist["embed_url"],
        )

        self.request(
            "/api/history",
            method="POST",
            payload={"target": "https://youtube.com/shorts/aqz-KE-bpKQ"},
        )
        _, newest = self.request(
            "/api/history", method="POST", payload={"target": "M7lc1UVf-VE"}
        )

        _, history = self.request("/api/history")
        self.assertEqual(2, len(history["items"]))
        self.assertEqual(newest, history["items"][0])
        self.assertEqual("aqz-KE-bpKQ", history["items"][1]["id"])

    def test_watch_url_preserves_playlist_context_for_cast(self):
        _, target = self.request(
            "/api/history",
            method="POST",
            payload={
                "target": (
                    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abc"
                )
            },
        )

        self.assertEqual("video", target["kind"])
        self.assertEqual("dQw4w9WgXcQ", target["id"])
        self.assertEqual("PL1234567890abc", target["playlist_id"])
        self.assertEqual(
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
            "?list=PL1234567890abc&autoplay=1",
            target["embed_url"],
        )

    def test_invalid_payload_has_a_stable_error_contract(self):
        with self.assertRaises(urllib.error.HTTPError) as raised:
            self.request("/api/history", method="POST", payload=[])

        self.assertEqual(400, raised.exception.code)
        self.assertEqual({"error": "invalid_request"}, json.load(raised.exception))
        _, history = self.request("/api/history")
        self.assertEqual([], history["items"])

    def test_history_can_be_cleared(self):
        self.request("/api/history", method="POST", payload={"target": "dQw4w9WgXcQ"})

        status, body = self.request("/api/history", method="DELETE")

        self.assertEqual(200, status)
        self.assertEqual({"items": []}, body)
        _, history = self.request("/api/history")
        self.assertEqual([], history["items"])

    def test_web_ui_and_runtime_config_are_served(self):
        with urllib.request.urlopen(f"{self.base_url}/", timeout=2) as response:
            page = response.read().decode("utf-8")
            self.assertEqual(200, response.status)
            self.assertEqual(
                "text/html; charset=utf-8", response.headers["Content-Type"]
            )

        self.assertIn("TriTue YouTube Player", page)
        self.assertIn('aria-label="Trình phát YouTube"', page)

        with urllib.request.urlopen(f"{self.base_url}/app.js", timeout=2) as response:
            script = response.read().decode("utf-8")
        self.assertIn('api("api/history")', script)
        self.assertIn('api("api/player")', script)

        with urllib.request.urlopen(
            f"{self.base_url}/favicon.svg", timeout=2
        ) as response:
            self.assertEqual("image/svg+xml", response.headers["Content-Type"])

        _, config = self.request("/api/config")
        self.assertEqual(
            {
                "app_title": "Test Player",
                "max_history": 2,
                "sources": ["youtube", "zing"],
            },
            config,
        )

    def test_process_reads_home_assistant_options(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]

        options_path = Path(self.temp_dir.name) / "options.json"
        options_path.write_text(
            json.dumps({"app_title": "Configured Player", "max_history": 3}),
            encoding="utf-8",
        )
        environment = {
            **os.environ,
            "HOST": "127.0.0.1",
            "PORT": str(port),
            "DATA_DIR": self.temp_dir.name,
        }
        process = subprocess.Popen(
            [sys.executable, str(APP_DIR / "server.py")],
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                try:
                    with urllib.request.urlopen(
                        f"http://127.0.0.1:{port}/api/config", timeout=0.2
                    ) as response:
                        config = json.load(response)
                    break
                except (urllib.error.URLError, ConnectionError):
                    time.sleep(0.05)
            else:
                output = process.stdout.read() if process.stdout else ""
                self.fail(f"server did not start: {output}")

            self.assertEqual(
                {
                    "app_title": "Configured Player",
                    "max_history": 3,
                    "sources": ["youtube", "zing"],
                },
                config,
            )
        finally:
            process.terminate()
            process.wait(timeout=2)
            if process.stdout:
                process.stdout.close()


if __name__ == "__main__":
    unittest.main()
