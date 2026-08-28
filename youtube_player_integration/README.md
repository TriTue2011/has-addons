# TriTue YouTube Player Integration

Custom integration clean-room kết nối Home Assistant với TriTue YouTube Player
`0.2.0` trở lên, chạy dưới dạng Home Assistant App hoặc Docker độc lập.

## Cài thủ công để kiểm thử

1. Sao chép thư mục
   `custom_components/tritue_youtube_player` vào
   `/config/custom_components/tritue_youtube_player` của Home Assistant.
2. Khởi động lại Home Assistant.
3. Vào **Settings → Devices & services → Add integration** và tìm
   **TriTue YouTube Player**.
4. Nhập URL và token bảo mật hiển thị trong log khởi động của player.

## Cài qua HACS

1. Trong HACS, mở **Custom repositories**.
2. Thêm `https://github.com/TriTue2011/has-addons` với loại **Integration**.
3. Tải **TriTue YouTube Player**, rồi khởi động lại Home Assistant.
4. Thêm integration trong **Settings → Devices & services**.

URL mặc định `http://30fff174-youtube-player:8099` dành cho app được cài từ
`https://github.com/TriTue2011/has-addons`. Nếu cài app local, dùng
`http://local-youtube-player:8099`. Nếu chạy Docker, dùng
`http://<IP-máy-Docker>:8099`.

## Sử dụng

Integration tạo một entity `media_player` và một sensor đếm lịch sử. Có thể gửi
video, Shorts, playlist hoặc video ID bằng action chuẩn của Home Assistant:

```yaml
action: media_player.play_media
target:
  entity_id: media_player.tritue_youtube_player_player
data:
  media_content_id: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  media_content_type: video
```

Dùng action `media_player.media_stop` để dừng. Lệnh điều khiển trang web player
đang mở qua Ingress hoặc `IP:8099`; nó chưa phát trực tiếp lên loa/TV.

Component nằm ở `custom_components/tritue_youtube_player` tại gốc repository để
HACS có thể nhận diện, đồng thời contract test bảo đảm nó luôn tương thích với
image/add-on trong cùng thay đổi.
