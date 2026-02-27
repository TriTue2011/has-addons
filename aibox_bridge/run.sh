#!/bin/sh
set -e

CONFIG="/data/options.json"

echo "========================================"
echo "  AI BOX WebSocket Bridge v1.0.0"
echo "========================================"

if [ ! -f "$CONFIG" ]; then
    echo "[WARN] No options.json found, using defaults"
    export LISTEN_HOST="0.0.0.0"
    export WS_PORT="18082"
    export SPK_PORT="18080"
    export TARGET_WS_PORT="8082"
    export TARGET_SPK_PORT="8080"
    export PING_INTERVAL="20"
    export PING_TIMEOUT="20"
    export OPEN_TIMEOUT="10"
    export MAX_SIZE="10485760"
    export ALLOWED_IPS=""
else
    # Read all config from HA add-on options.json using Python
    eval "$(python3 -c "
import json
with open('$CONFIG') as f:
    c = json.load(f)
print('export LISTEN_HOST=\"0.0.0.0\"')
print('export WS_PORT=\"%s\"' % c.get('ws_port', 18082))
print('export SPK_PORT=\"%s\"' % c.get('spk_port', 18080))
print('export TARGET_WS_PORT=\"%s\"' % c.get('target_ws_port', 8082))
print('export TARGET_SPK_PORT=\"%s\"' % c.get('target_spk_port', 8080))
print('export PING_INTERVAL=\"%s\"' % c.get('ping_interval', 20))
print('export PING_TIMEOUT=\"%s\"' % c.get('ping_timeout', 20))
print('export OPEN_TIMEOUT=\"%s\"' % c.get('open_timeout', 10))
print('export MAX_SIZE=\"10485760\"')
ips = c.get('allowed_ips', [])
print('export ALLOWED_IPS=\"%s\"' % ','.join(str(ip).strip() for ip in ips if str(ip).strip()))
")"
fi

echo "  WS  : 0.0.0.0:${WS_PORT}  ->  <ip>:${TARGET_WS_PORT}"
echo "  SPK : 0.0.0.0:${SPK_PORT}  ->  <ip>:${TARGET_SPK_PORT}"
echo "  IPs : ${ALLOWED_IPS:-all allowed}"
echo "========================================"

exec python3 -u /app/bridge.py
