# 📞 Zalo Calling (có giao diện)

Gọi **thoại và video Zalo** từ Home Assistant: điện thoại đổ chuông, nghe máy xong tiếng bên kia ra **loa trong nhà**, mic loa/camera gửi sang điện thoại,
video phát hình từ camera nhà. WebUI hiện ngay ở **thanh bên** của Home Assistant (Ingress), không cần mở cổng.

> App không chính thức, đăng nhập Zalo bằng mã QR. **Dùng tài khoản Zalo phụ.**

- **Cần token GitHub (bắt buộc):** add-on dùng image khởi động công khai `ghcr.io/tritue2011/zalo-calling-loader`, **không chứa mã**. Mỗi lần khởi động nó dùng tuỳ chọn `github_token` (token chỉ đọc kho riêng `Zalo-calling`, do chủ kho mời và cấp) để tải mã rồi chạy; thiếu/sai token hoặc bị thu hồi quyền thì add-on **không chạy**. Cách tạo token: [DOCS.md](DOCS.md#token-github-chỉ-ai-được-cấp-quyền-mới-cài-và-chạy-được). Tuỳ chọn `app_version` (trống = đúng bản của image; `latest` = bản mới nhất).
- Khi kho Zalo-calling ra bản mới, add-on **tự được nâng phiên bản** (workflow `auto-bump`, cần secret `SOURCE_REPO_TOKEN` của kho này); không phải dựng lại add-on bằng tay.
- **Hướng dẫn từng bước** (cài add-on → thêm tích hợp → kết nối → dịch vụ → automation): [DOCS.md](DOCS.md)
- Danh mục mọi dịch vụ, quy tắc cuộc gọi, blueprint mẫu: [README của kho Zalo-calling](https://github.com/TriTue2011/Zalo-calling#readme)
- Chạy bằng Docker / Docker Compose / Portainer thay vì add-on: [mục 1](https://github.com/TriTue2011/Zalo-calling#1-cài-đặt-app-bằng-docker-docker-compose-và-portainer)
- Máy yếu, không cần giao diện: add-on **Zalo Calling (không giao diện)** cùng kho này (không cài đồng thời với bản này — cùng cổng 8080)
