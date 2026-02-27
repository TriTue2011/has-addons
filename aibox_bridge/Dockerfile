ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache python3 py3-pip \
    && pip3 install --no-cache-dir --break-system-packages 'websockets>=12.0'

COPY bridge.py /app/bridge.py
COPY run.sh /app/run.sh
RUN chmod +x /app/run.sh

WORKDIR /app
CMD ["/app/run.sh"]
