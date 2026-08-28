# TriTue YouTube Player Integration

Custom integration clean-room kết nối Home Assistant với TriTue YouTube Player
`0.3.0` trở lên, chạy dưới dạng Home Assistant App hoặc Docker độc lập.

## Cài thủ công để kiểm thử

1. Sao chép thư mục
   `custom_components/tritue_youtube_player` vào
   `/config/custom_components/tritue_youtube_player` của Home Assistant.
2. Khởi động lại Home Assistant.
3. Vào **Settings → Devices & services → Add integration** và tìm
   **TriTue YouTube Player**.
4. Nhập URL và token bảo mật hiển thị trong log khởi động của player.

## Cài qua HACS

HACS không hỗ trợ private GitHub repository. Các bước dưới đây dùng được sau khi
repository `TriTue2011/has-addons` được chuyển thành **public**:

1. Trong HACS, mở **Custom repositories**.
2. Thêm `https://github.com/TriTue2011/has-addons` với loại **Integration**.
3. Tải **TriTue YouTube Player**, rồi khởi động lại Home Assistant.
4. Thêm integration trong **Settings → Devices & services**.

Khi repository còn private, dùng cách cài thủ công phía trên. CI luôn chạy
Hassfest; HACS validation sẽ tự được bật khi repository trở thành public.

URL mặc định `http://36f3bad2-youtube-player:8099` dành cho app được cài từ
`https://github.com/TriTue2011/has-addons`. Nếu cài app local, dùng
`http://local-youtube-player:8099`. Nếu chạy Docker, dùng
`http://<IP-máy-Docker>:8099`.

## Sử dụng

Integration tạo một entity `media_player` và một sensor đếm lịch sử. Mở
**Settings → Devices & services → TriTue YouTube Player → Configure** để chọn
loa/màn hình `media_player` mặc định. Google Cast dùng trực tiếp ứng dụng
YouTube Cast chính thức; entity thuộc integration khác sẽ nhận URL YouTube và
chỉ phát được nếu entity đó hỗ trợ URL này.

Entity hỗ trợ **Browse media** và **Search media**. Tìm kiếm trả danh sách bài
hát từ YouTube Music để chọn và phát lên thiết bị mặc định, không cần YouTube
Data API key. Có thể gửi video, Shorts, playlist hoặc video ID bằng action chuẩn:

```yaml
action: media_player.play_media
target:
  entity_id: media_player.tritue_youtube_player_player
data:
  media_content_id: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  media_content_type: video
```

Dùng action `media_player.media_stop` để dừng cả trang web player và thiết bị
đích. Nếu không chọn thiết bị mặc định, integration giữ hành vi cũ và chỉ điều
khiển trang web player đang mở qua Ingress hoặc `IP:8099`.

Đối với Google Cast, playlist phải là URL `watch` có cả video bắt đầu và ID
playlist, ví dụ `https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID`.
Ứng dụng YouTube chính thức có thể hiển thị quảng cáo như bình thường.

Trạng thái của entity là **assumed state**: nó phản ánh lệnh phát/dừng gần nhất
mà server đã nhận, không phải telemetry từ video bên trong iframe. Vì vậy entity
có thể vẫn hiện `playing` khi không có trang player nào đang mở hoặc video đã tự
kết thúc. Sensor lịch sử chỉ lưu số đếm để không ghi cả danh sách URL vào
Recorder sau mỗi lần polling; danh sách đầy đủ vẫn có ở API và giao diện player.

Component nằm ở `custom_components/tritue_youtube_player` tại gốc repository để
HACS có thể nhận diện, đồng thời contract test bảo đảm nó luôn tương thích với
image/add-on trong cùng thay đổi.
