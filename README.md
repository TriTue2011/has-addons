# ▶ TriTue YouTube Player

Repository này có thêm bộ YouTube Player clean-room gồm hai phần:

| Phần | Cài ở đâu | Tài liệu |
|---|---|---|
| Docker/Home Assistant App | App Store hoặc Docker | [`youtube_player`](youtube_player/) |
| Custom integration | HACS hoặc `/config/custom_components` | [`youtube_player_integration`](youtube_player_integration/) |

Player hỗ trợ URL video, Shorts và playlist qua trang nhúng privacy-enhanced,
có API token nội bộ, tìm kiếm danh sách bài hát và custom integration chuyển
lệnh phát tới Google Cast/`media_player` đã chọn. Không cần license key và không
chứa mã nguồn của YouTube Pro.

---

# 💬 Zalo Bot cho Home Assistant

Gửi và nhận tin nhắn **Zalo cá nhân** ngay trong Home Assistant: báo động, nhắc
việc, gửi ảnh camera, chuyển tiếp tin nhắn vào automation.

## ❓ Nhóm hỗ trợ

- Zalo: https://zalo.me/g/alvkgn274
- Facebook: https://www.facebook.com/groups/aiboxvn

---

## Trước hết: cần HAI phần, không phải một

Rất nhiều người cài xong một phần rồi tưởng hỏng. Bộ đầy đủ gồm:

| Phần | Là gì | Cài ở đâu |
|---|---|---|
| **Máy chủ Zalo** | Chương trình thật sự đăng nhập và nói chuyện với Zalo | Add-on Home Assistant **hoặc** container Docker |
| **Tích hợp Zalo Bot** | Phần tạo service, entity, nút bấm trong Home Assistant | HACS |

Tích hợp **không tự nói chuyện với Zalo được** — nó chỉ gọi sang máy chủ. Thiếu
máy chủ thì tích hợp không làm gì cả.

Máy chủ chạy bằng Node.js nên **không thể** nhét vào tích hợp HACS (Home
Assistant chỉ chạy Python).

---

# PHẦN 1 — Cài máy chủ Zalo

Chọn **một** trong hai đường dưới đây.

## Đường A: Add-on (cho Home Assistant OS và Supervised)

> Không dùng được với Home Assistant bản Docker/Container — bản đó không có hệ
> thống add-on. Nếu bạn chạy HA bằng `docker run` hay `docker compose`, hãy đi
> theo **Đường B**.

**Bước 1.** Vào **Settings → Add-ons → Add-on Store**.

**Bước 2.** Nhấp biểu tượng **ba chấm** (⋮) góc trên bên phải → **Repositories**.

**Bước 3.** Dán đường dẫn này rồi **Add**:

```
https://github.com/TriTue2011/has-addons
```

**Bước 4.** Nhấn F5 để tải lại trang, tìm **Zalo Bot** → **Install**. Lần đầu
tải image mất vài phút.

**Bước 5.** Sang tab **Configuration** và điền:

| Ô | Nên điền gì |
|---|---|
| `data_directory` | Để nguyên `/config/zalo_bot` |
| `api_key` | Để trống — add-on tự sinh, xem bước 7 |
| `admin_password` | Để trống cũng được — add-on tự sinh, xem bước 7 |
| `session_secret` | Để trống cũng được — add-on tự sinh và giữ lại |

**Bước 6.** Nhấn **Start**, rồi mở tab **Log** xem có lỗi không.

**Bước 7.** Nếu để trống `admin_password`, tìm mật khẩu trong tab **Log** —
add-on in ra một khối như thế này mỗi lần khởi động:

```
============================================================
 Tai khoan: admin
 Mat khau : 6nLh3ufkZMp0DUAN
 Khoa API : d95a4db8c902296dd7005fad54c9fbb28c32b3b7e517ea3fcce8d59429173
 Da ghi ra: /config/zalo_bot/THONG-TIN-DANG-NHAP.txt
============================================================
```

Mật khẩu cũng nằm trong tệp `THONG-TIN-DANG-NHAP.txt` ở thư mục dữ liệu, mở
bằng add-on **File editor** hoặc qua **Samba** là thấy.

**Bước 8.** Mở giao diện web tại `http://<ip-máy-Home-Assistant>:3000`, đăng
nhập bằng tài khoản trên, rồi **quét mã QR bằng ứng dụng Zalo trên điện thoại**
để đăng nhập tài khoản Zalo.

## Đường B: Docker

Dùng khi chạy Home Assistant bản Container, hoặc muốn đặt máy chủ Zalo ở máy
khác.

Tạo `docker-compose.yaml`:

```yaml
services:
  zalobot:
    image: ghcr.io/tritue2011/zalobot:latest
    container_name: zalobot
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      DATA_DIRECTORY: /app/data
      PORT: "3000"
      # Sinh từng chuỗi bằng: openssl rand -hex 32
      SESSION_SECRET: "thay-bang-chuoi-ngau-nhien"
      ZALO_SERVER_ADMIN_PASSWORD: "thay-bang-mat-khau-manh"
      ZALO_SERVER_API_KEY: "thay-bang-khoa-ngau-nhien"
    volumes:
      - ./zalobot-data:/app/data
```

Chạy:

```bash
docker compose up -d
docker compose logs -f zalobot
```

Rồi mở `http://<ip-máy-chạy-docker>:3000`, đăng nhập bằng `admin` và mật khẩu
vừa đặt, quét mã QR bằng Zalo trên điện thoại.

**Gắn volume vào đúng `/app/data`** — cookie đăng nhập nằm ở đó. Thiếu volume là
mỗi lần dựng lại container phải quét QR lại từ đầu.

