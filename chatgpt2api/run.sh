#!/bin/bash

# Persistent data directory (survives addon rebuilds)
DATA_DIR="/data/chatgpt2api"
mkdir -p "$DATA_DIR"
ln -sfn "$DATA_DIR" /app/data 2>/dev/null || true

# HA addon passes config options as JSON to /data/options.json
if [ -f /data/options.json ]; then
    if command -v jq &> /dev/null; then
        export CHATGPT2API_AUTH_KEY=$(jq -r '.auth_key // empty' /data/options.json)
        export CHATGPT2API_BASE_URL=$(jq -r '.base_url // empty' /data/options.json)
    else
        export CHATGPT2API_AUTH_KEY=$(python3 -c "import json; d=json.load(open('/data/options.json')); print(d.get('auth_key',''))")
        export CHATGPT2API_BASE_URL=$(python3 -c "import json; d=json.load(open('/data/options.json')); print(d.get('base_url',''))")
    fi
    echo "[addon] Auth key loaded: ${CHATGPT2API_AUTH_KEY:0:6}..."
    [ -n "$CHATGPT2API_BASE_URL" ] && echo "[addon] Base URL: $CHATGPT2API_BASE_URL"
fi

cd /app
exec uv run uvicorn main:app --host 0.0.0.0 --port 3030
