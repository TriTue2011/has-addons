# 📞 Zalo Calling

Gọi **thoại và video Zalo** từ Home Assistant: điện thoại đổ chuông, nghe máy xong tiếng
bên kia ra **loa trong nhà** (R1, loa camera, `media_player`), mic loa/camera gửi sang
điện thoại, video phát hình từ **camera nhà**.

> ⚠️ App không chính thức, đăng nhập Zalo bằng mã QR. **Dùng tài khoản Zalo phụ.**

**Cần 2 phần:** ① **add-on này** (app đăng nhập Zalo) + ② **tích hợp Zalo Call** (HACS).

## Thêm nhanh vào Home Assistant

| Bước | Nút |
|---|---|
| ① Thêm kho add-on | [![Thêm kho add-on](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTriTue2011%2Fhas-addons) |
| ② Mở tích hợp trong HACS | [![Mở trong HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=TriTue2011&repository=Zalo-calling&category=integration) |
| ③ Thêm tích hợp (sau khi tải + khởi động lại HA) | [![Thêm tích hợp](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=zalo_call) |

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

1. HACS → **⋮ → Custom repositories** → `https://github.com/TriTue2011/Zalo-calling`, **Type = Integration** → **Add** → tìm **Zalo Call** → **Download** → khởi động lại HA.
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

Cho HA Container hoặc khi chạy app ở máy khác. Tạo thư mục `zalo/` với hai tệp:

**`docker-compose.yml`**

```yaml
services:
  zalo-calling:
    image: ghcr.io/tritue2011/zalo-calling:latest
    container_name: zalo-calling
    restart: unless-stopped
    init: true                # dọn ffmpeg mồ côi, không để lại tiến trình ma
    mem_limit: 512m           # đo: ~70 MB lúc rảnh, mỗi ffmpeg video ≤ ~160 MB; tăng nếu camera 4K
    memswap_limit: 512m       # không tràn sang swap
    cpus: "1.5"
    pids_limit: 256
    logging:
      driver: json-file
      options: {max-size: "10m", max-file: "3"}
    ports:
      - "8080:8080"      # HA cùng máy và dùng network host: đổi thành "127.0.0.1:8080:8080"
    volumes:
      - zalo-data:/data  # phiên đăng nhập Zalo nằm ở đây
    environment:
      ZALO_PC_APP_USER: ${ZALO_PC_APP_USER}
      ZALO_PC_APP_PASSWORD: ${ZALO_PC_APP_PASSWORD}
volumes:
  zalo-data:
```

**`.env`** (cùng thư mục; mật khẩu dài, không ghi vào compose)

```
ZALO_PC_APP_USER=admin
ZALO_PC_APP_PASSWORD=mat-khau-dai
```

```sh
docker compose up -d                          # chạy
docker compose logs -f                        # xem nhật ký
docker compose pull && docker compose up -d   # cập nhật
```

Mở `http://<máy>:8080`, đăng nhập, quét QR. Bước ② y hệt, địa chỉ app là `http://<IP máy Docker>:8080`.
Ghim phiên bản: đổi `:latest` thành `:2026.11.10.11`. Tên biến ↔ add-on: `ZALO_PC_APP_USER` = `username`, `ZALO_PC_APP_PASSWORD` = `password` (ở Docker là **bắt buộc**).

## Lỗi thường gặp

| Lỗi | Cách xử |
|---|---|
| Tích hợp báo «Không gọi được tới app» | Add-on chưa chạy, hoặc sai cổng 8080 |
| Video không có hình / nháy rồi mất | Đặt lại **Camera mặc định** (hoặc chọn *Hình kiểm tra* để thử) |
| Loa nhỏ | Tăng **Âm lượng cuộc gọi** |
| Tiếng bạn đứt khi nói chồng (loa R1) | R1 là nửa song công; muốn mic luôn mở: **Chống vọng = Song công**, R1 đặt **Động cơ xử lý âm thanh = nâng cao** |
| Tiếng không ra loa R1 | Tải lại tích hợp R1 |

## Định dạng chữ, màu, emoji

`zalo_call.send_message` nhận thêm các trường (đều có ô chọn trong HA):

| Trường | Làm gì |
|---|---|
| `format: markdown` | `**đậm**` `*nghiêng*` `__gạch chân__` `~~gạch ngang~~` · `# tiêu đề` (to + đậm) · `- mục` / `1. mục` (danh sách) · `{red}đỏ{/}` `{orange}` `{yellow}` `{green}` (hoặc `{đỏ}` `{cam}` `{vàng}` `{xanh}`) · `{big}..{/}` `{small}..{/}`. Chỉ có **hai cỡ** chữ. |
| `auto_emphasis` | `red` / `orange` / `yellow` / `green` (hoặc `true` = đỏ): **tự đổi màu + đậm** cho con số (29°C, 75%, 15:30) và chữ đã in đậm. Nhận ra số theo hình dạng, không theo danh sách từ khoá. |
| `emoji` | Chọn trong bảng hoặc gõ emoji bất kỳ: chèn vào đầu tin. Mã `:ok:` `:canhbao:` … trong chữ cũng đổi thành emoji. |
| `auto_emoji` | Tự thêm một emoji hợp ngữ cảnh vào đầu từng dòng chưa có (cảnh báo, lỗi, xong, nhiệt độ, cửa, đèn…). Bảng nhỏ, bảo thủ, mặc định tắt. |

```yaml
service: zalo_call.send_message
data: {thread_id: "123456789012345678", type: user, message: "Nhiệt độ 29°C, cửa mở lúc 15:30", auto_emphasis: red, auto_emoji: true}
```

`add_reaction` có bảng chọn 54 biểu tượng (`like`, `heart`, `haha`, `wow`, `cry`, `angry`…). **AI tự trả lời:** trên thiết bị có ô *AI: định dạng chữ trả lời* (mặc định `markdown`), *AI: tự nhấn mạnh số…* (mặc định `off`) và công tắc *AI tự thêm emoji* (mặc định tắt).

## Máy yếu (Raspberry Pi, NAS nhỏ)

- **Docker:** khối compose ở trên đã có trần RAM (512 MB), CPU (1,5 lõi), số tiến trình và xoay vòng nhật ký, để một cuộc gọi lỗi không làm cả máy đầy RAM/đĩa. Máy 1 GB RAM thì hạ `mem_limit` xuống `384m`.
- **Add-on (HAOS):** Supervisor không cho đặt trần RAM/CPU cho từng add-on, nên dựa vào hai việc: tự dọn tài nguyên sau mỗi cuộc gọi (đã làm) và các núm giảm tải dưới đây.
- **Giảm hình:** đặt video 480x270, 10 khung/giây, 200 kbps (`/api/settings/devices` của app, mục `video`: `width`, `height`, `fps`, `bitrate_kbps`).
- **Camera: chọn luồng phụ (sub), không phải luồng chính.** Đo thật cùng một camera, ffmpeg giải mã + thu nhỏ: luồng chính ≈ **40%** một lõi, luồng phụ ≈ **16%**. Với go2rtc, dùng tên luồng phụ (ví dụ `phong-khach-sub`).

## Cần biết

- Cổng **8080 chỉ để trong LAN**, đừng mở ra Internet. Bản sao lưu HA chứa **phiên Zalo** — giữ kín.
- Add-on **mới đóng gói**, chưa kiểm hết trên HAOS thật; lỗi thì gửi Nhật ký. Chưa gọi nhóm có hình.
- Mã nguồn: <https://github.com/TriTue2011/Zalo-calling>
