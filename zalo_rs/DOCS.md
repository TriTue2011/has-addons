# Hướng dẫn cấu hình Add-on Zalo RS

> **Điểm khác biệt quan trọng so với `tele-rust`:** Kho `tele-rust` là **công khai** nên Home Assistant kéo thẳng ảnh Docker về chạy mà **không cần token**. Ngược lại, kho **`Ralo` là kho RIÊNG TƯ (private)** (cùng mô hình bảo vệ mã nguồn như `zalo_calling`):
> - Add-on dùng ảnh khởi động ("loader") **công khai, không chứa mã** (`ghcr.io/tritue2011/zalo-rs-loader`), nên Home Assistant cài đặt và nâng cấp add-on không cần `docker login ghcr.io`.
> - Ở **lần chạy đầu tiên**, add-on dùng tuỳ chọn **`github_token`** (token GitHub chỉ đọc do bạn tạo trên tài khoản đã được mời vào kho `TriTue2011/Ralo`) để tải bản chạy từ kho riêng về lưu trong `/data`.
> - **Sau lần đầu, nếu token hết hạn hoặc bị thu hồi**, add-on **vẫn khởi động và chạy bình thường** bằng bản đã lưu trên đĩa; chỉ khi cần cập nhật lên bản mới mới cần dán token còn hạn.

## 1. Tạo token GitHub và cài add-on vào Home Assistant

### 1.1. Tạo token GitHub (chỉ đọc kho riêng, hạn ngắn được)

1. Đăng nhập GitHub bằng tài khoản **đã được chủ kho mời vào `TriTue2011/Ralo`** (quyền *Read*) → mở **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Đặt tên tuỳ ý (ví dụ `ha-zalo-rs`) và chọn thời hạn (*Expiration*) tuỳ ý (token hết hạn add-on vẫn chạy bản đã lưu).
3. Mục **Repository access**: chọn **Only select repositories** → chọn **`TriTue2011/Ralo`**.
4. Mục **Permissions → Repository permissions**: bật **Contents: Read-only** (không cần quyền nào khác).
5. Nhấn **Generate token** và sao chép chuỗi token (`github_pat_...` hoặc `ghp_...`, tối thiểu 20 ký tự).

### 1.2. Thêm kho add-on và khởi chạy

1. Mở **Cài đặt → Tiện ích bổ sung (Add-ons) → Cửa hàng tiện ích bổ sung**.
2. Chọn biểu tượng ba chấm góc trên bên phải → **Kho lưu trữ (Repositories)**.
3. Dán `https://github.com/TriTue2011/has-addons` → **Thêm** → đóng cửa sổ, tải lại trang.
4. Tìm **Ralo** (icon chữ «Ralo»), nhấn **Cài đặt (Install)**. Không đè **Zalo Calling**: slug, dữ liệu và cổng riêng (8096).
5. Chuyển sang tab **Cấu hình (Configuration)**, dán token vừa tạo vào **`github_token`** (bắt buộc, từ 20 ký tự), nhấn **Lưu** rồi **Khởi động**.

6. Tab **Thông tin** → bật **Hiện trong thanh bên** → mục **Ralo** xuất hiện ở thanh bên HA (Ingress, không cần mở cổng).
7. Tab **Nhật ký** — lần đầu phải thấy lần lượt:
   `Ralo: tải v0.X.Y (zalo-rs-linux-amd64.tar.gz) từ kho riêng…` → `Ralo: đã chuẩn bị v0.X.Y.` → mật khẩu app tự sinh (nếu để trống).
   Lần sau khởi động nhanh hơn vì nhị phân đã lưu ở `/data/loader` (giữ 3 bản gần nhất).

### 1.3. Sự cố thường gặp

