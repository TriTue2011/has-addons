# Nhật ký thay đổi

## 2026.11.19.1
- **Add-on cần token GitHub ở lần chạy đầu**: image đổi sang `zalobot-loader` (công khai, không chứa mã); thêm tuỳ chọn `github_token` (bắt buộc) và `app_version`. Mã máy chủ Zalo Bot được tải từ kho riêng `zalo_bot`; **sau lần đầu, token hết hạn vẫn chạy bản đã lưu** (chỉ không cập nhật được). Số phiên bản add-on luôn tự nâng cho bằng image mới nhất. Mã máy chủ đã chuyển khỏi kho này sang `zalo_bot/server`. Hướng dẫn cài từ đầu: HUONG-DAN-CAI-DAT.md.
