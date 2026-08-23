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
# Không còn module native nào cần trình biên dịch: sharp đã gỡ (nó chỉ phục vụ
# một hàm sinh icon PWA không bao giờ chạy vì tệp nguồn không có trong repo).
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 3000

# Supervisor và Docker tự biết tiến trình treo thay vì để nó nằm im.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null || exit 1

ENTRYPOINT ["./entrypoint.sh"]
