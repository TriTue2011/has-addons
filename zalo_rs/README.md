# 🏠 Ralo — Add-on Home Assistant (Zalo viết bằng Rust)

Add-on chạy gateway **zalo-rs** (viết bằng Rust) để cung cấp API HTTP/SSE và giao diện web nhúng cho tích hợp Home Assistant.

> **Khác với `tele-rust` (kho công khai, kéo ảnh chạy thẳng không cần token):** kho **`Ralo` là kho RIÊNG TƯ (private)**. Add-on dùng ảnh khởi động ("loader") công khai `ghcr.io/tritue2011/zalo-rs-loader` **không chứa mã** và bắt buộc cấu hình **`github_token`** (chỉ đọc kho `TriTue2011/Ralo`) ở lần chạy đầu để tải **nhị phân đã dựng sẵn** (tệp `zalo-rs-linux-<amd64|arm64>.tar.gz` của bản phát hành) về lưu trong `/data/loader` (giống mô hình `zalo_calling`). **Sau lần đầu, token hết hạn add-on vẫn chạy bình thường** bằng bản đã lưu, chỉ không cập nhật được cho tới khi dán token mới.

> **Cảnh báo:** Đây là **dự án không chính thức, không liên kết, không được tài trợ hay xác nhận bởi Zalo / VNG**. Người dùng tự chịu trách nhiệm khi triển khai, cấu hình và vận hành với tài khoản của mình.

## Cài song song Zalo Calling — không đè nhau

- Slug riêng `zalo_rs`, thư mục dữ liệu riêng; **cổng máy chủ mặc định 8096** (Zalo Calling giữ 8080). Hai add-on chạy cùng lúc được.
- Dùng **hai tài khoản Zalo khác nhau** cho hai add-on: cùng một tài khoản đăng nhập ở hai nơi thì Zalo đẩy phiên cũ ra.

## Mở giao diện

- **Tab ở thanh bên Home Assistant** (Ingress): bật **Hiện trong thanh bên** ở tab *Thông tin* → mục **Ralo** — không cần mở cổng hay dựng proxy.
- Hoặc nút **Mở Web UI** / `http://<IP-HA>:8096` trong mạng LAN.

## Tính năng chính

- **Mô hình loader công khai + token kho riêng:** Kéo ảnh loader không cần đăng nhập registry trên Home Assistant; tải từ kho riêng bằng `github_token` và ghim được phiên bản qua `app_version` (để trống = bản đóng gói theo add-on, `latest` = bản phát hành mới nhất).
- Xác thực cookie `HttpOnly`, hỗ trợ mật khẩu băm PBKDF2-SHA256, tự sinh mật khẩu lần đầu (lưu tại `/data/state/THONG-TIN-DANG-NHAP.txt`) và mã PIN riêng tư.
- Quản lý phiên Zalo (đăng nhập QR, đa tài khoản trong cùng tiến trình).
- Nhận tin nhắn thời gian thực qua WebSocket và long-poll, lưu SQLite cục bộ, phát SSE và đẩy webhook về Home Assistant.
- Hỗ trợ gửi tin nhắn, tệp, tin thoại (chuyển mã AAC bằng FFmpeg) và gọi thoại/video 1-1 (Opus, SRTP).
- Hỗ trợ cả hai chế độ **có giao diện web** (`ui: true`) và **không giao diện web** (`ui: false`, tương đương `ZALO_PC_UI=0`) trong một add-on duy nhất.

## Yêu cầu trước khi khởi chạy

1. **Bắt buộc có `github_token`** (từ 20 ký tự, quyền chỉ đọc `Contents: Read-only` trên kho riêng `TriTue2011/Ralo`) cho lần khởi chạy đầu tiên.
2. Tài khoản đăng nhập ứng dụng (`app_user` / `app_password` / `app_password_hash`): nếu bỏ trống mật khẩu, add-on tự sinh mật khẩu ngẫu nhiên ở lần đầu, in vào Nhật ký và giữ cố định tại `THONG-TIN-DANG-NHAP.txt`.

Xem hướng dẫn tạo token, cài đặt và bảng cấu hình chi tiết trong [DOCS.md](DOCS.md).
