# ✈️ Tele Rust

Gateway **Telegram** (tài khoản người dùng) cho Home Assistant: nhắn tin, gọi thoại/video P2P, đẩy sự kiện về HA, kèm giao diện web riêng ở cổng `3334`.

> App không chính thức, không liên kết, không được Telegram tài trợ hay xác nhận. Người dùng tự chịu trách nhiệm khi triển khai và sử dụng với tài khoản của mình.

- **Kho tele-rust CÔNG KHAI, không cần token GitHub:** ảnh `ghcr.io/tritue2011/tele-rust` dựng sẵn mã nguồn, đa kiến trúc (`amd64` + `aarch64`) — khác với Zalo Calling (kho riêng, cần `github_token`).
- **Không có tab ở thanh bên Home Assistant:** gateway tự đặt chính sách bảo mật `Content-Security-Policy: frame-ancestors 'none'` (chặn nhúng iframe) nên KHÔNG bật được Ingress — mở giao diện web trực tiếp qua cổng `3334` (nút **Mở Web UI** hoặc reverse proxy HTTPS riêng).
- **Phiên bản add-on luôn bằng bản phát hành mới nhất của kho tele-rust:** mỗi khi có bản phát hành mới VÀ ảnh đã đủ `amd64` + `arm64`, kho này tự nâng `version` (workflow `auto-bump`, không cần token vì kho công khai).
- **Hướng dẫn cấu hình từng tuỳ chọn:** [DOCS.md](DOCS.md)
- **Tài liệu đầy đủ** (tính năng, kiến trúc, cách build, cách gọi API): [README của kho tele-rust](https://github.com/TriTue2011/tele-rust#readme)
- **Chạy bằng Docker / Docker Compose** thay vì add-on (máy không chạy Home Assistant Supervisor): [docs/TRIEN-KHAI.md của kho tele-rust](https://github.com/TriTue2011/tele-rust/blob/main/docs/TRIEN-KHAI.md#2-triển-khai-bằng-docker--docker-compose)
