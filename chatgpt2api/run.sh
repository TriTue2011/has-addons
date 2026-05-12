#!/bin/bash
cd /app
exec uv run uvicorn main:app --host 0.0.0.0 --port 3030
