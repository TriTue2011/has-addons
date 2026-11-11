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
Ghim phiên bản: đổi `:latest` thành `:2026.11.10.18`. Tên biến ↔ add-on: `ZALO_PC_APP_USER` = `username`, `ZALO_PC_APP_PASSWORD` = `password` (ở Docker là **bắt buộc**).

## Lỗi thường gặp

| Lỗi | Cách xử |
|---|---|
| Tích hợp báo «Không gọi được tới app» | Add-on chưa chạy, hoặc sai cổng 8080 |
| Video không có hình / nháy rồi mất | Đặt lại **Camera mặc định** (hoặc chọn *Hình kiểm tra* để thử) |
| Loa nhỏ | Tăng **Âm lượng cuộc gọi** |
| Tiếng bạn đứt khi nói chồng (loa R1) | R1 là nửa song công; muốn mic luôn mở: **Chống vọng = Song công**, R1 đặt **Động cơ xử lý âm thanh = nâng cao** |
| Tiếng không ra loa R1 | Tải lại tích hợp R1 |

## Cách dùng các dịch vụ

Mở **Công cụ nhà phát triển → Hành động**, gõ `zalo_call.` để chọn dịch vụ (mỗi trường có ô chọn). Người nhận là `thread_id` + `type` (`user` = 1-1, `group` = nhóm).
Lấy `thread_id`: dịch vụ `get_all_friends` / `get_all_groups` (kết quả trả về cho automation), hoặc mở WebUI của app → danh bạ.

### Gọi đi

```yaml
service: zalo_call.make_call
data:
  thread_id: "6643404425553198601"
  type: video                          # user = thoại 1-1 · video = video 1-1 · group = nhóm
  volume: 70                           # tuỳ chọn, 0-100: âm lượng loa lúc gọi, hết cuộc tự trả lại mức cũ
  speaker: media_player.loa_phong_khach   # tuỳ chọn; bỏ trống = ô «Loa mặc định» trên thiết bị Zalo Call
  mic: camera.phong_khach              # tuỳ chọn: tiếng từ camera hoặc loa R1 (Assist satellite) gửi sang điện thoại
  camera: camera.phong_khach           # tuỳ chọn (cuộc gọi video): hình gửi đi; bỏ trống = «Camera mặc định»
```

Điện thoại đổ chuông; nghe máy xong tiếng bên kia ra loa, mic loa/camera gửi sang họ. Kết thúc: `zalo_call.end_call` (cũng dùng để huỷ khi còn đổ chuông).
Đang gọi thoại muốn lên video: `zalo_call.upgrade_to_video` (xin bên kia, rồi phát camera đã chọn).

### Nhận cuộc gọi

Có người gọi tới tài khoản Zalo → HA bắn sự kiện **`zalo_call_call_state`** (cũng là cảm biến *Cuộc gọi* trên thiết bị). Trường `state`:
`incoming` (đang đổ chuông) · `ringing` (mình gọi, bên kia đang đổ chuông) · `answered` (đã nối) · `declined` · `no_answer` · `missed` · `rejected` · `ended` · `error`;
kèm `call_id`, `thread_id`, `peer`, `call_type`, `end_reason`. Nghe/từ chối bằng `zalo_call.answer_call` / `zalo_call.reject_call` (bỏ `call_id` nếu chỉ có một cuộc).

```yaml
automation:
  - alias: Zalo gọi đến → báo điện thoại, tự nghe sau 10 giây
    triggers:
      - trigger: event
        event_type: zalo_call_call_state
        event_data: {state: incoming}
    actions:
      - action: notify.mobile_app_dien_thoai
        data: {message: "Zalo gọi đến từ {{ trigger.event.data.peer }}"}
      - delay: 10
      - action: zalo_call.answer_call
        data: {volume: 60}
```

Công tắc trên thiết bị: *Tự phát mic khi nghe máy*, *Tự đồng ý khi bên kia xin gọi video*; ô *Chống vọng* (nếu loa R1 bị nhại tiếng: đặt **Song công** và R1 chọn engine **nâng cao**).

### Tin nhắn, tệp, ghi âm

