# ✈️ Telegram Calling

Cổng Telegram cho Home Assistant: đăng nhập **tài khoản Telegram phụ**, nhắn tin, gọi
thoại/video, đẩy sự kiện về HA.

> ⚠️ **Dùng tài khoản phụ**, không dùng tài khoản chính. Một tài khoản chỉ đăng nhập ở **một nơi**
> (không chạy cùng lúc ở module web2api `telegram-user`).
> ⚠️ **Bản xem trước (0.x):** gateway chạy và có test; tích hợp HA «Telegram Call» (HACS) đang hoàn thiện, gọi thật chưa kiểm hết.

## Thêm nhanh vào Home Assistant

| Bước | Nút |
|---|---|
| ① Thêm kho add-on | [![Thêm kho add-on](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTriTue2011%2Fhas-addons) |
| ② Mở tích hợp trong HACS | [![Mở trong HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=TriTue2011&repository=Telegram-calling&category=integration) |
| ③ Thêm tích hợp (sau khi tải + khởi động lại HA) | [![Thêm tích hợp](https://my.home-assistant.io/badges/config_flow_start.svg)](https://my.home-assistant.io/redirect/config_flow_start/?domain=telegram_call) |

**Làm tay (HACS 2.x):** HACS → **⋮ → Custom repositories** → `https://github.com/TriTue2011/Telegram-calling`, **Type = Integration** → **Add** → **Download** → khởi động lại HA.

## 1. Lấy thông số Telegram (làm một lần)

Cần **`api_id`** và **`api_hash`** — chìa khoá để app của bạn nói chuyện với Telegram.

1. Vào <https://my.telegram.org>, nhập số điện thoại (tài khoản phụ) → nhập mã Telegram gửi về.
2. Chọn **API development tools**.
3. Điền **App title** và **Short name** (tuỳ ý, ví dụ `HA Gateway`), **Platform** chọn *Desktop*, để trống URL → **Create application**.
4. Chép **App api_id** (một số) và **App api_hash** (chuỗi 32 ký tự). **Giữ bí mật `api_hash`.**

## 2. Add-on (HAOS / Supervised)

1. **Cài đặt → Add-on → Cửa hàng → ⋮ → Kho lưu trữ** → `https://github.com/TriTue2011/has-addons` → cài **Telegram Calling**.
2. Tab **Cấu hình**:

   | Tuỳ chọn | Điền gì |
   |---|---|
   | `api_id` | Số **App api_id** ở bước 1 |
   | `api_hash` | Chuỗi **App api_hash** ở bước 1 |
   | `gateway_token` | **Bỏ trống** = tự sinh, in ra tab **Nhật ký** |
   | `ha_webhook_url` | Tuỳ chọn, bỏ trống cũng được |

3. **Khởi động**. Nhật ký in `token cho tích hợp Telegram Call = …` — chép token này.
4. **Mở WebUI** (`http://<IP HA>:3333/ui/`), dán token → **Kết nối**, rồi **thêm tài khoản**:
   số điện thoại → mã OTP (→ mật khẩu 2 lớp nếu có), hoặc quét QR.

![Kết nối WebUI](img/ket-noi.png)

> Chưa điền `api_id`/`api_hash` thì Nhật ký báo gateway đang chạy **giả lập** (chưa đăng nhập thật được).

## 3. Docker

Tạo thư mục `telegram-calling/` với hai tệp:

**`docker-compose.yml`**

```yaml
services:
  telegram-calling:
    image: ghcr.io/tritue2011/telegram-calling:latest
    container_name: telegram-calling
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
      - "127.0.0.1:3333:3333"   # HA ở máy khác: "IP_LAN_CỦA_MÁY:3333:3333" + firewall chỉ cho IP của HA
    volumes:
      - ./data:/data            # phiên Telegram nằm ở đây, giữ kín
    environment:
      GATEWAY_TOKEN: ${GATEWAY_TOKEN}
      TELEGRAM_API_ID: ${TELEGRAM_API_ID}
      TELEGRAM_API_HASH: ${TELEGRAM_API_HASH}
      GATEWAY_MOCK: "0"         # 0 = chạy thật; bỏ dòng này (hoặc để 1) = giả lập
      # VIDEO_PROFILE: "low"    # máy yếu: hình 480x270, 10 khung/giây (mặc định normal = 640x360, 15)
```

**`.env`** (`chmod 600 .env`)

```
# sinh bằng: openssl rand -hex 32
GATEWAY_TOKEN=
# số App api_id ở bước 1
TELEGRAM_API_ID=
# chuỗi App api_hash ở bước 1
TELEGRAM_API_HASH=
```

```sh
docker compose up -d                          # chạy
docker compose logs -f                        # xem nhật ký
docker compose pull && docker compose up -d   # cập nhật
```

Mở `http://<máy>:3333/ui/`, dán `GATEWAY_TOKEN`, thêm tài khoản như bước 2.4.
Ghim phiên bản: đổi `:latest` thành `:0.4.1`. Tên biến ↔ add-on: `TELEGRAM_API_ID` = `api_id`, `TELEGRAM_API_HASH` = `api_hash`, `GATEWAY_TOKEN` = `gateway_token` (ở Docker là **bắt buộc**; add-on tự sinh nếu bỏ trống).

## 4. Nối với Home Assistant và gọi

1. Tải tích hợp **Telegram Call** bằng nút ② ở trên, khởi động lại HA, rồi nút ③ **Thêm tích hợp**.
2. Điền **Địa chỉ gateway** `http://<IP máy>:3333` và **Token gateway**.
   > **Token gateway là gì?** Mật khẩu chung giữa gateway và tích hợp HA (không liên quan Telegram). Add-on: lấy ở tab **Nhật ký** (hoặc ô `gateway_token`).
   > Docker: chuỗi `GATEWAY_TOKEN` bạn đặt trong `.env`.
3. Gọi bằng **@tên đăng nhập** của người nhận (hoặc `+84…`, hoặc ID số):

   ```yaml
   service: telegram_call.make_call
   data: {peer: "@ten_dang_nhap", video: true}
   ```

   Số điện thoại chỉ gọi được khi người đó cho phép tìm bằng số. Họ cũng phải cho phép **cuộc gọi từ bạn** (Telegram → Quyền riêng tư → Cuộc gọi).

## Cách dùng các dịch vụ

Mở **Công cụ nhà phát triển → Hành động**, gõ `telegram_call.` để chọn dịch vụ. Người nhận là `chat_id` (số; âm = nhóm/kênh) **hoặc** `peer` (`@username`, `+số điện thoại`, ID số).
Không biết ID: `get_contacts` (lọc theo tên) hoặc `find_chat`, rồi lấy `id` trong kết quả.

### Gọi đi

```yaml
service: telegram_call.make_call
data:
  peer: "@ten_dang_nhap"               # hoặc user_id: 123456789, hoặc "+84912345678"
  video: true                          # false = thoại
  volume: 70                           # tuỳ chọn, 0-100: âm lượng loa lúc gọi (hết cuộc tự trả lại)
  speaker: media_player.loa_r1         # tuỳ chọn; bỏ trống = ô «Loa mặc định» trên thiết bị Telegram Call (loa R1 / camera Imou-Dahua)
  mic: camera.phong_khach              # tuỳ chọn: tiếng gửi sang người nhận (camera, loa R1) hoặc mic_url: rtsp://...
  camera: camera.phong_khach           # tuỳ chọn (video): hình gửi đi
```

Người nhận phải cho phép cuộc gọi từ bạn (Telegram → Quyền riêng tư → Cuộc gọi). Kết thúc: `telegram_call.hangup_call`.

### Nhận cuộc gọi

Có người gọi tài khoản Telegram → sự kiện **`telegram_call_call_state`** (và cảm biến *Cuộc gọi*). `state`:
`incoming` · `ringing` · `connecting` · `answered` · `ended` · `not_answered` · `missed` · `error`; kèm `call_id`, `user_id`, `outgoing`, `video`, `seconds`, `error`
(cùng tên trạng thái với `zalo_call_call_state`, nên một automation dùng được cho cả hai). Nghe máy: `telegram_call.answer_call` (bỏ `call_id` nếu chỉ có một cuộc đang đổ chuông).

```yaml
automation:
  - alias: Telegram gọi đến → báo điện thoại, tự nghe sau 10 giây
    triggers:
      - trigger: event
        event_type: telegram_call_call_state
        event_data: {state: incoming, outgoing: false}
    actions:
      - action: notify.mobile_app_dien_thoai
        data: {message: "Telegram gọi đến (ID {{ trigger.event.data.user_id }})"}
      - delay: 10
      - action: telegram_call.answer_call
```

Loa, mic, camera, âm lượng mặc định đặt ngay trên thiết bị **Telegram Call** (ô chọn *Loa mặc định*, *Mic*, *Camera*, *Âm lượng cuộc gọi*), `make_call`/`answer_call` chỉ cần ghi đè khi muốn khác.

### Nhắn tin và nhận tin

| Việc | Dịch vụ | Ví dụ |
|---|---|---|
| Gửi chữ | `send_message` | `message: "*Cảnh báo:* cửa mở"`, `format: markdown`, `reply_to: 123` |
| Gửi ảnh / video / âm thanh / tệp | `send_photo` · `send_video` · `send_audio` · `send_file` | `file: /config/www/anh.jpg` (thư mục cho phép, URL hoặc `media-source://`), `caption: "..."` |
| Gửi tin thoại | `send_voice` | `file: /config/www/loi.mp3` (tự đổi ogg/opus) **hoặc** `message: "Xin chào"` để gateway đọc thành giọng (chỉ người dùng) |
| Sửa · xoá · chuyển tiếp · thả emoji · đã đọc | `edit_message` · `delete_message` · `forward_message` · `add_reaction` · `mark_read` | `message_id: 123`, `emoji: "🔥"` |
| Đọc | `get_history` · `get_chats` · `find_chat` · `get_contacts` | trả dữ liệu cho automation (`response_variable`) |
| Dịch | `translate_text` | `text: "Xin chào"`, `to_language: en` |
| Tải tệp đính kèm về | `download_file` | `file_id` (từ sự kiện), `path: /config/www/nhan.jpg` |

**Nhận tin:** sự kiện **`telegram_call_message`** (`chat_id`, `message_id`, `sender`, `kind`, `text`, `file_id`…) và cảm biến *Tin nhắn gần nhất*; ví dụ trả lời tự động:

```yaml
automation:
  - alias: Telegram: nhắn "đèn" thì bật đèn và trả lời
    triggers:
      - trigger: event
        event_type: telegram_call_message
    conditions:
      - "{{ trigger.event.data.text | lower == 'đèn' }}"
    actions:
      - action: light.turn_on
        target: {entity_id: light.phong_khach}
      - action: telegram_call.send_message
        data: {chat_id: "{{ trigger.event.data.chat_id }}", message: "Đã bật đèn", reply_to: "{{ trigger.event.data.message_id }}"}
```

## Máy yếu (Raspberry Pi, NAS nhỏ)

- **Docker:** khối compose ở trên đã có trần RAM (512 MB), CPU (1,5 lõi), số tiến trình và xoay vòng nhật ký, để một cuộc gọi lỗi không làm cả máy đầy RAM/đĩa. Máy 1 GB RAM thì hạ `mem_limit` xuống `384m`.
- **Add-on (HAOS):** Supervisor không cho đặt trần RAM/CPU cho từng add-on, nên dựa vào hai việc: tự dọn tài nguyên sau mỗi cuộc gọi (đã làm) và các núm giảm tải dưới đây.
- **Giảm hình:** tuỳ chọn add-on `video_profile = low` (hoặc `VIDEO_PROFILE=low` ở Docker): 480x270, 10 khung/giây thay cho 640x360, 15.
- **Camera: chọn luồng phụ (sub), không phải luồng chính.** Đo thật cùng một camera, ffmpeg giải mã + thu nhỏ: luồng chính ≈ **40%** một lõi, luồng phụ ≈ **16%**. Với go2rtc, dùng tên luồng phụ (ví dụ `phong-khach-sub`).

## Cần biết

- Cổng **3333 chỉ để trong LAN** (có token), đừng mở ra Internet. Bản sao lưu HA chứa **phiên Telegram** — giữ kín.
- Mất khoá dữ liệu = phải đăng nhập lại. Flood-wait của Telegram được tôn trọng (đợi theo số giây Telegram báo).
- Chi tiết kỹ thuật (REST, sự kiện): <https://github.com/TriTue2011/Telegram-calling>
