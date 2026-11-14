# 📞 Zalo Calling (không giao diện)

Cùng mã nguồn với bản có giao diện nhưng nhỏ gọn, hợp máy cấu hình yếu. **Không có WebUI**: `username` và `password` bắt buộc đặt ở tab *Cấu hình*,
đăng nhập Zalo và đổi cài đặt bằng dịch vụ Home Assistant (`zalo_call.login_qr`, `zalo_call.set_app_settings`…) hoặc `curl`.

> App không chính thức, đăng nhập Zalo bằng mã QR. **Dùng tài khoản Zalo phụ.**

- **Hướng dẫn từng bước** (cài add-on → thêm tích hợp → kết nối → dịch vụ → automation): [DOCS.md](DOCS.md)
- Danh mục mọi dịch vụ, quy tắc cuộc gọi, blueprint mẫu: [README của kho Zalo-calling](https://github.com/TriTue2011/Zalo-calling#readme)
- Cần WebUI: add-on **Zalo Calling (có giao diện)** cùng kho này (không cài đồng thời — cùng cổng 8080)
