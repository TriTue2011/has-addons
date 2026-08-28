#!/usr/bin/env python3
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class PlayerServer(ThreadingHTTPServer):
    def __init__(self, address, handler, *, data_dir, app_title, max_history):
        super().__init__(address, handler)
        self.data_dir = Path(data_dir)
        self.app_title = app_title
        self.max_history = max_history


class PlayerHandler(BaseHTTPRequestHandler):
    server: PlayerServer

    def do_GET(self):
        if urlsplit(self.path).path == "/api/health":
            self.send_json(200, {"status": "ok"})
            return
        self.send_json(404, {"error": "not_found"})

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
