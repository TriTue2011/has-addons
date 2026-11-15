# Nhật ký thay đổi

## 2026.11.15.4-noui
- **Gọi video/thoại ĐẾN không còn mất tiếng, mất hình khi mã phiên của điện thoại gọi dài 152 ký tự** (trước đây chỉ nhận 154), và `docker logs` có **giờ ở đầu mỗi dòng** (`ZALO_PC_LOG_TS=0` để tắt). Xem [ghi chú phát hành](https://github.com/TriTue2011/Zalo-calling/releases/tag/v2026.11.15.4).

## 2026.11.15.4-noui
- **Gọi đi không còn lỗi «token: missing»** khi mã phiên (sessId) dài 152 ký tự thay vì 154: độ dài token không còn cố định, gói thiết lập theo độ dài thật. Camera Dosen làm mic/loa cho cuộc gọi. Xem [ghi chú phát hành](https://github.com/TriTue2011/Zalo-calling/releases/tag/v2026.11.15.4).

## 2026.11.14.1-noui
- **Add-on mới: Zalo Calling (không giao diện)**: image `ghcr.io/tritue2011/zalo-calling:<phiên bản>-noui`, `username`/`password` bắt buộc, cấu hình bằng tuỳ chọn add-on và dịch vụ `zalo_call.*`.
