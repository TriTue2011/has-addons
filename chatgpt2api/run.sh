#!/bin/bash

# Read auth key from HA options (passed as env CHATGPT2API_AUTH_KEY)
# HA Supervisor automatically maps addon options to environment variables

exec uv run uvicorn main:app --host 0.0.0.0 --port 3030
