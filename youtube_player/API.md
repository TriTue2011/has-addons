# Integration API v1

API này là hợp đồng clean-room giữa TriTue YouTube Player và custom integration
Home Assistant. Base URL là `http://36f3bad2-youtube-player:8099` khi cài app
từ repository này, hoặc `http://<host>:8099` khi chạy Docker.

## Xác thực

Mọi endpoint `/api/integration/*` yêu cầu header:

```http
Authorization: Bearer <integration-token>
```

Nếu không cấu hình token, server tự sinh một token, lưu tại
`/data/integration_token` và in ra log khởi động. Token là thông tin xác thực
cục bộ, không phải API key của YouTube hoặc license key.

## Endpoints

### `GET /api/integration/health`

Kiểm tra xác thực, phiên bản API và capability. Response thành công:

```json
{
  "success": true,
  "status": "ok",
  "api_version": "1",
  "app_version": "0.3.0",
  "capabilities": ["history", "play", "search", "status", "stop"]
}
```

### `GET /api/integration/status`

Trả về `state` (`idle` hoặc `playing`), mục đang phát và `history_count`.

### `GET /api/integration/history`

Trả về `{ "success": true, "items": [...], "total": 1 }`. Mỗi mục chứa
`kind`, `id` và URL nhúng privacy-enhanced đã chuẩn hóa.

### `GET /api/integration/search?q=QUERY&limit=20`

Tìm tối đa 30 kết quả bài hát và trả metadata gồm `id`, `url`, `title`,
`channel`, `duration` và `thumbnail`. Endpoint dùng `yt-dlp` ở chế độ
`--flat-playlist --skip-download`: không cần YouTube Data API key, không tải
hoặc relay nội dung media. Vì đây là nguồn metadata không chính thức, thay đổi
từ YouTube có thể tạm thời làm tìm kiếm gián đoạn.

### `POST /api/integration/play`

```json
{"target": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
```

`target` nhận URL video, Shorts, playlist hoặc video ID 11 ký tự. Trang web
player đang mở nhận lệnh trong tối đa khoảng hai giây.

### `POST /api/integration/stop`

Dừng và xóa nội dung khỏi trang web player đang mở. Request không cần body.

## Lỗi ổn định

- `400 {"error":"invalid_request"}`: JSON/body không hợp lệ.
- `400 {"error":"invalid_youtube_target"}`: URL hoặc ID không được hỗ trợ.
- `401 {"error":"invalid_auth"}`: thiếu hoặc sai Bearer token.
- `502 {"error":"search_unavailable"}`: nguồn metadata tìm kiếm tạm lỗi.
- `503 {"error":"integration_not_configured"}`: server được tạo thủ công mà
  không có token; tiến trình Docker/add-on bình thường luôn tự sinh token.
