# 📞 Raling (có giao diện)

Gọi **thoại và video Zalo** từ Home Assistant: điện thoại đổ chuông, nghe máy xong tiếng bên kia ra **loa trong nhà**, mic loa/camera gửi sang điện thoại,
video phát hình từ camera nhà. WebUI hiện ngay ở **thanh bên** của Home Assistant (Ingress), không cần mở cổng.

> App không chính thức, đăng nhập Zalo bằng mã QR. **Dùng tài khoản Zalo phụ.**

- **Cần token GitHub chỉ đọc (lần đầu):** add-on dùng image khởi động công khai `ghcr.io/tritue2011/zalo-calling-loader`, **không chứa mã**; mã Raling ở kho riêng `Raling` và được tải về bằng tuỳ chọn `github_token` ở lần chạy đầu (tài khoản phải được chủ kho mời). **Sau đó token hết hạn vẫn chạy bình thường** bằng bản đã lưu, chỉ không cập nhật được cho tới khi dán token mới. Hướng dẫn từng bước kể cả cách tạo token: [DOCS.md](DOCS.md#1-cài-add-on-từ-đầu).
- **Phiên bản add-on luôn bằng bản Raling mới nhất:** mỗi khi có image mới, kho này tự nâng `version` của add-on cho bằng (workflow `auto-bump`, đọc thẻ image công khai, không cần token), không phải dựng lại tay.
- **Hướng dẫn từng bước** (cài add-on → thêm tích hợp → kết nối → dịch vụ → automation): [DOCS.md](DOCS.md)
- Danh mục mọi dịch vụ, quy tắc cuộc gọi, blueprint mẫu: [README của kho Raling](https://github.com/TriTue2011/Raling#readme)
- Chạy bằng Docker / Docker Compose / Portainer thay vì add-on: [mục 1](https://github.com/TriTue2011/Raling#1-cài-đặt-app-bằng-docker-docker-compose-và-portainer)
- Máy yếu, không cần giao diện: add-on **Raling (không giao diện)** cùng kho này (không cài đồng thời với bản này — cùng cổng 8080)
