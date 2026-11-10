# 📞 Zalo Calling

Gọi **thoại và video Zalo** từ Home Assistant: điện thoại đổ chuông, nghe máy xong tiếng
bên kia ra **loa trong nhà** (R1, loa camera, `media_player`), mic loa/camera gửi sang
điện thoại, video phát hình từ **camera nhà**.

> ⚠️ App không chính thức, đăng nhập Zalo bằng mã QR. **Dùng tài khoản Zalo phụ.**

**Cần 2 phần:** ① **add-on này** (app đăng nhập Zalo) + ② **tích hợp Zalo Call** (HACS).
Thiếu một phần là không chạy. Add-on chỉ có trên **HAOS / Supervised**; HA Docker xem [mục Docker](#docker).

## ① Cài add-on

1. **Cài đặt → Add-on → Cửa hàng → ⋮ → Kho lưu trữ** → dán `https://github.com/TriTue2011/has-addons`.
2. Cài **Zalo Calling**. Tab **Cấu hình**:

   | Tuỳ chọn | Ý nghĩa |
   |---|---|
   | `username` | Tên đăng nhập WebUI (mặc định `admin`) |
   | `password` | Mật khẩu WebUI. **Bỏ trống** = tự sinh, in ra tab **Nhật ký** |

3. **Khởi động**, đọc **Nhật ký** lấy mật khẩu, bấm **Mở WebUI** (`http://<IP HA>:8080`).
4. Đăng nhập, rồi **quét mã QR** bằng Zalo trên điện thoại (tài khoản phụ). Thấy danh bạ là xong.

![Đăng nhập WebUI](img/dang-nhap.png)

## ② Cài tích hợp (HACS)

1. HACS → ⋮ → Kho tuỳ chỉnh → `https://github.com/TriTue2011/Calling` (Integration) → tải **Zalo Call** → khởi động lại HA.
2. **Thêm tích hợp → Zalo Call**: địa chỉ app `http://<IP HA>:8080` + tài khoản WebUI ở trên.
3. Trên thiết bị **Zalo Call**: điền **Địa chỉ HA** (`http://<IP HA>:8123`), chọn **Loa / Mic / Camera mặc định**
   (có mục *Hình kiểm tra* để thử), đặt **Âm lượng cuộc gọi** (0 = giữ nguyên) và **Chống vọng**.

## Gọi

WebUI → chọn người trong danh bạ → **Gọi** / **Video**. Hoặc từ automation:

```yaml
service: zalo_call.make_call
data: {thread_id: "123456789012345678", type: video, volume: 70}   # thread_id xem ở mục Cuộc gọi của WebUI
```

Sự kiện `zalo_call_call_state` (`incoming`, `ringing`, `answered`, `declined`, `no_answer`, `ended`…) dùng cho automation.
Service khác: `answer_call`, `reject_call`, `end_call`, `upgrade_to_video`, `set_default_devices`.

## Docker

Dùng cho HA Container hoặc chạy app ở máy khác:

```sh
mkdir zalo && cd zalo
curl -LO https://github.com/TriTue2011/Calling/releases/latest/download/docker-compose.yml
printf 'ZALO_PC_APP_USER=admin\nZALO_PC_APP_PASSWORD=mat-khau-dai\n' > .env
docker compose up -d        # mở http://<máy>:8080, quét QR
```

| Biến (`.env`) | Ý nghĩa | Tương đương ở add-on |
|---|---|---|
| `ZALO_PC_APP_USER` | Tên đăng nhập WebUI | `username` |
| `ZALO_PC_APP_PASSWORD` | Mật khẩu WebUI (**bắt buộc**) | `password` |

Cập nhật: `docker compose pull && docker compose up -d`. Phần ② y hệt, chỉ khác địa chỉ app.

## Lỗi thường gặp

| Lỗi | Cách xử |
|---|---|
| Tích hợp báo «Không gọi được tới app» | Add-on chưa chạy, hoặc sai cổng 8080 |
| Video không có hình / nháy rồi mất | Đặt lại **Camera mặc định** (hoặc chọn *Hình kiểm tra* để thử) |
| Loa nhỏ | Tăng **Âm lượng cuộc gọi** |
| Tiếng bạn đứt khi nói chồng (loa R1) | R1 là nửa song công; muốn mic luôn mở: **Chống vọng = Song công**, R1 đặt **Động cơ xử lý âm thanh = nâng cao** |
| Tiếng không ra loa R1 | Tải lại tích hợp R1 |

## Cần biết

- Cổng **8080 chỉ để trong LAN**, đừng mở ra Internet. Bản sao lưu HA chứa **phiên Zalo** — giữ kín.
- Add-on **mới đóng gói**, chưa kiểm hết trên HAOS thật; lỗi thì gửi Nhật ký. Chưa gọi nhóm có hình.
- Mã nguồn: <https://github.com/TriTue2011/Calling>