| Nhật ký | Nguyên nhân | Cách xử lý |
|---|---|---|
| `token GitHub sai hoặc đã hết hạn (401)` | Token gõ sai / hết hạn | Tạo token mới (mục 1.1), dán lại, khởi động lại. Đã có bản lưu thì add-on VẪN chạy bản đó. |
| `… chưa được cấp quyền đọc kho … (404)` | Tài khoản chưa được mời vào kho riêng, hoặc token không chọn kho `Ralo` | Nhờ chủ kho mời, tạo lại token chọn đúng kho. |
| `bản vX chưa có tệp zalo-rs-linux-…` | Bản phát hành đang dựng | Đợi vài phút rồi khởi động lại. |
| `KHÔNG CHẠY — chưa có bản nào đã lưu…` | Lần đầu mà không tải được | Sửa token theo hai dòng trên. |
| `app_version «…» không hợp lệ` | Gõ sai thẻ | Để trống, `latest`, hoặc thẻ dạng `v0.2.5`. |

## 2. Bảng tuỳ chọn cấu hình (`options`)

Hai tuỳ chọn đầu dành cho trình nạp kho riêng (`github_token`, `app_version`), các tuỳ chọn còn lại ánh xạ sang biến môi trường `ZALO_PC_*` của `zalo-rs`:

| Tuỳ chọn (`config.yaml`) | Biến môi trường / Vai trò | Mặc định | Mô tả |
| --- | --- | --- | --- |
| `github_token` | *(loader tải mã kho riêng)* | `""` (**bắt buộc**, 20–255 ký tự) | Token GitHub chỉ đọc kho riêng `TriTue2011/Ralo`. Bắt buộc ở lần chạy đầu để tải bản chạy về `/data`; sau đó token hết hạn vẫn chạy bản đã lưu, chỉ không cập nhật được. |
| `app_version` | *(loader chọn phiên bản)* | `""` | Ghim thẻ phiên bản mã cần tải (ví dụ `v0.2.5`). Để trống = đúng phiên bản đóng gói theo add-on; `"latest"` = bản phát hành mới nhất. |
| `app_user` | `ZALO_PC_APP_USER` | `"admin"` | Tên đăng nhập lớp ứng dụng. |
| `app_password` | `ZALO_PC_APP_PASSWORD` | `""` | Mật khẩu khởi tạo (được băm PBKDF2 và lưu riêng vào thư mục dữ liệu). Nếu để trống cả `app_password` lẫn `app_password_hash`, add-on tự sinh mật khẩu lần đầu và lưu ở `/data/state/THONG-TIN-DANG-NHAP.txt`. |
| `app_password_hash` | `ZALO_PC_APP_PASSWORD_HASH` | `""` | Chuỗi hash `$pbkdf2-sha256$iterations$salt_b64$hash_b64`. Nếu đặt biến này, hệ thống ưu tiên hơn `app_password` và tắt đổi mật khẩu từ giao diện web. |
| `ui` | `ZALO_PC_UI` | `true` (`1`) | Bật/tắt giao diện web nhúng (`false` sẽ đặt `ZALO_PC_UI=0`). |
| `udp_port` | `ZALO_PC_UDP_PORT` | `0` | Cổng UDP cho media cuộc gọi (`0` = tự cấp phát cổng tạm). |
| `session_hours` | `ZALO_PC_APP_SESSION_HOURS` | `8` | Thời hạn phiên đăng nhập web/API tính bằng giờ. |
| `login_max_fails` | `ZALO_PC_APP_LOGIN_MAX_FAILS` | `5` | Số lần đăng nhập sai tối đa theo IP trong cửa sổ 900 giây. |
| `cookie_secure` | `ZALO_PC_APP_COOKIE_SECURE` | `false` (`0`) | Bật cờ `Secure` cho cookie phiên khi chạy sau reverse proxy HTTPS. |
| `app_pin` | `ZALO_PC_APP_PIN` | `""` | Mã PIN riêng tư (4–32 ký tự); để trống để tắt. |
| `app_pin_hash` | `ZALO_PC_APP_PIN_HASH` | `""` | Chuỗi hash PBKDF2-SHA256 cho mã PIN riêng tư (ưu tiên hơn `app_pin`). |
| `app_pin_minutes` | `ZALO_PC_APP_PIN_MINUTES` | `10` | Thời gian tự khoá PIN lại khi không sử dụng (phút). |
| `webhook_url` | `ZALO_PC_WEBHOOK_URL` | `""` | URL HTTP/HTTPS mặc định nhận webhook sự kiện (khi chưa lưu cấu hình riêng). |
| `ws_enabled` | `ZALO_PC_WS` | `true` (`1`) | Bật kênh WebSocket bổ sung cho đồng bộ và điều khiển. |
| `ws_ping_seconds` | `ZALO_PC_WS_PING_SECONDS` | `30` | Chu kỳ gửi ping giữ kết nối WebSocket (5–3600 giây). |
| `computer_name` | `ZALO_PC_COMPUTER_NAME` | `""` | Tên thiết bị hiển thị trong phiên đăng nhập Zalo (tối đa 40 ký tự). |
| `save_photos` | `ZALO_PC_SAVE_PHOTOS` | `false` (`0`) | Tự động tải và lưu ảnh nhận được (mặc định chỉ tự tải tệp đính kèm). |
| `p2p` | `ZALO_PC_P2P` | `"auto"` | Chế độ P2P media (`auto` = mặc định hệ thống, `1` = bật, `0` = tắt). |
| `p2p_hosts` | `ZALO_PC_P2P_HOSTS` | `""` | Danh sách địa chỉ IPv4 ứng viên P2P cách nhau bởi dấu phẩy. |