| Việc | Dịch vụ | Ví dụ |
|---|---|---|
| Gửi chữ | `send_message` | `message: "Xin chào"` (định dạng/màu/emoji: mục dưới) |
| Gửi ảnh / tệp / video | `send_image` · `send_file` · `send_video` | `file: /config/www/anh.jpg` (đường dẫn trong thư mục cho phép, hoặc URL) |
| Gửi **tin thoại** | `send_voice` | `file: /config/www/loi-chao.mp3` (mp3/m4a/wav, tự đổi sang AAC); phản hồi có `voice_url` |
| Gửi liên kết có xem trước | `send_link` | `link: https://...`, `message: "xem nè"` |
| Sticker theo từ khoá | `send_sticker` | `keyword: "cảm ơn"`, `pick: random` |
| Thả cảm xúc / trả lời / thu hồi | `add_reaction` · `quote_message` · `undo_message` | `icon: heart` (bảng 54 biểu tượng), `msg_id`, `cli_msg_id` |
| Dịch bằng Zalo AI | `translate_message` | `msgId`, `threadId`, `srcLang: vi`, `desLang: en`, `text` (thử thật với `en`, `ko`) |
| Giọng nói → chữ (STT) | `voice_to_text` | `voiceUrl:` đường dẫn tin thoại **nhận từ người khác**; kết quả ở sự kiện `zalo_call_voice_to_text` (`req_id`, `text`) |
| Đọc nhóm | `get_group_chat_history`, `get_all_groups` | trả dữ liệu cho automation (`response_variable`) |

`msg_id` / `cli_msg_id` lấy từ phản hồi lúc gửi hoặc từ sự kiện **`zalo_call_message`** (tin đến: `content`, `thread_id`, `thread_type`, `is_self`…).

**Gửi tin có TTS của HA thành tin thoại:** tạo tệp âm thanh bằng `tts.speak`/`tts.google_translate_say` ra `/config/www/`, rồi `zalo_call.send_voice` với `file:` trỏ tới tệp đó.

## Định dạng chữ: cỡ chữ, màu, đậm, nghiêng, gạch chân, tiêu đề

Zalo cá nhân có **hai cỡ chữ** (nhỏ, to), **bốn màu** (đỏ, cam, vàng, xanh lá), đậm, nghiêng, gạch chân, gạch ngang và danh sách. Zalo Call cho cài đặt kiểu chữ **một lần trên thiết bị**
(áp cho mọi tin tích hợp gửi, kể cả trả lời của AI) và **ghi đè từng tin** ở dịch vụ `send_message`. Mỗi mục có thêm chế độ **`auto`**: tự định dạng theo nội dung chữ.

### Cài đặt mặc định (thiết bị Zalo Call → nhóm *Cấu hình*)

| Ô trên thiết bị | Giá trị | Ý nghĩa |
|---|---|---|
| **Chữ: cỡ chữ** | `off` · `small` · `big` · `auto` | `small`/`big`: cả tin nhỏ/to. `auto`: tiêu đề to, dòng nằm trọn trong ngoặc `(…)` nhỏ |
| **Chữ: màu chữ** | `off` · `auto` · `red` · `orange` · `yellow` · `green` | Màu cố định cho cả tin. `auto`: chỉ **con số** (29°C, 75%, 15:30, 10/11) được tô màu «màu dùng cho chế độ auto» |
| **Chữ: in đậm** | `off` · `on` · `auto` | `on`: cả tin. `auto`: con số |
| **Chữ: in nghiêng** | `off` · `on` · `auto` | `on`: cả tin. `auto`: đoạn trong `"…"` `“…”` `‘…’` hoặc `(…)` |
| **Chữ: gạch chân** | `off` · `on` · `auto` | `on`: cả tin. `auto`: liên kết `http(s)://…` và địa chỉ email |
| **Chữ: tiêu đề dòng đầu** | `off` · `on` · `auto` | `on`: dòng đầu thành **to + đậm**. `auto`: chỉ khi tin có nhiều dòng, dòng đầu ≤ 60 ký tự và **không** kết thúc bằng dấu câu (`. ! ? … , ;`); dòng ngắn kết thúc bằng `:` thành đề mục (đậm) |
| **Chữ: màu dùng cho chế độ auto** | `red` · `orange` · `yellow` · `green` | Màu của «màu chữ = auto» (mặc định `red`) |
| **Chữ: AI trả lời tự định dạng trong cùng lượt** | công tắc (mặc định **bật**) | Mức 1 bên dưới: AI tự định dạng khi trả lời, không chậm thêm |
| **Chữ: dùng AI đánh giá khi gửi send_message** | công tắc (mặc định tắt) | Mức 3 bên dưới: nhờ trợ lý đánh giá ngữ cảnh cho các mục `auto` (thêm vài giây) |
| **Chữ: trợ lý AI dùng cho chế độ auto** | chọn trợ lý hội thoại | Nên chọn trợ lý nhỏ/nhanh; Không = trợ lý của AI trả lời |
| **Chữ: tự thêm emoji (auto)** | công tắc **bật / tắt** | Bật: mọi tin tích hợp gửi tự có một emoji hợp ngữ cảnh ở đầu từng dòng chưa có emoji (xem mục Emoji). Mặc định tắt |

