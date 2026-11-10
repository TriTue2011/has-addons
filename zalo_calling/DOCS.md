# Zalo Calling — hướng dẫn nhanh

Gọi thoại và video Zalo từ Home Assistant; tiếng bên kia ra loa trong nhà (loa R1,
loa camera, `media_player`), mic loa/camera gửi sang điện thoại. **Dùng tài khoản
Zalo phụ** — đây là app không chính thức.

Hướng dẫn đầy đủ, sơ đồ xử lý sự cố và giới hạn: xem
[README](https://github.com/TriTue2011/has-addons/blob/main/zalo_calling/README.md).

## Cần hai phần

1. **Add-on này** — app đăng nhập Zalo và truyền tiếng/hình.
2. **Tích hợp «Zalo Call»** (HACS, kho `https://github.com/TriTue2011/Zalo-calling`, loại
   Integration, qua **⋮ → Custom repositories**) — tạo thiết bị, nút, service và sự kiện trong HA.

## Cấu hình add-on

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `username` | Tên đăng nhập WebUI (mặc định `admin`). |
| `password` | Mật khẩu WebUI. Để trống: add-on tự sinh và in ra **Nhật ký** mỗi lần khởi động. |

## Bắt đầu

1. Khởi động add-on, xem **Nhật ký** để lấy mật khẩu (nếu để trống).
2. **Mở WebUI** (`http://<IP HA>:8080`), đăng nhập, **quét mã QR** bằng Zalo trên
   điện thoại (tài khoản phụ). Thấy danh bạ là xong.
3. Cài tích hợp **Zalo Call** bằng HACS, khởi động lại HA, rồi **Thêm tích hợp**:
   địa chỉ app `http://<IP HA>:8080` cùng tài khoản WebUI.
4. Trên thiết bị Zalo Call: điền **Địa chỉ HA** (`http://<IP HA>:8123`), chọn **Loa
   mặc định**, **Mic mặc định**, **Camera mặc định** (có mục *Hình kiểm tra* để thử),
   đặt **Âm lượng cuộc gọi**.
5. Gọi thử: WebUI → bấm một người trong danh bạ → **Gọi** hoặc **Video**, hoặc service
   `zalo_call.make_call`.

## Lưu ý

- Cổng **8080** chỉ để trong mạng LAN; đừng mở ra Internet.
- Bản sao lưu của HA chứa **phiên đăng nhập Zalo** — giữ an toàn.
- Add-on chỉ có trên Home Assistant OS / Supervised. HA Container thì chạy app bằng
  Docker (xem README).
- Add-on mới đóng gói, chưa kiểm hết trên HAOS thật: gặp lỗi khi cài hay chạy, gửi
  Nhật ký để chẩn đoán.