Image là **một** image dùng chung cho mọi kiến trúc: `amd64`, `aarch64`,
`armv7`, `armhf`. Docker tự chọn đúng bản.

---

# PHẦN 2 — Cài tích hợp trong Home Assistant

Làm sau khi máy chủ ở Phần 1 đã chạy và đã quét QR xong.

**Bước 1.** Mở **HACS** → dấu **ba chấm** góc trên phải → **Custom repositories**.

**Bước 2.** Dán đường dẫn, chọn loại **Integration**, rồi **Add**:

```
https://github.com/TriTue2011/zalo_bot
```

**Bước 3.** Tìm **Zalo Bot** trong HACS → **Download** → **khởi động lại Home
Assistant**.

**Bước 4.** Vào **Settings → Devices & Services → Add Integration** → tìm
**Zalo Bot**. Điền:

| Ô | Giá trị |
|---|---|
| Zalo server | `http://<ip-máy-chủ-zalo>:3000` |
| Username | `admin` |
| Password | mật khẩu ở Phần 1 |

Chạy add-on trên cùng máy Home Assistant thì điền `http://localhost:3000`.

**Bước 5.** Xong. Trong automation sẽ có các service `zalo_bot.send_message`,
`zalo_bot.send_image`, `zalo_bot.send_file`…

---

## Cấu hình chi tiết

| Tuỳ chọn | Biến môi trường (bản Docker) | Bỏ trống thì sao |
|---|---|---|
| `data_directory` | `DATA_DIRECTORY` | Add-on dùng `/config/zalo_bot`, Docker dùng `/app/data` |
| `api_key` | `ZALO_SERVER_API_KEY` | Add-on tự sinh, giữ lại, và ghi vào `THONG-TIN-DANG-NHAP.txt` |
| `admin_password` | `ZALO_SERVER_ADMIN_PASSWORD` | Sinh ngẫu nhiên, ghi ra `THONG-TIN-DANG-NHAP.txt` và in ra log |
| `session_secret` | `SESSION_SECRET` | Sinh một lần rồi giữ lại, phiên đăng nhập sống qua khởi động lại |

Biến môi trường luôn **được ưu tiên hơn** ô cấu hình add-on.

Đổi `admin_password` sau khi tài khoản đã tạo thì **không** đổi mật khẩu đang
dùng — giá trị đó chỉ áp dụng lúc tạo tài khoản lần đầu. Muốn đổi thì đăng nhập
vào giao diện web rồi dùng chức năng đổi mật khẩu.

---

## ⚠️ Bảo mật — đọc trước khi mở cổng

Cổng 3000 là **cổng quản trị một tài khoản Zalo thật**. Ai vào được cổng này thì
đọc được tin nhắn và gửi tin dưới danh nghĩa bạn.

**Đừng bao giờ mở cổng 3000 ra Internet.** Không NAT, không port forward. Cần
truy cập từ xa thì đi qua VPN hoặc Cloudflare Tunnel có xác thực.

**Khoá API bật sẵn.** Add-on tự sinh `api_key` ngay lần chạy đầu, nên nhóm API
gửi tin — `/api/sendmessage`, `/api/findUser`, `/api/getUserInfo`,
`/api/createGroup` — đóng ngay từ đầu, đòi header
`Authorization: Bearer <api_key>` hoặc phiên đăng nhập admin.

Khoá nằm trong `THONG-TIN-DANG-NHAP.txt` cùng thư mục dữ liệu, và in ra tab
**Log** mỗi lần khởi động. Chép ra dùng cho REST command hay script. **Tích hợp
HACS không cần khoá này** — nó đăng nhập bằng tài khoản admin.

Khoá đó cố ý **chỉ cấp quyền gửi nội dung** (tin, ảnh, tệp, video, sticker). Đọc
lịch sử chat, tra người dùng, tạo và sửa nhóm, kết bạn đều bắt buộc đăng nhập
bằng tài khoản admin.

---

## Gặp sự cố

**Add-on không hiện trong Store.** Nhấn F5 tải lại trang. Vẫn không thấy thì
kiểm tra đã thêm đúng đường dẫn kho ở bước 3 chưa.

**Không tìm thấy add-on dù đã thêm kho, và Home Assistant chạy bằng Docker.**
Bản Container không có hệ thống add-on. Đi theo Đường B.

**Add-on chạy nhưng không đăng nhập được.** Mở tab **Log** tìm khối in mật khẩu.
Nếu bạn tự điền `admin_password` mà vẫn sai, nhớ rằng giá trị đó chỉ áp dụng lần
đầu tạo tài khoản — xoá tệp `users.json` trong thư mục dữ liệu rồi khởi động lại
để tạo lại từ đầu.

**Cứ khởi động lại là bị đăng xuất khỏi giao diện web.** Đang chạy Docker mà
chưa đặt `SESSION_SECRET`. Đặt vào là hết.

**Mỗi lần dựng lại container phải quét QR lại.** Chưa gắn volume vào
`/app/data`, nên cookie đăng nhập mất theo container.

**Tích hợp báo không kết nối được máy chủ.** Kiểm tra máy Home Assistant gọi tới
được địa chỉ đã điền:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://<ip-máy-chủ-zalo>:3000/admin-login
```

Trả `200` là thông. Không phải `200` thì lỗi mạng hoặc sai cổng, chưa phải lỗi
tích hợp.

---

## 🆘 Báo lỗi

Mở issue tại https://github.com/TriTue2011/has-addons/issues — kèm nội dung tab
**Log** của add-on, và nhớ **che mật khẩu cùng khoá API** trước khi dán.