Mặc định mọi mục là `off` (tin gửi đi như cũ). Quy tắc `auto` dựa trên **hình dạng** của chữ (số, dấu ngoặc, liên kết, dấu câu), không dựa danh sách từ khoá.

### `auto` hoạt động thế nào: nhanh hay theo ngữ cảnh

Mục đích của `auto` là **tự đánh giá ngữ cảnh** để chọn màu, cỡ chữ, đậm/nghiêng, tiêu đề và emoji cho hợp. Có ba mức, **mặc định không làm chậm tin nhắn**:

| Mức | Khi nào | Tốc độ |
|---|---|---|
| **1. AI tự định dạng trong cùng lượt** | Câu trả lời của **AI tự trả lời** (mặc định bật, công tắc *Chữ: AI trả lời tự định dạng trong cùng lượt*): tích hợp nhúng một chỉ dẫn ngắn vào chính câu hỏi gửi trợ lý, trợ lý vừa trả lời vừa tự chọn đậm, màu, tiêu đề, emoji theo nội dung | **Không chậm thêm** (cùng một lần gọi) |
| **2. Quy tắc tức thì** | Mọi tin còn lại, và khi trợ lý quên định dạng: `auto` dùng quy tắc theo hình dạng chữ ở bảng trên (số, ngoặc, liên kết, dấu câu) | **Tức thì** |
| **3. Nhờ AI đánh giá riêng** (tuỳ chọn) | `send_message` có mục `auto` hoặc `auto_emoji`, và bật công tắc *Chữ: dùng AI đánh giá khi gửi send_message* hoặc `ai_style: true` | **Thêm vài giây** (một lần gọi trợ lý; quá 8 giây thì bỏ, dùng mức 2). Tin dưới 24 ký tự bỏ qua |

Mức 3: trợ lý hội thoại của HA đọc tin rồi đánh dấu định dạng + emoji theo ngữ cảnh (cảnh báo → đỏ, thành công → xanh lá, đề mục, nhấn mạnh…).
**Có kiểm soát:** trợ lý chỉ được chèn định dạng và emoji; app **chỉ nhận khi chữ gốc không bị đổi** (thêm/bớt/sửa một chữ là bỏ cả đánh dấu của AI và dùng mức 2). Lỗi hoặc quá giờ cũng quay về mức 2, tin vẫn gửi bình thường.
Muốn nhanh hơn nữa: chọn ở ô *Chữ: trợ lý AI dùng cho chế độ auto* một trợ lý **nhỏ/nhanh** (Không = dùng trợ lý của AI trả lời, rồi trợ lý mặc định của HA). Mức 3 tốn thêm token của trợ lý.

Các mục để giá trị cố định (`on`, `small`, `big`, một màu cụ thể…) luôn được áp chắc chắn, không qua AI. Công tắc **Chữ: tự thêm emoji** cũng theo ba mức trên:
bật cho câu trả lời của AI thì AI tự chọn emoji; tin do người dùng **tự gắn emoji** rồi gửi thì giữ nguyên, các dòng đã có emoji không bị thêm nữa.

### Ghi đè từng tin: `zalo_call.send_message`

Các trường tương ứng (đều tuỳ chọn; **bỏ trống = theo mặc định trên thiết bị**, có điền = ghi đè cho tin này):

| Trường dịch vụ | Tương ứng ô thiết bị |
|---|---|
| `font_size` | cỡ chữ |
| `text_color` | màu chữ |
| `bold` · `italic` · `underline` · `heading` | in đậm · nghiêng · gạch chân · tiêu đề |
| `auto_emoji` | công tắc tự thêm emoji (`true` / `false`) |
| `ai_style` | `true` / `false`: nhờ AI đánh giá ngữ cảnh cho tin này (mức 3) hay dùng quy tắc tức thì; bỏ trống = theo công tắc |
| `auto_color` | màu dùng cho chế độ auto |

```yaml
# Mặc định trên thiết bị: tiêu đề = auto, màu chữ = auto. Tin này thêm: số in đậm, không tô màu.
service: zalo_call.send_message
data:
  thread_id: "6643404425553198601"
  type: user
  message: |
    Báo cáo nhà hôm nay
    Nhiệt độ 29°C, độ ẩm 75% lúc 15:30
    Chi tiết: https://example.com
  bold: auto            # con số in đậm
  text_color: off       # ghi đè «màu chữ = auto» của thiết bị, tin này không tô màu
```

