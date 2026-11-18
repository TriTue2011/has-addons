> Hướng dẫn cài đặt đầy đủ của **Zalo Bot** (trước đây nằm trong README tổng của kho). Tài liệu tham chiếu dịch vụ/API: [README.md](README.md). Quay lại [README tổng](../README.md).

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

Chọn **một** trong hai đường dưới đây. **Cả hai đều cần token GitHub chỉ đọc ở lần chạy đầu** (xem ngay dưới).

## Vì sao cần token GitHub

Mã máy chủ Zalo Bot nằm ở kho **riêng tư** `TriTue2011/zalo_bot` (thư mục `server/`). Image mà add-on và Docker dùng là **image khởi động công khai** `ghcr.io/tritue2011/zalobot-loader`, **không chứa mã máy chủ**. Lần chạy đầu nó dùng token của bạn để tải mã về, chạy `npm ci` rồi chạy máy chủ.

- **Chỉ lần đầu** mới nhất thiết cần token còn hạn (và mạng tới `registry.npmjs.org`). Sau đó token **hết hạn, sai, bị thu hồi quyền** hoặc mất mạng: máy chủ **vẫn chạy bình thường bằng bản mã đã lưu**, nhật ký ghi `CẢNH BÁO — … Chạy bản đã lưu …; KHÔNG cập nhật được`. Muốn cập nhật lại thì tạo token mới, dán vào, khởi động lại.
- Không có token và chưa có bản mã đã lưu thì máy chủ **không chạy** (`KHÔNG CHẠY — …` trong nhật ký).
- Token không bị ghi ra nhật ký, không gửi sang máy chủ tải tệp, và bị bỏ khỏi môi trường của máy chủ.

### Tạo token GitHub (chỉ đọc, hạn ngắn được)
1. Chủ kho mời tài khoản GitHub của bạn vào kho `TriTue2011/zalo_bot` (quyền *Read*). Chưa được mời thì không thấy kho khi tạo token.
2. GitHub → ảnh đại diện → **Settings → Developer settings → Fine-grained tokens → Generate new token**.
3. *Expiration*: tuỳ ý, **ngắn cũng được**. *Repository access* → **Only select repositories** → chọn **`TriTue2011/zalo_bot`** (chỉ kho này).
4. *Permissions → Repository permissions* → **Contents: Read-only** (không cần quyền nào khác).
5. **Generate token** → **sao chép ngay** chuỗi bắt đầu bằng `github_pat_…` (GitHub chỉ hiện một lần).

## Đường A: Add-on (cho Home Assistant OS và Supervised)

> Không dùng được với Home Assistant bản Docker/Container — bản đó không có hệ thống add-on. Nếu bạn chạy HA bằng `docker run` hay `docker compose`, hãy đi theo **Đường B**.

**Bước 1.** Vào **Settings → Add-ons → Add-on Store** → dấu **ba chấm** (⋮) góc trên bên phải → **Repositories**.

**Bước 2.** Dán đường dẫn này rồi **Add**:

```
https://github.com/TriTue2011/has-addons
```

**Bước 3.** Nhấn F5 tải lại trang, tìm **Zalo Bot** → **Install**. Lần đầu tải image khởi động mất vài phút.

**Bước 4.** Sang tab **Configuration** và điền:

| Ô | Nên điền gì |
|---|---|
| `github_token` | **Bắt buộc.** Dán token ở phần trên (từ 20 ký tự). Để trống thì Supervisor báo *invalid options* và không cho khởi động |
| `app_version` | Để trống = đúng bản của add-on. Điền thẻ (vd `v2026.11.19.1`) để ghim bản, hoặc `latest` để lấy bản phát hành mới nhất |
| `data_directory` | Để nguyên `/config/zalo_bot` |
| `api_key` | Để trống — add-on tự sinh, xem bước 6 |
| `admin_password` | Để trống cũng được — add-on tự sinh, xem bước 6 |
| `session_secret` | Để trống cũng được — add-on tự sinh và giữ lại |

