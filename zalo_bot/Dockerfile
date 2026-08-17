FROM node:20-alpine

WORKDIR /app

# jq: entrypoint.sh đọc /data/options.json để lấy data_directory.
RUN apk add --no-cache jq

COPY package.json package-lock.json ./

# npm ci (KHÔNG phải npm install): cài đúng theo package-lock nên mỗi lần build
# ra cùng một cây phụ thuộc. Bản cũ chạy `npm install && npm install
# zca-js@latest` — vừa bỏ qua lock, vừa kéo zca-js mới nhất tại thời điểm build,
# nên hai lần build cùng một commit có thể cho hai kết quả khác nhau và một bản
# zca-js hỏng ở thượng nguồn là vào thẳng image.
#
# Trình biên dịch chỉ cần lúc dựng module native (sharp), gỡ ngay sau đó để
# không nằm lại trong image chạy thật.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev --no-audit --no-fund \
    && apk del .build-deps

COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
