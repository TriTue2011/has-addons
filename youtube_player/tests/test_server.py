import json
import sys
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_DIR))

from server import create_server  # noqa: E402


class YouTubePlayerHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.server = create_server(
            host="127.0.0.1",
            port=0,
            data_dir=Path(self.temp_dir.name),
            app_title="Test Player",
            max_history=2,
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp_dir.cleanup()

    def request(self, path, *, method="GET", payload=None):
        body = None
        headers = {}
        if payload is not None:
            body = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=body, headers=headers, method=method
        )
        with urllib.request.urlopen(request, timeout=2) as response:
            return response.status, json.load(response)

    def test_health_reports_ready(self):
        status, body = self.request("/api/health")

        self.assertEqual(200, status)
        self.assertEqual({"status": "ok"}, body)

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


if __name__ == "__main__":
    unittest.main()