**Bước 5.** Nhấn **Save** → **Start**, rồi mở tab **Log**. Lần đầu phải thấy lần lượt: `Zalo Bot: tải mã … từ kho riêng…` → `Zalo Bot: cài thư viện Node (npm ci)…` → `Zalo Bot: đã chuẩn bị … (… tệp)` → các dòng khởi động của máy chủ. Thấy `Zalo Bot: KHÔNG CHẠY — …` thì xem bảng sự cố cuối tài liệu.

**Bước 6.** Nếu để trống `admin_password`, tìm mật khẩu trong tab **Log** — add-on in ra một khối như thế này mỗi lần khởi động:

```
============================================================
 Tai khoan: admin
 Mat khau : 6nLh3ufkZMp0DUAN
 Khoa API : d95a4db8c902296dd7005fad54c9fbb28c32b3b7e517ea3fcce8d59429173
 Da ghi ra: /config/zalo_bot/THONG-TIN-DANG-NHAP.txt
============================================================
```

Mật khẩu cũng nằm trong tệp `THONG-TIN-DANG-NHAP.txt` ở thư mục dữ liệu, mở bằng add-on **File editor** hoặc qua **Samba** là thấy.

**Bước 7.** Mở giao diện web tại `http://<ip-máy-Home-Assistant>:3000`, đăng nhập bằng tài khoản trên, rồi **quét mã QR bằng ứng dụng Zalo trên điện thoại** để đăng nhập tài khoản Zalo.

**Phiên bản add-on luôn bằng bản Zalo Bot mới nhất:** mỗi khi kho `zalo_bot` có image mới, kho `has-addons` tự nâng `version` của add-on cho bằng (workflow `auto-bump`, đọc thẻ image công khai, mỗi 10 phút). Home Assistant hiện nút **Cập nhật** (bật *Tự động cập nhật* thì tự lên). Cập nhật add-on chỉ kéo image khởi động công khai nên không cần token; **mã** mới được tải lúc khởi động nên cần token còn hạn — hết hạn thì add-on lên phiên bản mới nhưng vẫn chạy mã đã lưu (có cảnh báo) cho tới khi bạn dán token mới.

## Đường B: Docker, Docker Compose, Portainer

Dùng khi chạy Home Assistant bản Container, hoặc muốn đặt máy chủ Zalo ở máy khác. Lưu mẫu sau thành `docker-compose.yml`, đặt `ZALOBOT_GITHUB_TOKEN` trong tệp `.env` cạnh nó (Portainer: mục **Environment variables**), rồi chạy `docker compose up -d`. Token **không** ghi vào file compose.

```yaml
name: zalobot
services:
  zalobot:
    image: ghcr.io/tritue2011/zalobot-loader:latest     # [ĐỔI ĐƯỢC] :latest | :<số phiên bản> (vd :2026.11.19.1) để ghim bản
    container_name: zalobot                             # [ĐỔI ĐƯỢC] tên bất kỳ không trùng
    restart: unless-stopped                             # [ĐỔI ĐƯỢC] unless-stopped | always | on-failure | "no"
    ports:
      - "3000:3000"                                     # [ĐỔI ĐƯỢC] số BÊN TRÁI (cổng trên máy chủ, 1–65535, chưa bị dùng); bên phải = PORT. Đừng mở ra Internet
    volumes:
      - zalobot-data:/data                              # BẮT BUỘC có: chứa mã đã tải (/data/.zalobot-app) và dữ liệu (cookie đăng nhập Zalo). Thiếu = mỗi lần dựng lại phải tải mã và quét QR lại
    environment:
      ZALOBOT_GITHUB_TOKEN: "${ZALOBOT_GITHUB_TOKEN:-}"   # BẮT BUỘC lần đầu (qua .env / Portainer); sau đó hết hạn vẫn chạy bản đã lưu
      ZALOBOT_APP_REF: "${ZALOBOT_APP_REF:-}"             # [ĐỔI ĐƯỢC] thẻ/commit mã cần tải (vd v2026.11.19.1); trống = bản của image; latest = bản phát hành mới nhất
      DATA_DIRECTORY: "/data/zalobot"                   # nơi máy chủ lưu dữ liệu (nằm trong volume /data). Đừng đổi ra ngoài volume
      PORT: "3000"                                      # cổng TRONG container; đổi thì đổi cả số bên phải ở ports
      SESSION_SECRET: "${SESSION_SECRET:-}"             # [ĐỔI ĐƯỢC] chuỗi ngẫu nhiên; trống = tự sinh một lần và giữ lại (phiên đăng nhập sống qua khởi động lại)
      ZALO_SERVER_ADMIN_PASSWORD: "${ZALO_SERVER_ADMIN_PASSWORD:-}"   # [ĐỔI ĐƯỢC] mật khẩu admin lúc tạo tài khoản; trống = tự sinh, in trong log, lưu THONG-TIN-DANG-NHAP.txt
      ZALO_SERVER_API_KEY: "${ZALO_SERVER_API_KEY:-}"     # [ĐỔI ĐƯỢC] khoá cho API gửi tin; trống = tự sinh, in trong log
      # MESSAGE_WEBHOOK_URL: ""                         # [TUỲ CHỌN] webhook nhận tin nhắn (mặc định trống). Cũng có GROUP_EVENT_WEBHOOK_URL, REACTION_WEBHOOK_URL
    labels:
      com.centurylinklabs.watchtower.enable: "true"     # [ĐỔI ĐƯỢC] "true" = Watchtower (nếu dùng) tự kéo :latest mới của image khởi động

volumes:
  zalobot-data:
```

