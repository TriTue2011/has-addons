# Integration API v1

API này là hợp đồng clean-room giữa TriTue YouTube Player và custom integration
Home Assistant. Base URL là `http://30fff174-youtube-player:8099` khi cài app
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
  "app_version": "0.2.0",
  "capabilities": ["history", "play", "status", "stop"]
}
```

### `GET /api/integration/status`

Trả về `state` (`idle` hoặc `playing`), mục đang phát và `history_count`.

### `GET /api/integration/history`

Trả về `{ "success": true, "items": [...], "total": 1 }`. Mỗi mục chứa
`kind`, `id` và URL nhúng privacy-enhanced đã chuẩn hóa.

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
- `503 {"error":"integration_not_configured"}`: server được tạo thủ công mà
  không có token; tiến trình Docker/add-on bình thường luôn tự sinh token.
