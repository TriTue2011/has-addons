# TriTue YouTube Player

## Chức năng

- Phát video, Shorts và playlist bằng `youtube-nocookie.com`.
- Nhập URL YouTube hoặc video ID 11 ký tự.
- Lưu lịch sử trong `/data`, không mất khi container khởi động lại.
- Giao diện responsive, dùng được qua Home Assistant Ingress.
- Không cần API key hoặc license key.
- API có xác thực để custom integration điều khiển giao diện đang mở.
- Tìm kiếm danh sách bài hát bằng metadata-only `yt-dlp`, không cần YouTube
  Data API key và không tải nội dung media.
- Tìm kiếm metadata Zing và relay luồng của bài công khai tới loa bằng URL ký
  hạn dùng. Không hỗ trợ bài VIP hoặc nội dung bị giới hạn quyền.
- Custom card chọn một hoặc nhiều `media_player`, đặt âm lượng, phát và dừng.

Đây là ứng dụng clean-room độc lập. Nó không chứa mã nguồn, tài nguyên hoặc cơ
chế cấp phép từ YouTube Pro.

## Chạy bằng Home Assistant

1. Thêm repository `https://github.com/TriTue2011/has-addons` vào App Store.
2. Cài **TriTue YouTube Player**.
3. Khởi động app và chọn **Open Web UI**.

Repository phải là public để App Store tải trực tiếp. Nếu repository còn
private, hãy dùng bản Docker hoặc cài app local cho tới khi đổi visibility.

Cổng `8099` mặc định không được công bố ra LAN vì Ingress đã cung cấp giao diện
có xác thực. Chỉ đặt host port trong tab Network khi bạn thực sự cần truy cập
trực tiếp. Giao diện `IP:8099` không có màn hình đăng nhập riêng, vì vậy chỉ nên
mở trong LAN tin cậy và không forward cổng này ra Internet.
Ai truy cập được cổng này có thể xem/xóa lịch sử và điều khiển iframe của Web
UI. Bearer token vẫn bảo vệ API integration; Web UI công khai không thể tự gọi
service loa của Home Assistant.

### Tùy chọn

| Tùy chọn | Mặc định | Ý nghĩa |
|---|---:|---|
| `app_title` | `TriTue YouTube Player` | Tên hiển thị trên giao diện |
| `max_history` | `20` | Số mục lịch sử, từ 1 đến 100 |
| `integration_token` | để trống | Token bảo mật cho custom integration; để trống thì app tự sinh và lưu trong `/data` |
| `public_base_url` | để trống | URL LAN dạng `http://IP-máy-chạy-add-on:8099` mà loa truy cập được; bắt buộc để phát Zing |

Token tích hợp xuất hiện trong log khi app khởi động. Nó chỉ dùng để xác thực
kết nối trong hệ thống của bạn và không phải license key. Không đăng token công
khai hoặc đặt nó trong URL.

Để phát Zing, công bố cổng `8099` trong tab **Network** và đặt
`public_base_url` thành địa chỉ LAN thật, ví dụ `http://172.16.10.200:8099`.
Không dùng hostname nội bộ `36f3bad2-youtube-player` ở ô này vì loa không phân
giải được hostname đó. URL phát công khai có chữ ký và tự hết hạn; không mở cổng
8099 ra Internet.

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
docker pull ghcr.io/tritue2011/youtube-player:0.4.1
docker run -d \
  --name tritue-youtube-player \
  --restart unless-stopped \
  -p 8099:8099 \
  -e PUBLIC_BASE_URL='http://IP-máy-Docker:8099' \
  -v tritue-youtube-player-data:/data \
  ghcr.io/tritue2011/youtube-player:0.4.1
```

Xem token tự sinh bằng `docker logs tritue-youtube-player`. Nếu muốn tự đặt
token, thêm `-e INTEGRATION_TOKEN='<chuỗi-ngẫu-nhiên-dài>'` khi chạy container.

## Kết nối custom integration

- App cài từ repository này: URL nội bộ là `http://36f3bad2-youtube-player:8099`.
- App cài trong thư mục local: URL nội bộ là `http://local-youtube-player:8099`.
- Docker ở máy khác: URL là `http://<IP-máy-Docker>:8099`.
- Token: lấy trong log hoặc giá trị `integration_token`/`INTEGRATION_TOKEN` đã đặt.

Chi tiết request và response nằm trong [API.md](API.md).

## Giới hạn của phiên bản 0.4.1

- Không tách hoặc proxy âm thanh YouTube. YouTube chỉ phát qua trang nhúng hoặc
  ứng dụng Cast chính thức.
- Việc phát nội dung phụ thuộc khả năng truy cập YouTube của trình duyệt.
- Search dùng metadata không chính thức nên có thể cần cập nhật `yt-dlp` khi
  YouTube thay đổi giao diện nội bộ.
- Google Cast phát bằng ứng dụng YouTube chính thức và có thể có quảng cáo.
- Search và playback Zing dựa trên endpoint web công khai nhưng không có tài
  liệu chính thức. Resolver theo redirect ID hiện tại và chỉ dùng stream mà
  website trả công khai; bài VIP vẫn bị từ chối và thay đổi phía Zing có thể
  làm bài công khai tạm thời không phát được.
- Luồng Zing chỉ được tạo từ kết quả tìm kiếm công khai trong 60 phút gần nhất;
  URL nhập trực tiếp và metadata thiếu cờ quyền phát bị từ chối.
- Entity không thuộc Google Cast chỉ phát được URL YouTube nếu integration của
  thiết bị đó tự hỗ trợ URL.
- Khi không chọn thiết bị đích, trạng thái `media_player` là trạng thái giả định
  từ lệnh gần nhất, không phải phản hồi thực tế của YouTube iframe.