```bash
docker compose up -d
docker compose logs -f zalobot
```

Rồi mở `http://<ip-máy-chạy-docker>:3000`, đăng nhập bằng `admin` và mật khẩu (tự sinh và in trong log nếu bạn để trống), quét mã QR bằng Zalo trên điện thoại. **Volume `/data` là bắt buộc** — chứa mã đã tải và cookie đăng nhập Zalo; thiếu volume là mỗi lần dựng lại container phải tải mã và quét QR lại.

**Portainer:** Stacks → Add stack → Web editor → dán mẫu trên → Environment variables: thêm `ZALOBOT_GITHUB_TOKEN` (và tuỳ chọn `SESSION_SECRET`, `ZALO_SERVER_ADMIN_PASSWORD`, `ZALO_SERVER_API_KEY`) → Deploy.

**Image đầy đủ riêng tư (cách khác):** `ghcr.io/tritue2011/zalobot-server:latest` (amd64, arm64) — kéo bằng `docker login ghcr.io` với token **classic** có quyền `read:packages` (GitHub → Settings → Developer settings → **Tokens (classic)**; Portainer: Registries → Add registry → Custom, URL `ghcr.io`). Token fine-grained (`github_pat_…`) **không** kéo được image ghcr. Cần chủ kho cấp quyền đọc package.

Image khởi động là **một** image đa kiến trúc: `amd64`, `aarch64`, `armv7`, `armhf`; Docker tự chọn đúng bản.

## Tham số có thể đổi và phạm vi