Kết quả: dòng đầu **to + đậm** (tiêu đề auto), `29°C`, `75%`, `15:30` in đậm, liên kết giữ nguyên.

### Thứ tự ưu tiên

1. **Đánh dấu tường minh trong chữ** (markdown, thẻ màu) luôn thắng: cỡ và màu mặc định/auto **không đè** lên chỗ đã có cỡ hoặc màu.
2. **Trường của dịch vụ** `send_message` ghi đè **cài đặt mặc định** trên thiết bị.
3. **Cài đặt mặc định** trên thiết bị (áp cả cho trả lời của AI tự trả lời).

### Đánh dấu tay trong chữ (`format: markdown`)

| Viết | Ra |
|---|---|
| `**đậm**` · `*nghiêng*` · `__gạch chân__` · `~~gạch ngang~~` | đậm · nghiêng · gạch chân · gạch ngang |
| `# Tiêu đề` | to + đậm |
| `- mục` · `1. mục` | danh sách chấm · đánh số |
| `{red}đỏ{/}` `{orange}` `{yellow}` `{green}` (hoặc `{đỏ}` `{cam}` `{vàng}` `{xanh}`) | màu |
| `{big}to{/}` · `{small}nhỏ{/}` | cỡ chữ (chỉ hai cỡ) |
| `\*` | ký tự `*` nguyên văn |

Có thể kết hợp với `auto_emphasis` (tự tô số và chữ đậm), `emoji`, `zalo_emoji`, `auto_emoji`: xem mục tiếp.

### Emoji

| Trường | Làm gì |
|---|---|
| `emoji` | Chọn trong bảng 35 biểu tượng hoặc gõ emoji bất kỳ: chèn vào đầu tin. Mã `:ok:` `:canhbao:`… trong chữ cũng đổi thành emoji |
| `zalo_emoji` | Emoji **của Zalo** (heart, haha, wow, cry…): chèn mã (`/-heart`, `:>`…) vào đầu tin, Zalo hiện thành ảnh emoji như trong bảng emoji của ô chat |
| `auto_emoji` | `true` / `false`: bật / tắt tự thêm emoji **cho tin này**, ghi đè công tắc *Chữ: tự thêm emoji* trên thiết bị (bỏ trống = theo công tắc). Mỗi dòng chưa có emoji được thêm một emoji hợp ngữ cảnh (cảnh báo, lỗi, xong, nhiệt độ, cửa, đèn…); bảng nhỏ, bảo thủ |
| `auto_emphasis` | `red`/`orange`/`yellow`/`green` hoặc `true`: tô màu + in đậm con số và chữ đã in đậm (gần giống «màu chữ = auto» kèm «in đậm = auto», nhưng chọn được màu ngay ở đây) |

Sticker: `zalo_call.send_sticker` với `keyword: "cảm ơn"` (và `pick: random`) tự tìm rồi gửi. Thả cảm xúc lên một tin: `zalo_call.add_reaction` với `icon: heart` (bảng 54 biểu tượng).

**Trả lời của AI tự trả lời:** dùng cùng cài đặt mặc định ở trên, cộng thêm ô *AI: định dạng chữ trả lời* (mặc định `markdown`, để dấu `**` của AI thành chữ đậm thật), và *AI: tự nhấn mạnh số…*. Công tắc *Chữ: tự thêm emoji* cũng áp cho trả lời của AI.

## Cuộc gọi: tự nghe máy, thông báo bằng giọng nói, AI nói chuyện

**Tự nghe máy cuộc gọi đến** (mặc định TẮT). Nghe máy là mở mic nhà cho người gọi, nên chỉ ID Zalo nằm trong danh sách mới được tự nghe; danh sách trống = không ai.
Trên thiết bị: công tắc **«Tự nghe máy khi có người gọi đến»**, số **«Chờ trước khi tự nghe máy»** (bộ đếm, giây; 0 = ngay) và ô **«Tự nghe máy chỉ với các ID Zalo này»** (cách nhau dấu phẩy). WebUI → Thiết bị có đủ ba ô. Người gọi cúp trước khi hết bộ đếm thì không nghe.
(Khác với «Tự đồng ý khi bên kia xin gọi video»: cài đặt đó chỉ trả lời lời xin chuyển sang video của cuộc gọi ĐÃ nghe máy.)

**Thông báo bằng giọng nói khi gọi đi** — `make_call` có thêm `message` (câu đọc bằng TTS của HA ngay khi người nhận nghe máy), `repeat` (1-3 lần), `hangup_after` (mặc định cúp máy sau khi đọc), `tts_engine`, `language`:

