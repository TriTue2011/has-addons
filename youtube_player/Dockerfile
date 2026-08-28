ARG BUILD_FROM=python:3.13-alpine3.22
FROM ${BUILD_FROM}

ARG BUILD_VERSION=0.4.0
ARG BUILD_ARCH

LABEL \
    io.hass.type="app" \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.arch="${BUILD_ARCH}" \
    org.opencontainers.image.title="TriTue YouTube Player" \
    org.opencontainers.image.description="A clean-room YouTube and public Zing music source for Home Assistant." \
    org.opencontainers.image.source="https://github.com/TriTue2011/has-addons" \
    org.opencontainers.image.licenses="MIT"

ENV HOST="0.0.0.0" \
    PORT="8099" \
    DATA_DIR="/data" \
    PYTHONDONTWRITEBYTECODE="1" \
    PYTHONUNBUFFERED="1"

WORKDIR /app
RUN pip install --no-cache-dir "yt-dlp==2026.8.19"
COPY app/ /app/

EXPOSE 8099
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

CMD ["python3", "/app/server.py"]
