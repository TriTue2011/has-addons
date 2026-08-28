#!/usr/bin/env python3
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
PLAYLIST_ID = re.compile(r"^[A-Za-z0-9_-]{10,80}$")
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}


def normalize_target(raw_target):
    target = str(raw_target or "").strip()
    video_id = target if VIDEO_ID.fullmatch(target) else None
    playlist_id = None

    if video_id is None:
        parsed = urlsplit(target)
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in {"http", "https"} or host not in YOUTUBE_HOSTS:
            raise ValueError("invalid_youtube_target")
        if host == "youtu.be":
            video_id = parsed.path.strip("/").split("/", 1)[0]
        elif parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.path.startswith(("/shorts/", "/embed/")):
            video_id = parsed.path.rstrip("/").rsplit("/", 1)[-1]
        elif parsed.path == "/playlist":
            playlist_id = parse_qs(parsed.query).get("list", [""])[0]

    if PLAYLIST_ID.fullmatch(playlist_id or ""):
        return {
            "kind": "playlist",
            "id": playlist_id,
            "embed_url": (
                "https://www.youtube-nocookie.com/embed/videoseries"
                f"?list={playlist_id}&autoplay=1"
            ),
        }

    if not VIDEO_ID.fullmatch(video_id or ""):
        raise ValueError("invalid_youtube_target")

    return {
        "kind": "video",
        "id": video_id,
        "embed_url": (
            f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=1"
        ),
    }


class PlayerServer(ThreadingHTTPServer):
    def __init__(self, address, handler, *, data_dir, app_title, max_history):
        super().__init__(address, handler)
        self.data_dir = Path(data_dir)
        self.app_title = app_title
        self.max_history = max_history
        self.history_lock = threading.Lock()

    @property
    def history_path(self):
        return self.data_dir / "history.json"

    def load_history(self):
        with self.history_lock:
            if not self.history_path.exists():
                return []
            try:
                value = json.loads(self.history_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return []
            return value if isinstance(value, list) else []

    def add_history(self, target):
        with self.history_lock:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            history = []
            if self.history_path.exists():
                try:
                    value = json.loads(self.history_path.read_text(encoding="utf-8"))
                    history = value if isinstance(value, list) else []
                except (OSError, json.JSONDecodeError):
                    history = []
            history = [target] + [item for item in history if item != target]
            history = history[: self.max_history]
            temporary_path = self.history_path.with_suffix(".json.tmp")
            temporary_path.write_text(
                json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            temporary_path.replace(self.history_path)


class PlayerHandler(BaseHTTPRequestHandler):
    server: PlayerServer

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/health":
            self.send_json(200, {"status": "ok"})
            return
        if path == "/api/history":
            self.send_json(200, {"items": self.server.load_history()})
            return
        self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        if urlsplit(self.path).path != "/api/history":
            self.send_json(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 4096:
                raise ValueError("invalid_request")
            payload = json.loads(self.rfile.read(length))
            target = normalize_target(payload.get("target"))
        except (AttributeError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error) or "invalid_request"})
            return

        self.server.add_history(target)
        self.send_json(201, target)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, message, *args):
        print(f"{self.address_string()} - {message % args}", flush=True)


def create_server(*, host, port, data_dir, app_title, max_history):
    return PlayerServer(
        (host, port),
        PlayerHandler,
        data_dir=data_dir,
        app_title=app_title,
        max_history=max_history,
    )