## 3. Chế độ không giao diện web (`ui: false`)

Khi đặt `ui: false`, `entrypoint` truyền `ZALO_PC_UI=0` vào `zalo-rs`. Toàn bộ tài nguyên WebUI bị vô hiệu hoá, `/api/*` vẫn hoạt động đầy đủ cho tích hợp Home Assistant và các lệnh tự động hoá.

## 4. Chạy bằng Docker độc lập (không qua Home Assistant)

Khi chạy trực tiếp bằng ảnh ứng dụng `ghcr.io/tritue2011/zalo-rs:latest` (từ kho riêng, cần `docker login ghcr.io` bằng token có quyền `read:packages`, hoặc tự dựng từ `Dockerfile`), container khởi động bằng `entrypoint` tự `chown 10001:10001` thư mục `/data` rồi hạ quyền xuống UID/GID `10001` (`zalo`).

Ví dụ `docker run`:

```bash
docker run -d \
  --name zalo-rs \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v zalo-rs-data:/data \
  -e ZALO_PC_APP_USER=admin \
  -e ZALO_PC_APP_PASSWORD_HASH='<hash-pbkdf2-sha256>' \
  ghcr.io/tritue2011/zalo-rs:latest
```

Ví dụ `docker-compose.yml`:

```yaml
services:
  zalo-rs:
    image: ghcr.io/tritue2011/zalo-rs:latest
    container_name: zalo-rs
    restart: unless-stopped
    init: true
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - zalo-rs-data:/data
    environment:
      ZALO_PC_APP_USER: admin
      ZALO_PC_APP_PASSWORD_HASH: "<hash-pbkdf2-sha256>"
      ZALO_PC_UI: "1"

volumes:
  zalo-rs-data:
```

## 5. Lưu ý bảo mật

- **Token GitHub chỉ cần quyền đọc tối thiểu:** Chỉ cấp quyền `Contents: Read-only` cho duy nhất kho `TriTue2011/Ralo`. Không dùng token có quyền ghi mã hoặc quyền quản trị.
- **Ưu tiên `app_password_hash` và `app_pin_hash`** thay cho mật khẩu/PIN dạng chữ thường để không lưu bí mật thô trong cấu hình biến môi trường.
- **Bật `cookie_secure: true`** nếu đưa giao diện hoặc API qua reverse proxy HTTPS (ví dụ Nginx, Caddy, Cloudflare Tunnel). Không mở trực tiếp cổng `8080` ra Internet mà không có lớp HTTPS và kiểm soát truy cập.
- **Quyền dữ liệu `/data` (UID `10001`):** Khi chạy cùng Home Assistant Supervisor, `entrypoint` tự chuyển `ZALO_PC_DATA_DIR` sang `/data/state` để tiến trình chỉ tạo quyền `0700` trên thư mục trạng thái con, giữ nguyên quyền đọc `/data/options.json`.
- **Không chia sẻ token hay tệp phiên:** Thư mục dữ liệu lưu khóa phiên và cơ sở dữ liệu tin nhắn; hãy sao lưu an toàn và không đưa vào hệ thống quản lý mã nguồn.
