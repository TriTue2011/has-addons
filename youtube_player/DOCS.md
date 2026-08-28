# TriTue YouTube Player

## Chức năng

- Phát video, Shorts và playlist bằng `youtube-nocookie.com`.
- Nhập URL YouTube hoặc video ID 11 ký tự.
- Lưu lịch sử trong `/data`, không mất khi container khởi động lại.
- Giao diện responsive, dùng được qua Home Assistant Ingress.
- Không cần API key hoặc license key.

Đây là ứng dụng clean-room độc lập. Nó không chứa mã nguồn, tài nguyên hoặc cơ
chế cấp phép từ YouTube Pro.

## Chạy bằng Home Assistant

1. Thêm repository `https://github.com/TriTue2011/has-addons` vào App Store.
2. Cài **TriTue YouTube Player**.
3. Khởi động app và chọn **Open Web UI**.

Cổng `8099` mặc định không được công bố ra LAN vì Ingress đã cung cấp giao diện
có xác thực. Chỉ đặt host port trong tab Network khi bạn thực sự cần truy cập
trực tiếp.

### Tùy chọn

| Tùy chọn | Mặc định | Ý nghĩa |
|---|---:|---|
| `app_title` | `TriTue YouTube Player` | Tên hiển thị trên giao diện |
| `max_history` | `20` | Số mục lịch sử, từ 1 đến 100 |

## Chạy bằng Docker Compose

Từ thư mục `youtube_player`:

```bash
docker compose up -d --build
docker compose logs -f youtube-player
```

Mở `http://<địa-chỉ-máy-Docker>:8099`. Dữ liệu được lưu trong
`youtube_player/data`.

Khi image đã được phát hành lên GHCR, bỏ phần `build` trong Compose nếu chỉ muốn
tải image dựng sẵn:

```bash
docker pull ghcr.io/tritue2011/youtube-player:0.1.0
docker run -d \
  --name tritue-youtube-player \
  --restart unless-stopped \
  -p 8099:8099 \
  -v tritue-youtube-player-data:/data \
  ghcr.io/tritue2011/youtube-player:0.1.0
```

## Giới hạn của phiên bản 0.1.0

- Chưa tìm kiếm YouTube ngay trong ứng dụng.
- Chưa điều khiển `media_player`, Cast hoặc AirPlay.
- Không resolve, tải xuống hoặc proxy luồng âm thanh/video.
- Việc phát nội dung phụ thuộc khả năng truy cập YouTube của trình duyệt.
