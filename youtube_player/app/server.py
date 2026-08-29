import hmac
import json
import os
import re
import secrets
import shutil
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

from search import SearchUnavailableError, search_youtube, search_zing
from streaming import (
    InvalidStreamTokenError,
    StreamUnavailableError,
    build_signed_stream_url,
    normalize_public_base_url,
    resolve_zing_stream,
    validate_zing_target,
    verify_stream_token,
)

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
PLAYLIST_ID = re.compile(r"^[A-Za-z0-9_-]{10,80}$")
YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}
STATIC_DIR = Path(__file__).with_name("static")
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/favicon.svg": ("favicon.svg", "image/svg+xml"),
}
APP_VERSION = "0.4.1"
API_VERSION = "1"


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
            query = parse_qs(parsed.query)
            video_id = query.get("v", [""])[0]
            playlist_id = query.get("list", [""])[0]
        elif parsed.path.startswith(("/shorts/", "/embed/")):
            video_id = parsed.path.rstrip("/").rsplit("/", 1)[-1]
        elif parsed.path == "/playlist":
            playlist_id = parse_qs(parsed.query).get("list", [""])[0]

    if VIDEO_ID.fullmatch(video_id or ""):
        target = {
            "kind": "video",
            "id": video_id,
            "embed_url": (
                f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=1"
            ),
        }
        if PLAYLIST_ID.fullmatch(playlist_id or ""):
            target["playlist_id"] = playlist_id
            target["embed_url"] = (
                f"https://www.youtube-nocookie.com/embed/{video_id}"
                f"?list={playlist_id}&autoplay=1"
            )
        return target

    if PLAYLIST_ID.fullmatch(playlist_id or ""):
        return {
            "kind": "playlist",
            "id": playlist_id,
            "embed_url": (
                "https://www.youtube-nocookie.com/embed/videoseries"
                f"?list={playlist_id}&autoplay=1"
            ),
        }

    raise ValueError("invalid_youtube_target")


class PlayerServer(ThreadingHTTPServer):
    def __init__(
        self,
        address,
        handler,
        *,
        data_dir,
        app_title,
        max_history,
        integration_token,
        public_base_url="",
    ):
        super().__init__(address, handler)
        self.data_dir = Path(data_dir)
        self.app_title = app_title
        self.max_history = max_history
        self.integration_token = integration_token
        self.public_base_url = (
            normalize_public_base_url(public_base_url) if public_base_url else ""
        )
        self.history_lock = threading.Lock()
        self.player_lock = threading.Lock()
        self.search_lock = threading.Lock()
        self.zing_result_lock = threading.Lock()
        self.stream_lock = threading.Lock()
        self.zing_result_cache = {}
        self.stream_cache = {}
        self.current_item = None

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

    def clear_history(self):
        with self.history_lock:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            temporary_path = self.history_path.with_suffix(".json.tmp")
            temporary_path.write_text("[]\n", encoding="utf-8")
            temporary_path.replace(self.history_path)

    def get_player(self):
        with self.player_lock:
            item = dict(self.current_item) if self.current_item else None
        return {"state": "playing" if item else "idle", "item": item}

    def play(self, target):
        self.add_history(target)
        with self.player_lock:
            self.current_item = dict(target)

    def stop(self):
        with self.player_lock:
            self.current_item = None

    def search(self, source, query, limit):
        """Run one metadata search at a time to bound child processes."""
        with self.search_lock:
            if source == "youtube":
                return search_youtube(query, limit=limit)
            if source == "zing":
                results = search_zing(query, limit=limit)
                self.remember_public_zing_results(results)
                return results
            raise ValueError("invalid_search_source")

    def remember_public_zing_results(self, results, *, ttl=3600):
        """Temporarily authorize Zing URLs that passed public search filters."""
        now = time.monotonic()
        with self.zing_result_lock:
            self.zing_result_cache = {
                url: expiry
                for url, expiry in self.zing_result_cache.items()
                if expiry > now
            }
            for item in results:
                if (
                    not isinstance(item, dict)
                    or item.get("source") != "zing"
                    or item.get("kind") != "song"
                ):
                    continue
                try:
                    target_url = validate_zing_target(item.get("url"))
                except ValueError:
                    continue
                self.zing_result_cache[target_url] = now + int(ttl)

    def require_public_zing_result(self, target_url):
        """Accept only a Zing URL recently returned by public search."""
        target_url = validate_zing_target(target_url)
        now = time.monotonic()
        with self.zing_result_lock:
            expiry = self.zing_result_cache.get(target_url, 0)
            if expiry <= now:
                self.zing_result_cache.pop(target_url, None)
                raise ValueError("unverified_zing_target")
        return target_url

    def create_stream_url(self, target_url):
        """Create a signed LAN URL a speaker can fetch without HA credentials."""
        if not self.public_base_url:
            raise ValueError("public_base_url_required")
        return build_signed_stream_url(
            self.public_base_url,
            target_url,
            self.integration_token,
            ttl=3600,
        )

    def prepare_stream(self, target_url):
        """Resolve and briefly cache one stream before giving it to a speaker."""
        target_url = self.require_public_zing_result(target_url)
        return self._resolve_stream(target_url)

    def _resolve_stream(self, target_url):
        """Resolve and briefly cache one already validated Zing stream."""
        with self.stream_lock:
            cached = self.stream_cache.get(target_url)
            if cached and cached[0] >= time.monotonic():
                return dict(cached[1])
            resolved = resolve_zing_stream(target_url)
            self.stream_cache[target_url] = (time.monotonic() + 120, dict(resolved))
            return resolved

    def resolve_stream(self, target_url):
        """Return the prepared stream, resolving again after cache expiry."""
        return self._resolve_stream(validate_zing_target(target_url))