```yaml
action: zalo_call.make_call
data:
  thread_id: "6643404425553198601"
  message: "Cảnh báo: có người vừa ngã ở phòng khách. Hãy kiểm tra ngay."
  repeat: 2
```

`zalo_call.say_in_call` đọc một câu lên cuộc gọi đang nói (`message`, `call_id` tuỳ chọn, `wait`).

**AI nói chuyện trong cuộc gọi** (STT → trợ lý → TTS bằng Assist pipeline của HA): thêm `ai: true` vào `make_call` hoặc `answer_call`, hoặc bật công tắc **«AI nghe và trả lời bằng giọng nói trong cuộc gọi đến»** (áp cho cuộc gọi ĐẾN do app **tự nghe máy**, để AI trực điện thoại; ô **«Câu chào đầu cuộc gọi của AI»** đặt lời chào; người thật nghe máy thì AI không chen vào). AI nghe tiếng người gọi, trả lời bằng giọng của pipeline, giữ ngữ cảnh giữa các lượt; kết thúc khi người gọi cúp, im lặng hai lượt liền hoặc sau 10 phút (rồi cúp máy). Ví dụ gọi báo ngã rồi cho AI xử lý tiếp:

```yaml
action: zalo_call.make_call
data:
  thread_id: "6643404425553198601"
  message: "Phát hiện có người ngã ở phòng khách. Bạn có ổn không?"
  ai: true
```

Cần Assist pipeline có STT, TTS và trợ lý hội thoại. **Lưu ý an toàn:** AI làm được mọi việc mà trợ lý Assist được phép (kể cả điều khiển thiết bị); đừng cấp cho trợ lý này quyền với khoá cửa, bếp, bình nóng lạnh khi cho AI trực điện thoại. Tính năng này mới được kiểm bằng test giả lập (chưa nhiều cuộc gọi thật): nếu gặp lỗi, xem log `custom_components.zalo_call.call_voice`. Tiếng nói của app phát lên cuộc gọi qua đường mic nên **thay nguồn mic** trong lúc đang đọc.

**Các trường hợp nhận cuộc gọi đã xử lý:** sự kiện `request` lặp lại cùng `call_id` chỉ tính một lần (trước đây có thể làm cuộc đang nói bị đặt lại thành «đang chuông»); có cuộc gọi thứ hai đến khi đang nói hoặc đang gọi đi thì **từ chối cuộc mới** (không đè cuộc đang sống), ghi `busy_rejected` và vẫn báo HA như cuộc nhỡ.

## Dùng bằng giọng nói qua Assist (không cần automation hay prompt)

Tích hợp tự đăng ký một **LLM API tên «Zalo Call»** (như «TriTue Music» của custom YouTube). Bạn chỉ cần: **Cài đặt → Trợ lý giọng nói → chọn trợ lý hội thoại dùng LLM** (OpenAI, Google, Ollama, local OpenAI-compatible…) → ở mục điều khiển, **tích chọn «Zalo Call»** cạnh «Assist». Lời dặn nằm sẵn trong API, không phải viết prompt. (Trợ lý mặc định của HA không dùng LLM nên không có mục này.)

Rồi nói với Assist (điện thoại, loa R1…), ví dụ:
- «Gọi cho Đại ca» · «Gọi video cho Đại ca» · «Nhắn tin cho nhóm AI học hỏi là tối nay họp lúc 8 giờ»
- «Ai đang gọi vậy?» · «Nghe máy đi» · «Từ chối cuộc gọi này» · «Cúp máy»
- «Gọi cho Đại ca báo có người vừa ngã ở phòng khách, nếu họ cần giúp thì chuyển máy trực tiếp» (thông báo bằng giọng, AI nói chuyện tiếp, tự chuyển sang trực tiếp khi cần)
- «Tiếp quản cuộc gọi» (dừng AI đang trực điện thoại, bạn nói chuyện trực tiếp)

Tên được tìm trong danh bạ Zalo không cần dấu; có nhiều người trùng tên thì trợ lý liệt kê đánh số và hỏi lại trước khi gọi.

**An toàn:** trong cuộc gọi do AI giữ (người bên ngoài đang nói), trợ lý chỉ thấy **một** công cụ là «chuyển sang trực tiếp». Người lạ nói qua điện thoại không sai khiến được AI gọi điện, nhắn tin hay cúp máy khác. Công cụ «chuyển sang trực tiếp» cũng là cách AI tự chuyển (ngoài dấu `[[CHUYEN_MAY]]`), nên không cần dặn thêm.

## Phạm vi dữ liệu của AI khi người ngoài gọi vào