| Tham số | Đổi được? | Phạm vi / hậu quả |
|---|---|---|
| `image` (thẻ) | có | `:latest` · `:<số phiên bản>` (vd `:2026.11.19.1`) ghim bản. Đổi thẻ = đổi image khởi động; mã tải theo `ZALOBOT_APP_REF` |
| `container_name`, `restart` | có | Tên bất kỳ không trùng; `unless-stopped` · `always` · `on-failure` · `"no"` |
| `ports` — số **bên trái** | có | 1–65535, chưa bị dùng (mặc định 3000). Bên phải phải khớp `PORT`. Tích hợp HA phải trỏ đúng cổng. **Đừng mở cổng ra Internet** |
| `volumes` → `/data` | **bắt buộc** | Chứa mã đã tải (`/data/.zalobot-app`) và dữ liệu (cookie đăng nhập Zalo). Thiếu = mỗi lần dựng lại phải tải mã và quét QR lại |
| `ZALOBOT_GITHUB_TOKEN` | lần đầu bắt buộc | Token chỉ đọc kho. Hết hạn thì vẫn chạy bản đã lưu |
| `ZALOBOT_APP_REF` | có | Thẻ/commit mã cần tải; trống = bản đóng gói trong image; `latest` = bản phát hành mới nhất (cần token còn hạn) |
| `DATA_DIRECTORY` | không nên | Phải nằm trong volume (`/data/zalobot`) |
| `PORT` | có | Cổng trong container; đổi thì đổi cả số bên phải ở `ports` |
| `SESSION_SECRET` | có | Chuỗi ngẫu nhiên; trống = tự sinh một lần và giữ lại (phiên đăng nhập sống qua khởi động lại) |
| `ZALO_SERVER_ADMIN_PASSWORD` | có | Chỉ áp dụng lúc tạo tài khoản admin lần đầu; trống = tự sinh, in trong log, lưu `THONG-TIN-DANG-NHAP.txt`. Đổi sau bằng giao diện web |
| `ZALO_SERVER_API_KEY` | có | Khoá cho API gửi tin (`Authorization: Bearer …`); trống = tự sinh. Khoá chỉ cấp quyền **gửi** nội dung |
| `MESSAGE_WEBHOOK_URL`, `GROUP_EVENT_WEBHOOK_URL`, `REACTION_WEBHOOK_URL` | tuỳ chọn | Webhook nhận tin nhắn / sự kiện nhóm / biểu cảm; mặc định trống |


# PHẦN 2 — Cài tích hợp trong Home Assistant

Làm sau khi máy chủ ở Phần 1 đã chạy và đã quét QR xong.

**Bước 1.** Mở **HACS** → dấu **ba chấm** góc trên phải → **Custom repositories**.

**Bước 2.** Dán đường dẫn, chọn loại **Integration**, rồi **Add**:

```
https://github.com/TriTue2011/zalo_bot
```

Kho này riêng tư: tài khoản GitHub đang đăng nhập HACS phải được mời vào kho. Nếu HACS không thêm được kho riêng, tải `zalo_bot.zip` ở trang *Releases* của kho (đăng nhập GitHub mới tải được), giải nén vào `/config/custom_components/zalo_bot/` rồi khởi động lại HA.

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
| `github_token` | `ZALOBOT_GITHUB_TOKEN` | **Bắt buộc lần đầu**; sau đó hết hạn vẫn chạy bản đã lưu |
| `app_version` | `ZALOBOT_APP_REF` | Trống = bản của image; thẻ/commit để ghim; `latest` = bản mới nhất |
| `data_directory` | `DATA_DIRECTORY` | Add-on dùng `/config/zalo_bot`, Docker (image khởi động) dùng `/data/zalobot` |
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

| Dòng trong nhật ký / triệu chứng | Nghĩa là | Cách xử lý |
|---|---|---|
| `KHÔNG CHẠY — Chưa đặt token GitHub … lần đầu BẮT BUỘC có token` | Chưa token, chưa có bản lưu | Tạo token (Phần 1) rồi dán vào `github_token` / `ZALOBOT_GITHUB_TOKEN` |
| `KHÔNG CHẠY — GitHub báo token sai hoặc đã hết hạn (401)` (lần đầu) | Token sai/hết hạn, chưa có bản lưu | Tạo token mới |
| `KHÔNG CHẠY — Token không có quyền đọc kho zalo_bot (403/404)` (lần đầu) | Sai kho/quyền hoặc chưa được mời | Tạo lại: **Only select repositories → zalo_bot**, **Contents: Read-only**; nhờ chủ kho mời |
| `KHÔNG CHẠY — npm ci lỗi (cần mạng tới registry.npmjs.org)` (lần đầu) | Không tải được thư viện Node | Kiểm mạng/DNS rồi khởi động lại |
| `CẢNH BÁO — … Chạy bản đã lưu …` | Đã có bản lưu; token hết hạn / mất mạng / npm lỗi | Vẫn chạy. Muốn cập nhật: token mới + khởi động lại |
| *Invalid options* khi lưu add-on | `github_token` trống hoặc dưới 20 ký tự | Điền đủ rồi lưu |


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
