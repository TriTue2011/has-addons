#!/bin/bash

# HA addon passes config options as JSON to /data/options.json
# Map auth_key → CHATGPT2API_AUTH_KEY for the app
if [ -f /data/options.json ]; then
    if command -v jq &> /dev/null; then
        export CHATGPT2API_AUTH_KEY=$(jq -r '.auth_key // empty' /data/options.json)
    else
        export CHATGPT2API_AUTH_KEY=$(python3 -c "import json; print(json.load(open('/data/options.json')).get('auth_key',''))")
    fi
    echo "[addon] Auth key loaded: ${CHATGPT2API_AUTH_KEY:0:6}..."
fi

cd /app
exec uv run uvicorn main:app --host 0.0.0.0 --port 3030
