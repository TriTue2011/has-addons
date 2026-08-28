# TriTue YouTube Player Integration

Custom integration clean-room kết nối Home Assistant với TriTue YouTube Player
`0.4.0` trở lên, chạy dưới dạng Home Assistant App hoặc Docker độc lập.

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

Integration tạo một entity `media_player`, một sensor đếm lịch sử, action phát
nhiều loa và card Lovelace. Mở
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

## Card tìm kiếm và chọn nhiều loa

Sau khi integration đã tải, vào **Settings → Dashboards → Resources**, thêm
resource kiểu **JavaScript module**:

```text
/tritue_youtube_player/tritue-youtube-player-card.js
```

Sau đó thêm card thủ công:

```yaml
type: custom:tritue-youtube-player-card
entity: media_player.tritue_youtube_player_player
title: Nhạc trong nhà
# Tuỳ chọn các loa được chọn sẵn:
entities:
  - media_player.phong_khach
  - media_player.phong_bep
```

Card có hai nguồn YouTube/Zing, ô tìm kiếm, danh sách kết quả, chọn nhiều loa,
âm lượng và nút dừng. Action tương ứng có thể gọi trực tiếp trong automation:

```yaml
action: tritue_youtube_player.play_on_players
data:
  entry_id: 01J00000000000000000000000
  source: youtube
  target: dQw4w9WgXcQ
  entity_id:
    - media_player.phong_khach
    - media_player.phong_bep
  volume_level: 0.35
```

YouTube dùng Cast/trình phát chính thức và không relay audio. Với Zing, add-on
chỉ relay bài công khai mà extractor hiện tại giải được, từ chối VIP. Hãy đặt
`public_base_url` trong add-on thành URL LAN `http://IP:8099` mà tất cả loa truy
cập được. Phải chọn bài từ kết quả search của card/API; URL Zing nhập trực tiếp
sẽ bị từ chối. Endpoint web của Zing không có tài liệu chính thức nên có thể
thay đổi.

Trạng thái của entity là **assumed state**: nó phản ánh lệnh phát/dừng gần nhất
mà server đã nhận, không phải telemetry từ video bên trong iframe. Vì vậy entity
có thể vẫn hiện `playing` khi không có trang player nào đang mở hoặc video đã tự
kết thúc. Sensor lịch sử chỉ lưu số đếm để không ghi cả danh sách URL vào
Recorder sau mỗi lần polling; danh sách đầy đủ vẫn có ở API và giao diện player.

Component nằm ở `custom_components/tritue_youtube_player` tại gốc repository để
HACS có thể nhận diện, đồng thời contract test bảo đảm nó luôn tương thích với
image/add-on trong cùng thay đổi.