Giọng nói **không xác thực được ai**, và dặn trong prompt chỉ là lớp mềm (người gọi có thể nói khéo để lách). Giới hạn thật nằm ở **trợ lý được dùng cho cuộc gọi**, vì quyền xem/điều khiển thiết bị là quyền của trợ lý đó:

1. **Tạo một trợ lý hội thoại riêng cho điện thoại** (ví dụ thêm một mục OpenAI/Ollama thứ hai tên «Lễ tân») và **đừng tích «Assist»** cho nó (không quyền thiết bị, không đọc trạng thái nhà). Trên thiết bị Zalo Call chọn nó ở ô **«AI trong cuộc gọi: trợ lý RIÊNG cho người gọi chưa tin cậy»**. Pipeline chỉ nghe (STT) rồi câu hỏi đi thẳng tới trợ lý này; nó chỉ biết những gì bạn cho vào prompt của chính nó (ví dụ giờ giấc, lời nhắn) và công cụ «chuyển sang trực tiếp».
2. **Người tin cậy (gia đình):** điền ID Zalo vào **«AI trong cuộc gọi: ID Zalo tin cậy»** và (tuỳ chọn) chọn **«trợ lý cho người tin cậy»** (ví dụ trợ lý có Assist để hỏi trạng thái nhà). Người **trong danh bạ nhưng không có trong danh sách này vẫn là người chưa tin cậy**: danh bạ không phải ranh giới bảo mật. Vì giọng nói có thể bị nhái hoặc điện thoại bị mượn, **đừng cấp cho trợ lý này quyền khoá cửa, bếp, bình nóng lạnh.**
3. **Chưa chọn trợ lý riêng:** AI dùng trợ lý của Assist pipeline và chỉ còn **lời dặn mềm** («người gọi chưa được xác thực: không tiết lộ thông tin gia đình/thiết bị, chỉ ghi nhận lời nhắn»). Cách này **không đảm bảo** nếu trợ lý đó có quyền thiết bị — hãy làm bước 1 trước khi bật «AI nghe và trả lời trong cuộc gọi đến».

Ngoài ra, trong cuộc gọi do AI giữ, LLM API «Zalo Call» chỉ để lộ công cụ «chuyển sang trực tiếp» (không thể gọi điện, nhắn tin hay cúp máy khác).

## Bảng các trường hợp cuộc gọi

**Gọi đi** (tài khoản Zalo của app gọi cho người khác, `make_call`):

| Trường hợp | Điều xảy ra |
|---|---|
| Người nhận nghe máy | state `answered`: loa/mic nhà nối ngay; có `message` thì đọc rồi cúp; có `ai` thì AI nói chuyện |
| Người nhận từ chối | state `declined` |
| Không ai nghe (hết giờ đổ chuông) | state `no_answer`, app tự huỷ cuộc gọi |
| Bạn huỷ khi đang đổ chuông / cúp khi đang nói | `end_call` → `ended` (`user_end`) |
| Người nhận cúp giữa chừng | `ended` (`peer_ended`) |
| Người nhận xin chuyển sang video | tự đồng ý sau bộ đếm nếu bật «Tự đồng ý khi bên kia xin gọi video» |
| Đúng lúc đó người nhận gọi lại cho bạn | cuộc gọi đến bị từ chối vì đang bận, cuộc gọi đi giữ nguyên |
| Zalo từ chối yêu cầu gọi | state `error` kèm lý do |

**Gọi đến** (người khác gọi vào tài khoản Zalo của app):

| Trường hợp | Điều xảy ra |
|---|---|
| Mặc định (không bật tự nghe) | đổ chuông, state `incoming`; bạn `answer_call` hoặc `reject_call`; người gọi cúp thì `missed` |
| Bật tự nghe, người gọi có trong danh sách | sau bộ đếm tự nghe, `answer_source = auto`, loa/mic nhà nối trực tiếp |
| Bật tự nghe, người gọi KHÔNG có trong danh sách | đổ chuông như mặc định |
| Người gọi cúp trước khi hết bộ đếm | `missed`, không nghe |
| Tự nghe + công tắc «AI trong cuộc gọi đến» | AI chào, nghe, trả lời; kết thúc khi người gọi cúp, im lặng 2 lượt hoặc 10 phút (rồi cúp máy) |
| …và AI thấy cần người thật (khẩn cấp / người gọi muốn gặp người nhà) | AI tự chuyển sang trực tiếp: dừng AI, nối mic nhà, không cúp, sự kiện `zalo_call_ai_handover` |
| Có cuộc thứ hai đến khi đang nói / đang gọi đi | từ chối cuộc mới (`busy_rejected`), cuộc đang sống giữ nguyên, vẫn báo HA như cuộc nhỡ |
| Zalo gửi lại sự kiện cuộc gọi đến | bỏ qua (mỗi cuộc chỉ xử lý một lần) |
| Hai cuộc đến liên tiếp, chưa nghe cuộc nào | cuộc mới thay cuộc cũ |
| Cuộc gọi nhóm đến, giữ máy (hold) | **chưa hỗ trợ** (chỉ ghi log) |

