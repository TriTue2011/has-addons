# Hướng dẫn cấu hình add-on Tele Rust

## 1. Cài add-on

1. Mở **Cài đặt → Tiện ích bổ sung (Add-ons) → Cửa hàng tiện ích bổ sung**.
2. Chọn biểu tượng ba chấm góc trên bên phải → **Kho lưu trữ (Repositories)** → thêm `https://github.com/TriTue2011/has-addons` (hoặc bấm nút thêm kho ở [README chính](../README.md) nếu chưa có).
3. Tìm **Tele Rust**, nhấn **Cài đặt (Install)** và điền `tg_api_id`, `tg_api_hash`, `gateway_token` (ba tuỳ chọn bắt buộc) trước khi khởi động.
4. Không chạy Home Assistant Supervisor (Docker/Container/Portainer thuần)? Xem mục 3 dưới đây.

> **Kiến trúc & Ingress:** Ảnh đa kiến trúc (`amd64` + `aarch64`). **Không có Ingress / tab thanh bên** — gateway tự đặt `Content-Security-Policy: frame-ancestors 'none'` (chặn nhúng iframe), bắt buộc mở Web UI trực tiếp qua cổng `3334` (nút **Mở Web UI** hoặc reverse proxy HTTPS riêng).

## 2. Bảng tuỳ chọn cấu hình (`options`)

Mỗi tuỳ chọn được ánh xạ sang biến môi trường tương ứng khi khởi động:

| Tuỳ chọn (`config.yaml`) | Biến môi trường | Mặc định | Mô tả |
| --- | --- | --- | --- |
| `tg_api_id` | `TG_API_ID` | `0` (bắt buộc > 0) | Telegram API ID (`api_id`). |
| `tg_api_hash` | `TG_API_HASH` | `""` (bắt buộc) | Telegram API Hash (`api_hash`, ẩn kiểu password). |
| `tg_phone` | `TG_PHONE` | `""` | Số điện thoại tài khoản mặc định (chỉ cần nếu dùng chế độ một tài khoản cũ hoặc CLI `login`). |
| `gateway_token` | `GATEWAY_TOKEN` | `""` (bắt buộc) | Token Bearer cho Home Assistant API và thiết lập tài khoản web lần đầu. |
| `tg_ui_user` | `TG_UI_USER` | `""` | Tên đăng nhập web khởi tạo tự động ở lần chạy đầu (cần đặt cùng `tg_ui_password`). |
| `tg_ui_password` | `TG_UI_PASSWORD` | `""` | Mật khẩu khởi tạo tài khoản web lần đầu (tối thiểu 10 ký tự, không trùng tên đăng nhập). |
| `ui_cookie_secure` | `TGGW_UI_COOKIE_SECURE` | `false` (`0`) | Bật cờ `Secure` cho cookie phiên khi đặt sau reverse proxy HTTPS. |
| `https` | `GATEWAY_HTTPS` | `true` (`1`) | Gateway nhận cả `http://` lẫn `https://` trên CÙNG cổng (HTTPS dùng chứng chỉ tự ký) — cần cho mic/webcam trình duyệt. `false` để tắt. |
| `tls_names` | `GATEWAY_TLS_NAMES` | `""` | Tên/IP thêm vào chứng chỉ HTTPS tự ký, cách nhau bằng dấu phẩy. Đổi giá trị thì xoá thư mục `tls/` trong dữ liệu add-on để sinh lại. |
| `rate_limit_per_minute` | `RATE_LIMIT_PER_MINUTE` | `120` | Giới hạn số yêu cầu API mỗi phút cho mỗi token/phiên. |
| `ha_webhook_url` | `HA_WEBHOOK_URL` | `""` | URL nhận webhook sự kiện gửi về Home Assistant. |
| `ha_webhook_token` | `HA_WEBHOOK_TOKEN` | `""` | Giá trị header `X-Gateway-Token` gửi kèm yêu cầu webhook. |
| `telegram_p2p` | `TELEGRAM_P2P` | `false` (`0`) | Cho phép gọi P2P trực tiếp nếu Telegram cho phép. |
| `video_profile` | `VIDEO_PROFILE` | `"standard"` | Hồ sơ khung hình video gửi đi (`standard` = `640x360@15`, `low` = `480x270@10`). |
| `telegram_rx_video` | `TELEGRAM_RX_VIDEO` | `"640x360@15"` | Độ phân giải/fps video nhận từ bên kia. |
| `tts_voice` | `TTS_VOICE` | `"vi-VN-HoaiMyNeural"` | Giọng mặc định cho `edge-tts`. |
| `tts_rate` | `TTS_RATE` | `"+0%"` | Tốc độ đọc mặc định cho `edge-tts`. |
| `log_level` | `LOG_LEVEL` | `"INFO"` | Mức nhật ký ra `stderr`. |
| `telegram_debug` | `TELEGRAM_DEBUG` | `false` (`0`) | Đặt mức nhật ký mặc định thành `DEBUG` khi không chỉ định `LOG_LEVEL`. |
| `calltrace_keep` / `calltrace_keep_bad` / `calltrace_max_kb` | tương ứng | `3` / `30` / `6144` | Số tệp nhật ký cuộc gọi thành công/lỗi giữ lại, dung lượng tối đa mỗi tệp (KB). |
| `webrtc_log` / `webrtc_log_mb` / `webrtc_log_loc` | tương ứng | `"off"` / `20` / `""` | Ghi nhật ký WebRTC từ NTgCalls, dung lượng xoay vòng (MB), lọc theo biểu thức chính quy. |

