#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI BOX WebSocket Bridge v3.1 - IP-Based Dynamic Routing
========================================================

  ws://bridge:18082?ip=192.168.1.100  ->  192.168.1.100:8082
  ws://bridge:18080?ip=192.168.1.100  ->  192.168.1.100:8080
"""

import asyncio
import logging
import os
import sys
from urllib.parse import urlparse, parse_qs

try:
    import websockets
    from websockets.exceptions import ConnectionClosed
except ImportError:
    print("ERROR: websockets not installed.", file=sys.stderr)
    sys.exit(1)

WS_VER = tuple(int(x) for x in websockets.__version__.split(".")[:2])

# -- Logging ----------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("aibox-bridge")

# -- Config -----------------------------------------------------------------
LISTEN_HOST     = os.environ.get("LISTEN_HOST",     "0.0.0.0")
WS_PORT         = int(os.environ.get("WS_PORT",         "18082"))
SPK_PORT        = int(os.environ.get("SPK_PORT",        "18080"))
TARGET_WS_PORT  = int(os.environ.get("TARGET_WS_PORT",  "8082"))
TARGET_SPK_PORT = int(os.environ.get("TARGET_SPK_PORT", "8080"))
PING_INTERVAL   = int(os.environ.get("PING_INTERVAL",   "20"))
PING_TIMEOUT    = int(os.environ.get("PING_TIMEOUT",    "20"))
OPEN_TIMEOUT    = int(os.environ.get("OPEN_TIMEOUT",    "10"))
MAX_SIZE        = int(os.environ.get("MAX_SIZE",        str(10 * 1024 * 1024)))

_raw = os.environ.get("ALLOWED_IPS", "").strip()
ALLOWED_IPS = {ip.strip() for ip in _raw.split(",") if ip.strip()} if _raw else set()

log.info("WS  bridge  : %s:%d  ->  <ip>:%d", LISTEN_HOST, WS_PORT, TARGET_WS_PORT)
log.info("SPK bridge  : %s:%d  ->  <ip>:%d", LISTEN_HOST, SPK_PORT, TARGET_SPK_PORT)
log.info("IP whitelist: %s", ALLOWED_IPS if ALLOWED_IPS else "DISABLED (allow all)")
log.info("websockets version: %s", websockets.__version__)


# -- Relay ------------------------------------------------------------------
async def relay(src, dst):
    try:
        async for msg in src:
            await dst.send(msg)
    except ConnectionClosed:
        pass


# -- Handler factory --------------------------------------------------------
def make_handler(target_port, label):

    async def handler(ws):
        # Extract ?ip= param - handle both old and new websockets API
        raw_path = "/"
        if hasattr(ws, "request") and ws.request:
            if hasattr(ws.request, "path"):
                raw_path = ws.request.path
            elif hasattr(ws.request, "url"):
                raw_path = str(ws.request.url)
        elif hasattr(ws, "path"):
            raw_path = ws.path

        parsed = urlparse(raw_path)
        qs = parse_qs(parsed.query)
        ip_list = qs.get("ip", [])

        if not ip_list:
            log.warning("[%s] No ?ip= param, path=%s - rejecting", label, raw_path)
            await ws.close(1008, "Missing ?ip= parameter")
            return

        device_ip = ip_list[0].strip()

        # Validate IP
        parts = device_ip.split(".")
        if len(parts) != 4 or not all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
            log.warning("[%s] Invalid IP: %r - rejecting", label, device_ip)
            await ws.close(1008, "Invalid IP address")
            return

        if ALLOWED_IPS and device_ip not in ALLOWED_IPS:
            log.warning("[%s] IP not whitelisted: %s", label, device_ip)
            await ws.close(1008, "IP not allowed")
            return

        upstream_url = "ws://%s:%d" % (device_ip, target_port)
        addr = ws.remote_address
        log.info("[%s] (+) %s -> %s", label, addr, upstream_url)

        try:
            async with websockets.connect(
                upstream_url,
                ping_interval=PING_INTERVAL,
                ping_timeout=PING_TIMEOUT,
                open_timeout=OPEN_TIMEOUT,
                max_size=MAX_SIZE,
            ) as upstream:
                await asyncio.gather(
                    relay(ws, upstream),
                    relay(upstream, ws),
                    return_exceptions=True,
                )
        except (ConnectionClosed, OSError, asyncio.TimeoutError) as e:
            log.debug("[%s] closed: %s", label, e)
        except Exception as e:
            log.error("[%s] error: %s", label, e)
        finally:
            log.info("[%s] (-) %s  %s  disconnected", label, addr, upstream_url)
            try:
                await ws.close()
            except Exception:
                pass

    return handler


# -- Serve (compatible with websockets 12-15) ------------------------------
def _serve(handler, host, port):
    kwargs = dict(ping_interval=None, max_size=MAX_SIZE)
    if WS_VER >= (14, 0):
        return websockets.serve(handler, host, port, **kwargs)
    else:
        from websockets.server import serve
        return serve(handler, host, port, **kwargs)


# -- Main -------------------------------------------------------------------
async def main():
    ws_h  = make_handler(TARGET_WS_PORT,  "WS ")
    spk_h = make_handler(TARGET_SPK_PORT, "SPK")

    async with _serve(ws_h, LISTEN_HOST, WS_PORT), \
               _serve(spk_h, LISTEN_HOST, SPK_PORT):
        log.info("Bridge ready. Waiting for connections...")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bridge stopped.")