class PlayerHandler(BaseHTTPRequestHandler):
    server: PlayerServer

    def do_GET(self):
        request_url = urlsplit(self.path)
        path = request_url.path
        if path == "/api/health":
            self.send_json(200, {"status": "ok"})
            return
        if path == "/api/history":
            self.send_json(200, {"items": self.server.load_history()})
            return
        if path == "/api/player":
            self.send_json(200, self.server.get_player())
            return
        if path == "/api/config":
            self.send_json(
                200,
                {
                    "app_title": self.server.app_title,
                    "max_history": self.server.max_history,
                    "sources": ["youtube", "zing"],
                },
            )
            return
        if path.startswith("/api/stream/"):
            self.proxy_stream(path.removeprefix("/api/stream/"))
            return
        if path.startswith("/api/integration/") and not self.authorize_integration():
            return
        if path == "/api/integration/health":
            self.send_json(
                200,
                {
                    "success": True,
                    "status": "ok",
                    "api_version": API_VERSION,
                    "app_version": APP_VERSION,
                    "capabilities": [
                        "history",
                        "play",
                        "search",
                        "status",
                        "stop",
                        "zing_stream",
                    ],
                    "sources": ["youtube", "zing"],
                },
            )
            return
        if path == "/api/integration/search":
            query_values = parse_qs(request_url.query)
            query = str(query_values.get("q", [""])[0]).strip()
            source = str(query_values.get("source", ["youtube"])[0]).strip().lower()
            try:
                limit = int(query_values.get("limit", ["20"])[0])
                if not 1 <= len(query) <= 120 or not 1 <= limit <= 30:
                    raise ValueError
                items = self.server.search(source, query, limit)
            except ValueError as error:
                error_code = (
                    "invalid_search_source"
                    if str(error) == "invalid_search_source"
                    else "invalid_search_query"
                )
                self.send_json(400, {"error": error_code})
                return
            except SearchUnavailableError:
                self.send_json(502, {"error": "search_unavailable"})
                return
            self.send_json(
                200,
                {
                    "success": True,
                    "source": source,
                    "items": items,
                    "total": len(items),
                },
            )
            return
        if path == "/api/integration/status":
            player = self.server.get_player()
            self.send_json(
                200,
                {
                    "success": True,
                    "api_version": API_VERSION,
                    "app_version": APP_VERSION,
                    "state": player["state"],
                    "item": player["item"],
                    "history_count": len(self.server.load_history()),
                },
            )
            return
        if path == "/api/integration/history":
            items = self.server.load_history()
            self.send_json(200, {"success": True, "items": items, "total": len(items)})
            return
        if path in STATIC_FILES:
            filename, content_type = STATIC_FILES[path]
            self.send_file(STATIC_DIR / filename, content_type)
            return
        self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        path = urlsplit(self.path).path
        if path.startswith("/api/integration/") and not self.authorize_integration():
            return
        if path == "/api/integration/stop":
            self.server.stop()
            self.send_json(200, {"success": True, "state": "idle"})
            return
        if path == "/api/integration/stream":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > 4096:
                    raise ValueError("invalid_request")
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError("invalid_request")
                if payload.get("source") != "zing":
                    raise ValueError("unsupported_stream_source")
                target_url = payload.get("target")
                resolved = self.server.prepare_stream(target_url)
                stream_url = self.server.create_stream_url(target_url)
            except StreamUnavailableError:
                self.send_json(502, {"error": "stream_unavailable"})
                return
            except ValueError as error:
                error_code = str(error)
                if error_code == "public_base_url_required":
                    self.send_json(409, {"error": error_code})
                    return
                if error_code == "unverified_zing_target":
                    self.send_json(403, {"error": error_code})
                    return
                if error_code not in {
                    "invalid_request",
                    "invalid_zing_target",
                    "unsupported_stream_source",
                }:
                    error_code = "invalid_request"
                self.send_json(400, {"error": error_code})
                return
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.send_json(400, {"error": "invalid_request"})
                return
            self.send_json(
                200,
                {
                    "success": True,
                    "source": "zing",
                    "stream_url": stream_url,
                    "media_content_type": resolved.get("content_type", "audio/mpeg"),
                    "expires_in": 3600,
                },
            )
            return
        if path not in {"/api/history", "/api/integration/play"}:
            self.send_json(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 4096:
                raise ValueError("invalid_request")
            payload = json.loads(self.rfile.read(length))
            target = normalize_target(payload.get("target"))
        except ValueError as error:
            error_code = str(error)
            if error_code not in {"invalid_request", "invalid_youtube_target"}:
                error_code = "invalid_request"
            self.send_json(400, {"error": error_code})
            return
        except (AttributeError, json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "invalid_request"})
            return

        self.server.play(target)
        if path == "/api/integration/play":
            self.send_json(200, {"success": True, "item": target})
        else:
            self.send_json(201, target)

    def do_DELETE(self):
        if urlsplit(self.path).path != "/api/history":
            self.send_json(404, {"error": "not_found"})
            return
        self.server.clear_history()
        self.send_json(200, {"items": []})

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, body, "application/json; charset=utf-8")

    def proxy_stream(self, token):
        """Resolve and relay a signed public Zing audio request to a speaker."""
        if not token or len(token) > 4096:
            self.send_json(403, {"error": "invalid_stream_token"})
            return
        response_started = False
        try:
            target_url = verify_stream_token(token, self.server.integration_token)
            resolved = self.server.resolve_stream(target_url)
            headers = {**resolved["headers"], "Accept-Encoding": "identity"}
            if range_header := self.headers.get("Range"):
                if not re.fullmatch(r"bytes=\d*-\d*", range_header):
                    self.send_json(400, {"error": "invalid_range"})
                    return
                headers["Range"] = range_header
            request = Request(resolved["url"], headers=headers)
            with urlopen(request, timeout=30) as response:
                self.send_response(response.getcode() or 200)
                self.send_header(
                    "Content-Type",
                    response.headers.get(
                        "Content-Type", resolved.get("content_type", "audio/mpeg")
                    ),
                )
                for header in ("Content-Length", "Content-Range", "Accept-Ranges"):
                    if value := response.headers.get(header):
                        self.send_header(header, value)
                self.send_header("Cache-Control", "private, no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                response_started = True
                shutil.copyfileobj(response, self.wfile, length=64 * 1024)
        except InvalidStreamTokenError:
            self.send_json(403, {"error": "invalid_stream_token"})
        except (BrokenPipeError, ConnectionResetError):
            return
        except (StreamUnavailableError, OSError):
            if not response_started:
                self.send_json(502, {"error": "stream_unavailable"})

    def authorize_integration(self):
        token = self.server.integration_token
        if not token:
            self.send_json(503, {"error": "integration_not_configured"})
            return False
        provided = self.headers.get("Authorization", "")
        if not hmac.compare_digest(provided, f"Bearer {token}"):
            self.send_json(401, {"error": "invalid_auth"})
            return False
        return True

    def send_file(self, path, content_type):
        try:
            body = path.read_bytes()
        except OSError:
            self.send_json(500, {"error": "asset_unavailable"})
            return
        self.send_bytes(200, body, content_type)

    def send_bytes(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; frame-src https://www.youtube-nocookie.com; "
            "connect-src 'self'; img-src 'self' data:; style-src 'self'; "
            "script-src 'self'",
        )
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, message, *args):
        print(f"{self.address_string()} - {message % args}", flush=True)


