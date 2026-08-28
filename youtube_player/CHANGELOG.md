# Changelog

## 0.3.0 - 2026-08-28

### Added

- Tìm kiếm metadata bài hát không cần YouTube Data API key bằng `yt-dlp` ở chế
  độ không tải nội dung.
- Giữ video khởi đầu và playlist ID để Home Assistant có thể phát playlist qua
  ứng dụng YouTube Cast chính thức.

## 0.2.0 - 2026-08-28

### Added

- Bearer API dành cho custom integration: health, status, history, play và stop.
- Token bảo mật tự sinh, bền vững trong `/data` và có thể cấu hình thủ công.
- Đồng bộ lệnh phát/dừng từ integration tới giao diện web đang mở.

### Fixed

- Giao diện màn hình nhỏ không còn tràn ngang và có favicon riêng.

## 0.1.0 - 2026-08-28

### Added

- Giao diện phát video, Shorts và playlist qua YouTube privacy-enhanced embed.
- Lịch sử bền vững trong `/data`, có giới hạn và thao tác xóa.
- Health endpoint cho Docker và Home Assistant watchdog.
- Cấu hình chạy chung bằng Docker Compose hoặc Home Assistant Ingress.
