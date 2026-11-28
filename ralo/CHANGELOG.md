## 0.2.9
- Tự động nâng cho bằng image mới nhất đã phát hành (v0.2.9).

## 0.2.8
- Tự động nâng cho bằng image mới nhất đã phát hành (v0.2.8).

# Nhật ký thay đổi — Add-on Ralo

## 0.2.2

- Loader thật (`docker/loader.sh`, image `ghcr.io/tritue2011/zalo-rs-loader`): tải nhị phân dựng sẵn `zalo-rs-linux-<arch>.tar.gz`
  từ bản phát hành của kho riêng `TriTue2011/Ralo` bằng `github_token`; token hỏng/hết hạn vẫn chạy bản đã lưu.
- Tab ở thanh bên Home Assistant (Ingress), cổng máy chủ mặc định 8096 — cài song song Zalo Calling không đè nhau.
- Icon mới: chữ «Ralo» (R màu Rust ghép Zalo, chữ «o» là ống nghe).

## 0.1.0

- Khởi tạo add-on Home Assistant cho `zalo-rs` (gateway Zalo viết bằng Rust, hỗ trợ `amd64` và `aarch64`).
- Chuyển sang mô hình kho riêng tư (`private`): dùng ảnh khởi động công khai `ghcr.io/tritue2011/zalo-rs-loader` kết hợp tuỳ chọn `github_token` (`password(20,255)`) để tải bản chạy từ kho riêng ở lần khởi động đầu (token hết hạn vẫn chạy bản đã lưu) và `app_version` (`str?`) để ghim phiên bản.
- Hỗ trợ tự sinh mật khẩu đăng nhập lần đầu (`/data/state/THONG-TIN-DANG-NHAP.txt`), Home Assistant Ingress, watchdog `/api/app/status`, chuyển đổi chế độ giao diện web (`ui: true/false`), WebSocket, webhook và gọi thoại/video 1-1.
