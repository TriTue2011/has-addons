# TriTue YouTube Player

## Chức năng

- Phát video, Shorts và playlist bằng `youtube-nocookie.com`.
- Nhập URL YouTube hoặc video ID 11 ký tự.
- Lưu lịch sử trong `/data`, không mất khi container khởi động lại.
- Giao diện responsive, dùng được qua Home Assistant Ingress.
- Không cần API key hoặc license key.
- API có xác thực để custom integration điều khiển giao diện đang mở.

Đây là ứng dụng clean-room độc lập. Nó không chứa mã nguồn, tài nguyên hoặc cơ
chế cấp phép từ YouTube Pro.

## Chạy bằng Home Assistant

1. Thêm repository `https://github.com/TriTue2011/has-addons` vào App Store.
2. Cài **TriTue YouTube Player**.
3. Khởi động app và chọn **Open Web UI**.

Cổng `8099` mặc định không được công bố ra LAN vì Ingress đã cung cấp giao diện
có xác thực. Chỉ đặt host port trong tab Network khi bạn thực sự cần truy cập
trực tiếp. Giao diện `IP:8099` không có màn hình đăng nhập riêng, vì vậy chỉ nên
mở trong LAN tin cậy và không forward cổng này ra Internet.

### Tùy chọn

| Tùy chọn | Mặc định | Ý nghĩa |
|---|---:|---|
| `app_title` | `TriTue YouTube Player` | Tên hiển thị trên giao diện |
| `max_history` | `20` | Số mục lịch sử, từ 1 đến 100 |
| `integration_token` | để trống | Token bảo mật cho custom integration; để trống thì app tự sinh và lưu trong `/data` |

Token tích hợp xuất hiện trong log khi app khởi động. Nó chỉ dùng để xác thực
kết nối trong hệ thống của bạn và không phải license key. Không đăng token công
khai hoặc đặt nó trong URL.

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
docker pull ghcr.io/tritue2011/youtube-player:0.2.0
docker run -d \
  --name tritue-youtube-player \
  --restart unless-stopped \
  -p 8099:8099 \
  -v tritue-youtube-player-data:/data \
  ghcr.io/tritue2011/youtube-player:0.2.0
```

Xem token tự sinh bằng `docker logs tritue-youtube-player`. Nếu muốn tự đặt
token, thêm `-e INTEGRATION_TOKEN='<chuỗi-ngẫu-nhiên-dài>'` khi chạy container.

## Kết nối custom integration

- App cài từ repository này: URL nội bộ là `http://36f3bad2-youtube-player:8099`.
- App cài trong thư mục local: URL nội bộ là `http://local-youtube-player:8099`.
- Docker ở máy khác: URL là `http://<IP-máy-Docker>:8099`.
- Token: lấy trong log hoặc giá trị `integration_token`/`INTEGRATION_TOKEN` đã đặt.

Chi tiết request và response nằm trong [API.md](API.md).

## Giới hạn của phiên bản 0.2.0

- Chưa tìm kiếm YouTube ngay trong ứng dụng.
- Chưa điều khiển `media_player`, Cast hoặc AirPlay.
- Không resolve, tải xuống hoặc proxy luồng âm thanh/video.
- Việc phát nội dung phụ thuộc khả năng truy cập YouTube của trình duyệt.
- Lệnh từ integration điều khiển trang web player đang mở; phiên bản này chưa
  phát trực tiếp trên loa hoặc TV nếu không có trình duyệt mở.