**Chọn thiết bị Assist có sẵn (như Assist Cam, Assist Phicomm R1):** ở ô **«AI trong cuộc gọi: dùng Assist của thiết bị»** chọn một thiết bị Assist. Cuộc gọi dùng đúng pipeline mà thiết bị đó đang chọn (STT, TTS, trợ lý đã cấu hình sẵn) và đọc thông báo bằng giọng của nó, nên không phải cấu hình thêm gì. Có thể chọn riêng cho từng cuộc gọi bằng trường `assist_device` của `make_call`/`answer_call`; `tts_engine`/`pipeline_id` nêu rõ trong dịch vụ thì thắng. Lưu ý: trợ lý của pipeline đó thường có quyền thiết bị (nó phục vụ cả nhà) — với người gọi chưa tin cậy hãy chọn thêm «trợ lý RIÊNG…» (xem mục phạm vi dữ liệu): nó thay trợ lý của pipeline, còn STT/TTS vẫn là của thiết bị đã chọn.

**AI tự chuyển sang trực tiếp (không cần bấm tay):** trong cuộc gọi, trợ lý được dặn rằng khi người gọi muốn gặp người trong nhà, có việc khẩn cấp/nguy hiểm hoặc nó không giúp được thì nói ngắn gọn «mình chuyển máy» và kết thúc bằng dấu `[[CHUYEN_MAY]]` (dấu này **không** được đọc ra). Khi thấy dấu đó: AI đọc nốt câu rồi dừng, mic nhà được nối lại (loa/mic nhà vốn đã nối từ lúc nghe máy), cuộc gọi **không bị cúp**, và HA bắn sự kiện `zalo_call_ai_handover` (`call_id`, `heard` = câu cuối người gọi nói) để automation báo cho bạn. Thêm điều kiện riêng bằng ô **«AI tự chuyển sang trực tiếp khi…»** hoặc trường `handover_rule` của `make_call`/`answer_call`, ví dụ cho cuộc gọi báo ngã: `handover_rule: "Nếu người nghe nói cần giúp, nói không ổn hoặc không trả lời rõ ràng."` Cách này chạy với mọi trợ lý hội thoại (không cần trợ lý hỗ trợ gọi công cụ); trợ lý không làm theo chỉ dẫn thì cuộc gọi vẫn kết thúc như bình thường.

**Tự nghe máy rồi muốn tự nói chuyện trực tiếp:**
- Tự nghe **không AI**: cuộc gọi đã trực tiếp ngay (loa/mic nhà nối từ lúc nghe máy), không cần làm gì thêm.
- Tự nghe **có AI**: AI tự chuyển khi cần (xem trên), hoặc bạn bấm nút **«Tiếp quản cuộc gọi (dừng AI, nối mic nhà)»** trên thiết bị hoặc gọi `zalo_call.take_over_call`. AI dừng ngay (không cúp máy), mic nhà được trả về nguồn mặc định và cuộc gọi tiếp tục để bạn nói trực tiếp. Trong lúc AI nói chuyện, loa nhà vẫn phát tiếng người gọi nên bạn nghe được và biết lúc nào cần tiếp quản (ví dụ tạo automation gửi thông báo «AI đang nghe cuộc gọi từ X» kèm nút này).

## WebUI: mọi dịch vụ đều làm được trên tab «Dịch vụ»

Tab **Dịch vụ** của WebUI liệt kê **toàn bộ** dịch vụ (dịch vụ gốc + các API mở rộng của zca-js, gom theo nhóm) và có ô **Tìm dịch vụ**. Chọn thread ở ô «Thread thao tác» rồi bấm **Chạy**:

