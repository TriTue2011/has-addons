#!/bin/bash
set -euo pipefail

# Persistent data directory (HA addon /data is auto-mounted and survives rebuilds)
PERSISTENT_DATA="/data/chatgpt2api"
APP_DATA="/app/data"

# link_dir: symlink $target → $source, handling first-run and rebuild correctly
link_dir() {
    local source="$1"
    local target="$2"

    mkdir -p "$source"

    if [ -d "$target" ] && [ ! -L "$target" ]; then
        # Target is a real directory (fresh container)
        if [ -z "$(ls -A "$source" 2>/dev/null)" ]; then
            # First run: seed persistent storage with defaults from image
            echo "[addon] First run: seeding $source from $target"
            cp -a "$target"/. "$source"/ 2>/dev/null || true
        fi
        # Remove container directory and replace with symlink
        rm -rf "$target"
    elif [ -e "$target" ]; then
        # Exists but not a real directory (symlink or file) — remove
        rm -rf "$target"
    fi

    ln -sfn "$source" "$target"
    echo "[addon] Linked: $target -> $source"
}

link_dir "$PERSISTENT_DATA" "$APP_DATA"

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
