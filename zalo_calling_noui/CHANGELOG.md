# Nhật ký thay đổi

## 2026.11.15.2-noui
- **Gọi đi không còn lỗi «token: missing»** khi mã phiên (sessId) dài 152 ký tự thay vì 154: độ dài token không còn cố định, gói thiết lập theo độ dài thật. Camera Dosen làm mic/loa cho cuộc gọi. Xem [ghi chú phát hành](https://github.com/TriTue2011/Zalo-calling/releases/tag/v2026.11.15.2).

## 2026.11.14.1-noui
- **Add-on mới: Zalo Calling (không giao diện)**: image `ghcr.io/tritue2011/zalo-calling:<phiên bản>-noui`, `username`/`password` bắt buộc, cấu hình bằng tuỳ chọn add-on và dịch vụ `zalo_call.*`.