- **Gửi tin** (`send_message`): đủ cỡ chữ, màu chữ, in đậm, nghiêng, gạch chân, tiêu đề (mỗi mục có chế độ *auto*), emoji, emoji Zalo, tự thêm emoji, tự nhấn mạnh số. Cùng bảng lựa chọn với dịch vụ trong HA.
- **Gửi tệp / ảnh / video / ghi âm / liên kết**: chọn tệp ngay trên trang.
- **Sticker**: nhập Sticker ID hoặc chỉ cần *từ khoá* (tự tìm rồi gửi; `pick: random` để chọn ngẫu nhiên).
- **Tài khoản, webhook, mã QR, danh bạ**: nút xem/đặt/xoá tương ứng.
- **API mở rộng (hơn 200 API)**: mỗi API một form; trường `threadId`/`groupId`/`type` để trống thì lấy từ thread đang chọn; API cần tham số phức tạp thì dán JSON vào ô `params`. API nguy hiểm (xoá, rời nhóm…) có hộp xác nhận.
- Chỉ **không áp dụng**: gửi danh thiếp (`send_card`, app chưa có đường gửi) và proxy theo tài khoản (app chạy một tài khoản); hai loại này hiện lý do thay vì form.

Một test (`tests/test_app_js_all_services.js`) bắt buộc mọi dịch vụ trong danh mục phải có dòng form/nút, nên thêm dịch vụ mới mà quên WebUI thì CI đỏ.

## Bình chọn nhóm: lọc người chưa bình chọn, xoá khỏi nhóm (WebUI)

Mở WebUI của app (`http://<IP>:8080`) → mục **Bình chọn nhóm**:

1. Chọn **nhóm** → **Tải bình chọn**: hiện các bình chọn của nhóm (câu hỏi, mở/đóng, số người đã chọn). Mặc định tick các bình chọn **đang mở**; bình chọn **ẩn danh** không có danh sách người chọn nên không dùng được.
2. Chọn cách lọc rồi **Hiện người chưa bình chọn**:
   - *không bình chọn cuộc nào* (mặc định, an toàn nhất), *bỏ sót ít nhất một cuộc*, hoặc *bình chọn ít hơn N cuộc*.
   - Bình chọn cho chọn nhiều phương án thì ai có tên ở bất kỳ phương án nào đều tính là đã trả lời.
3. Tick người cần xoá, rồi **Xoá người đã chọn** hoặc **Xoá toàn bộ người chưa bình chọn** (xoá từng đợt tối đa 10 người, cách nhau 1,5 giây, có nút **Dừng**). Cả hai đều bắt bạn **gõ đúng số người** để xác nhận. Xoá **không hoàn tác được**.

An toàn: **trưởng nhóm, phó nhóm và chính tài khoản Zalo này không bao giờ nằm trong danh sách** (hiện ở mục «Được giữ lại»). Mỗi lần xoá, máy chủ **tính lại** danh sách từ dữ liệu mới nhất và chỉ xoá ID nằm trong đó. Nhóm lớn mà danh sách thành viên chưa đủ thì chỉ cho xem, không cho xoá.
Cần là **trưởng nhóm hoặc phó nhóm** thì Zalo mới cho xoá người; không đủ quyền thì từng người báo lỗi.

Gọi bằng API (cùng đăng nhập app): `GET /api/group/<id>/polls`, `POST /api/group/<id>/poll_non_voters` (`poll_ids`, `mode`: `none`/`any`/`min`, `min_votes`),
`POST /api/group/<id>/remove_members` (thêm `confirm: true` và `member_ids` hoặc `all: true`).

## Máy yếu (Raspberry Pi, NAS nhỏ)

- **Docker:** khối compose ở trên đã có trần RAM (512 MB), CPU (1,5 lõi), số tiến trình và xoay vòng nhật ký, để một cuộc gọi lỗi không làm cả máy đầy RAM/đĩa. Máy 1 GB RAM thì hạ `mem_limit` xuống `384m`.
- **Add-on (HAOS):** Supervisor không cho đặt trần RAM/CPU cho từng add-on, nên dựa vào hai việc: tự dọn tài nguyên sau mỗi cuộc gọi (đã làm) và các núm giảm tải dưới đây.
- **Giảm hình:** đặt video 480x270, 10 khung/giây, 200 kbps (`/api/settings/devices` của app, mục `video`: `width`, `height`, `fps`, `bitrate_kbps`).
- **Camera: chọn luồng phụ (sub), không phải luồng chính.** Đo thật cùng một camera, ffmpeg giải mã + thu nhỏ: luồng chính ≈ **40%** một lõi, luồng phụ ≈ **16%**. Với go2rtc, dùng tên luồng phụ (ví dụ `phong-khach-sub`).

## Cần biết

- Cổng **8080 chỉ để trong LAN**, đừng mở ra Internet. Bản sao lưu HA chứa **phiên Zalo** — giữ kín.
- Add-on **mới đóng gói**, chưa kiểm hết trên HAOS thật; lỗi thì gửi Nhật ký. Chưa gọi nhóm có hình.
- Mã nguồn: <https://github.com/TriTue2011/Zalo-calling>