def create_server(
    *,
    host,
    port,
    data_dir,
    app_title,
    max_history,
    integration_token="",
    public_base_url="",
):
    return PlayerServer(
        (host, port),
        PlayerHandler,
        data_dir=data_dir,
        app_title=app_title,
        max_history=max_history,
        integration_token=integration_token,
        public_base_url=public_base_url,
    )


def read_options(data_dir):
    path = Path(data_dir) / "options.json"
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def bounded_integer(value, default, minimum, maximum):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if minimum <= parsed <= maximum else default


def resolve_integration_token(data_dir, configured_token):
    token = str(configured_token or "").strip()
    if token:
        return token

    data_path = Path(data_dir)
    token_path = data_path / "integration_token"
    try:
        stored_token = token_path.read_text(encoding="utf-8").strip()
    except OSError:
        stored_token = ""
    if stored_token:
        return stored_token

    data_path.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(32)
    temporary_path = token_path.with_suffix(".tmp")
    temporary_path.write_text(token, encoding="utf-8")
    temporary_path.chmod(0o600)
    temporary_path.replace(token_path)
    return token


def main():
    data_dir = Path(os.environ.get("DATA_DIR", "/data"))
    options = read_options(data_dir)
    host = os.environ.get("HOST", "0.0.0.0")
    port = bounded_integer(os.environ.get("PORT"), 8099, 1, 65535)
    app_title = os.environ.get("APP_TITLE") or options.get(
        "app_title", "TriTue YouTube Player"
    )
    max_history = bounded_integer(
        os.environ.get("MAX_HISTORY", options.get("max_history")), 20, 1, 100
    )
    integration_token = resolve_integration_token(
        data_dir,
        os.environ.get("INTEGRATION_TOKEN") or options.get("integration_token", ""),
    )
    public_base_url = os.environ.get("PUBLIC_BASE_URL") or options.get(
        "public_base_url", ""
    )
    server = create_server(
        host=host,
        port=port,
        data_dir=data_dir,
        app_title=str(app_title),
        max_history=max_history,
        integration_token=str(integration_token),
        public_base_url=str(public_base_url),
    )

    def request_shutdown(_signal_number, _frame):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)
    print(f"TriTue YouTube Player listening on {host}:{port}", flush=True)
    print(
        "Integration API token (security credential, not a license key): "
        f"{integration_token}",
        flush=True,
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