## 3. Chạy bằng Docker / Docker Compose (không qua Home Assistant Supervisor)

Container chạy dưới người dùng không đặc quyền UID/GID `10001`. Nếu gắn thư mục máy chủ (bind mount) vào `/data`, cần cấp quyền sở hữu trước:

```bash
mkdir -p ./tele-rust-data
chown 10001:10001 ./tele-rust-data
docker run -d \
  --name tele-rust \
  --restart unless-stopped \
  -p 127.0.0.1:3334:3334 \
  -v "$(pwd)/tele-rust-data:/data" \
  -e TG_API_ID=12345 \
  -e TG_API_HASH='<your-api-hash>' \
  -e GATEWAY_TOKEN='<random-64-hex-token>' \
  ghcr.io/tritue2011/tele-rust:latest
```

`docker-compose.yml`:

```yaml
services:
  tele-rust:
    image: ghcr.io/tritue2011/tele-rust:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3334:3334"
    volumes:
      - tele_rust_data:/data
    environment:
      TG_API_ID: "12345"
      TG_API_HASH: "<your-api-hash>"
      GATEWAY_TOKEN: "<random-64-hex-token>"

volumes:
  tele_rust_data:
```

Chạy bằng Portainer: dán đoạn `docker-compose.yml` trên vào **Stacks → Add stack**, đổi `TG_API_ID`/`TG_API_HASH`/`GATEWAY_TOKEN` rồi **Deploy**.

## 4. Lưu ý bảo mật và dữ liệu

- **Reverse proxy HTTPS:** Bật `ui_cookie_secure: true` khi đặt sau Nginx/Caddy/Cloudflare Tunnel để trình duyệt chỉ gửi cookie phiên qua HTTPS. Không công bố cổng `3334` trực tiếp ra Internet.
- **Đặt lại mật khẩu web:** quên mật khẩu quản trị web thì chạy `docker exec -it <container> /usr/local/bin/tggw passwd` để đổi mật khẩu và thu hồi toàn bộ phiên cũ.
- **Giấy phép:** Dự án theo giấy phép MIT; ảnh Docker chứa NTgCalls `3.0.7` (LGPL-3.0, kèm hướng dẫn liên kết lại tại `/licenses/NOTICE.md`) và TDLib `1.8.69` (BSL-1.0).
- Chi tiết tính năng, kiến trúc, cách build: [README của kho tele-rust](https://github.com/TriTue2011/tele-rust#readme).
