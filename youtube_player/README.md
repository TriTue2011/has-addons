# Home Assistant App: TriTue YouTube Player

Trình phát YouTube clean-room cho Docker và Home Assistant. Bản này dùng trình
nhúng chính thức ở chế độ tăng cường riêng tư, không tải xuống hoặc relay nội
dung YouTube và không cần license key của phần mềm khác. API có Bearer token tự
sinh để custom integration kết nối an toàn; đây là thông tin xác thực, không
phải license key. Bản `0.3.0` bổ sung tìm kiếm metadata bài hát không key và
phát từ custom integration tới Google Cast hoặc `media_player` được chọn.

Hỗ trợ `amd64` và `aarch64`.

Xem [DOCS.md](DOCS.md) để cài đặt và [API.md](API.md) để phát triển integration.
