# Zalo Bot

Chạy `zalo-server` (Node.js, dùng thư viện `zca-js`) như một add-on của Home
Assistant, để tự động hoá gửi và nhận tin nhắn Zalo cá nhân.

## Phiên bản và cập nhật

Phiên bản add-on hiện tại là **2026.8.24.1**. Cập nhật trong **Settings →
Add-ons → Zalo Bot → Update** — nhớ bật **Re-pull image**, không thì Supervisor
dùng lại image cũ — rồi khởi động lại add-on. Cookie đăng nhập, webhook và proxy
nằm trong `data_directory`, nên việc cập nhật **không** bắt quét lại mã QR nếu
vẫn dùng cùng thư mục dữ liệu.

Nếu dùng kèm tích hợp HACS, nên cập nhật luôn repo `TriTue2011/zalo_bot`
(**2026.8.23.4** trở lên) rồi khởi động lại Home Assistant. Hai phần được phát
hành độc lập.

> **Nâng từ 2026.8.22.1 trở về trước:** bản 2026.8.23.1 sửa một lỗi khiến
> add-on tự xoá cookie đăng nhập khi mạng chập chờn. Nếu bạn đang gặp cảnh
> "tự nhiên mất phiên, phải quét QR lại", thì đây là nguyên nhân. Lần cập nhật
> này bạn vẫn phải quét QR **một lần** nếu cookie đã mất, sau đó thì không nữa.

## Add-on làm gì và cần gì

Add-on chạy một máy chủ Node.js (`zca-js`) giữ phiên đăng nhập **Zalo cá nhân**
— tài khoản Zalo thật của bạn, không phải Zalo OA. Nó phơi ra một REST API để
gửi/nhận tin, và đẩy sự kiện tới webhook.

Nó **không** tự làm gì với Home Assistant. Muốn có entity và service trong HA
thì cài thêm tích hợp `TriTue2011/zalo_bot` qua HACS; tích hợp đó gọi ngược lại
API của add-on này.

Zalo **chỉ cho một kết nối trên mỗi tài khoản**. Đăng nhập cùng một tài khoản ở
nơi thứ hai là nơi thứ nhất bị đá ra ngay, và nó rụng lặng lẽ — chỉ thấy trong
log dòng `Another connection is opened, closing this one`. Nếu bạn dựng một bản
để thử nghiệm, hãy dùng tài khoản Zalo khác.

## Biểu tượng

`icon.png` (256×256) và `logo.png` (470×256) lấy nguyên từ
`brands.home-assistant.io/zalo_bot/` — cùng bộ ảnh mà tích hợp HACS
`TriTue2011/zalo_bot` đang dùng, nên add-on và tích hợp hiện cùng một biểu
tượng trong giao diện Home Assistant.

Đổi biểu tượng thì thay hai tệp này trong thư mục add-on. Supervisor đọc chúng
lúc nạp danh sách add-on; nếu không thấy đổi thì bấm **Reload** ở trang
Add-on Store.

## Tuỳ chọn

| Tuỳ chọn | Bỏ trống thì sao |
|---|---|
| `data_directory` | Mặc định `/config/zalo_bot`. Nơi lưu cookie đăng nhập, webhook, proxy. |
| `session_secret` | Add-on tự sinh một khoá rồi giữ lại trong thư mục dữ liệu, nên phiên vẫn sống qua restart. Chỉ cần điền nếu muốn tự quản khoá hoặc dùng chung giữa nhiều nơi. |
| `admin_password` | Add-on sinh một mật khẩu ngẫu nhiên, giữ lại, và ghi ra tệp `THONG-TIN-DANG-NHAP.txt` ngay trong thư mục dữ liệu — mở bằng File editor hoặc Samba là thấy. Cũng in ra log mỗi lần khởi động. |
| `api_key` | Add-on tự sinh một khoá, giữ lại, và ghi vào `THONG-TIN-DANG-NHAP.txt`. Chỉ cần chép ra khi gọi thẳng API bằng REST command hay script. |

**Điền `admin_password` là ĐỔI được mật khẩu.** Đặt giá trị mới rồi khởi động lại
add-on: mật khẩu tài khoản `admin` được đặt lại đúng bằng giá trị đó — đây cũng là
cách vào lại khi lỡ quên. Chỉ áp khi giá trị **thay đổi**, nên khởi động lại nhiều
lần không tốn thêm gì.

Bỏ **trống** ô này thì add-on không đụng tới mật khẩu: bạn tự quản bằng chức năng
đổi mật khẩu trên giao diện, và mật khẩu đó giữ nguyên qua các lần khởi động.

## Trả lời cả tin của CHÍNH BẠN (khi bot chạy trên tài khoản của bạn)

Add-on đăng nhập bằng **chính tài khoản Zalo của bạn**. Vì thế mọi tin **bạn** tự gõ đều bị Zalo đánh dấu là tin *tự gửi* (`isSelf`). Mặc định add-on **không** đẩy tin tự gửi ra webhook — nếu đẩy, bên nhận (bot AI / n8n / automation) sẽ trả lời, câu trả lời lại là một tin tự gửi mới, rồi lại bị trả lời… thành **vòng lặp** bot tự nói chuyện với chính mình.

**Cách chính (khuyên dùng): đặt theo từng thread trên WebUI.** Mở add-on → nút **«Trả lời tin của tôi»** → thêm từng Thread ID, bật/tắt riêng và đặt **từ khóa riêng** cho mỗi thread (mặc định tắt). Lấy Thread ID ở trang **Theo dõi tin nhắn**. Khi bật:

- Tin **bạn** gõ **có chứa từ khóa** đó → được đẩy ra webhook, kèm cờ `self_reply: true`. Đây là lệnh của bạn.
- **Câu bot tự sinh** (câu trả lời) là văn xuôi **không** chứa từ khóa → **không** được đẩy → **không lặp**.

Nói cách khác, **chính từ khóa là chốt chống lặp**: chọn một từ mà bot sẽ không bao giờ tự nói ra trong câu trả lời (một ký hiệu như `@toi`, `//`, `#me` là an toàn).

### Nhiều tag cho nhiều đích đến

Ô từ khóa nhận **nhiều từ khóa**, cách nhau bằng dấu phẩy — ví dụ `@toi, @ha, @n8n`. Tin của bạn trúng **bất kỳ** từ khóa nào cũng được đẩy đi, và webhook mang thêm trường **`tag_khop`** cho biết vừa trúng tag nào:

```json
{ "isSelf": true, "self_reply": true, "tag_khop": "@n8n", "...": "..." }
```

`tag_khop` có mặt ở **cả hai chiều**: tin của bạn, và tin của người khác trong nhóm. Khác nhau ở chỗ tin của bạn **phải** trúng tag mới được đẩy đi (đó là chốt chống lặp), còn tin người khác thì luôn đẩy hết — trúng tag chỉ là để dán nhãn cho automation dễ rẽ.

Add-on **không** tự định tuyến: nó chỉ báo trúng tag nào, còn gửi đi đâu là việc của bên nhận. Làm vậy để chỉ có **một** nơi quyết định "ai trả lời cái gì", khỏi phải dò hai chỗ khi có sự cố.

Khớp **không phân biệt hoa thường** (gõ `@Ha` hay `@ha` đều trúng) và từ khóa **dài được thử trước**, nên khai cả `@n` lẫn `@n8n` thì `@n8n` vẫn trúng đúng của nó.

#### Automation mẫu — dán vào là chạy

Đổi ba chỗ: `webhook_id`, danh sách `thread_cho_phep`, và `account_selection`.

```yaml
alias: zalo bot
triggers:
  - trigger: webhook
    webhook_id: doi-thanh-id-cua-ban
    allowed_methods: [POST, PUT, GET, HEAD]
    local_only: false
conditions:
  # Chặn hai thứ: gói không phải tin nhắn (sự kiện nhóm, thu hồi, reaction —
  # không có `content`, đụng vào là Jinja ném lỗi), và thread ngoài danh sách.
  - condition: template
    value_template: >-
      {% set d = trigger.json.data | default({}, true) %}
      {% set thread_cho_phep = ['1234567890', '9876543210'] %}
      {{ d.content is string and d.content | trim
         and (trigger.json.threadId | string) in thread_cho_phep }}
actions:
  - variables:
      tag: "{{ trigger.json.tag_khop | default('', true) }}"
      # Cắt tag khỏi câu hỏi, không phân biệt hoa thường. Cắt bằng vị trí chứ
      # KHÔNG bằng regex: tag có thể chứa ký tự đặc biệt (`//`, `#me`, dấu
      # chấm…) làm hỏng mẫu regex, mà escape thì Home Assistant không có bộ lọc
      # sẵn. Bỏ luôn dấu hai chấm ngay sau tag nếu có ("@Ô Xin: câu hỏi").
      cau: >-
        {% set c = trigger.json.data.content %}
        {% set t = tag | lower %}
        {% set vt = (c | lower).find(t) if tag else -1 %}
        {% set con = (c[:vt] ~ c[vt + t | length:]) | trim if vt >= 0 else c %}
        {{ (con[1:] | trim if con.startswith(':') else con) | replace('  ', ' ') }}
      # Tin đang được trích dẫn: webhook mang sẵn quote.msg và quote.fromD.
      cau_hoi: >-
        {% set q = trigger.json.data.quote | default({}, true) %}
        {%- if q.msg is defined and q.msg -%}
        [Trích dẫn tin của {{ q.fromD | default('người khác', true) }}: "{{ q.msg }}"]
        {% endif -%}
        {{ cau }}
  - choose:
      # ── @n8n → đẩy sang n8n, không phiền tới AI ──────────────────────────
      - conditions: "{{ tag | lower == '@n8n' }}"
        sequence:
          - action: rest_command.goi_n8n
            data:
              cau_hoi: "{{ cau_hoi }}"
              thread_id: "{{ trigger.json.threadId }}"
      # ── còn lại (kể cả @ha, và tin người khác không tag) → trợ lý AI ─────
    default:
      - action: conversation.process
        data:
          text: "{{ cau_hoi }}"
          agent_id: conversation.trungdung
          conversation_id: "{{ trigger.json.threadId | string }}"
        response_variable: tra_loi
      - action: zalo_bot.send_message
        data:
          # Nhóm là 1, chat 1-1 là 0 — bám theo tin vừa nhận.
          type: "{{ trigger.json.type | default(0) | int }}"
          thread_id: "{{ trigger.json.threadId | string }}"
          account_selection: "+84xxxxxxxxx"
          message: >-
            {{ tra_loi.response.speech.plain.speech
               | default('Xin lỗi, tôi không hiểu.', true) }}
          # PHẢI ra đúng MỘT dòng, không thụt đầu. Home Assistant đọc lại chuỗi
          # này thành object; gặp dòng thụt là nó bỏ cuộc và giữ nguyên CHUỖI,
          # mà integration chỉ nhận object nên lặng lẽ bỏ qua — trích dẫn không
          # chạy và KHÔNG có lỗi nào để lần.
          quote: >-
            {{ {'content': trigger.json.data.content,
            'uidFrom': trigger.json.data.uidFrom | string,
            'cliMsgId': trigger.json.data.cliMsgId | string,
            'msgType': trigger.json.data.msgType} }}
# Nhóm đông người nhắn cùng lúc thì "single" bỏ tin thứ hai và chỉ ghi một cảnh
# báo vào log — nhìn từ ngoài y hệt bot lơ người ta.
mode: queued
max: 10
```

Ba chỗ hay sai, nói trước cho đỡ mất buổi:

1. **Cắt tag bằng `replace` là hỏng** — `replace` của Jinja phân biệt hoa thường, khai `@Ha` mà gõ `@ha` là tag còn nguyên trong câu hỏi, AI nhận cả cái tag vào câu. Cắt theo vị trí như trên thì không dính.
2. **`quote:` viết bằng khối `|` là hỏng** — chuỗi sinh ra có xuống dòng và dấu cách thụt đầu, Home Assistant không đọc lại thành object được nên gửi đi dạng chuỗi, và integration bỏ qua **không báo lỗi**. Phải dùng `>-` và viết sát lề như trên.
3. **`thread_id` phải là `threadId`, không phải `uidFrom`** — trong nhóm mà lấy `uidFrom` thì bot nhắn riêng cho người vừa hỏi thay vì trả lời vào nhóm.

Một tài khoản Zalo chỉ giữ được **một phiên đăng nhập** tại một thời điểm — bật add-on lên thì phiên bên gateway ChatGPT (c2a) rớt, và ngược lại. Nên với một tài khoản, hai hệ không bao giờ cùng nghe một nhóm, và bạn chỉ phải lo đúng một việc: **khai tag nào ở đây thì automation rẽ theo tag đó**.

⚠️ Chỉ khi bạn chạy **hai tài khoản Zalo khác nhau** — một trên add-on, một trên gateway — mà cả hai cùng ở trong một nhóm, thì mới cần bật «bắt buộc tag» cho thread đó trong tab **Lọc thread** của WeUI. Không bật thì thread chưa khai sẽ được gateway trả lời **mọi** tin của người khác, kể cả tin mang tag của n8n, thành hai câu trả lời cho một câu hỏi. (Tin của chính bạn thì không dính: gateway lọc tin tự gửi bằng ô từ khóa riêng của nó.)

**Với automation Home Assistant:** trigger theo trường `self_reply == true` để bắt đúng lệnh của bạn; đừng trigger theo `isSelf` trần, kẻo dính lại vòng lặp.

**Với gateway ChatGPT (c2a):** gateway có ô cài đặt riêng theo từng thread trong tab «Lọc thread» → dùng bên đó, không cần cấu hình gì ở add-on cho đường này.

Đặt xong nhớ **tăng version add-on** thì Home Assistant mới thấy bản mới (bản này đã là `2026.9.2.9`), rồi bấm **Cập nhật**.

## Kiểm tra add-on còn sống

`GET /api/health` trả về ngay, không cần đăng nhập và không chạm tới Zalo:

```json
{ "success": true, "status": "ok", "uptime": 3600, "accounts": 1 }
```

`config.yaml` đã khai `watchdog` trỏ vào đường này, nên Supervisor tự khởi động
lại add-on khi tiến trình treo. Image cũng có `HEALTHCHECK` cho ai chạy bằng
Docker thuần.

Trường `accounts` là số tài khoản Zalo đang đăng nhập. Bằng `0` nghĩa là chưa
quét QR, hoặc phiên đã mất.

## Ô nhật ký trống trơn, không thấy dòng nào

Không phải lỗi của add-on: đây là hỏng ở **máy chủ Home Assistant**, và khi nó
hỏng thì *mọi* ô nhật ký đều trắng — add-on, Supervisor, lẫn hệ thống. Chỉ gặp
trên bản **Home Assistant Supervised** (cài trên Debian/Armbian…), không gặp
trên Home Assistant OS.

Dấu hiệu chắc chắn: trong nhật ký Supervisor (nếu còn xem được bằng dòng lệnh)
lặp đi lặp lại hai câu

```
Unable to connect to systemd-journal-gatewayd
Failed to get supervisor logs using advanced_logs API
```

### Bẫy: nhìn thì thấy vẫn chạy

Kiểm bằng `systemctl` sẽ thấy dịch vụ **active (listening)** và tệp socket vẫn
nằm nguyên chỗ, nên rất dễ kết luận là lành rồi đi tìm chỗ khác. Thật ra socket
đã chết từ lúc nào đó, systemd chỉ đang tưởng nó còn sống.

Muốn biết thật thì hỏi xem có ai **đang lắng nghe** hay không:

```bash
ss -lx | grep -i journal
```

Trong danh sách phải có dòng `/run/systemd-journal-gatewayd.sock`. Không thấy
tức là hỏng, dù `systemctl status` nói gì đi nữa.

### Chữa — phải đủ hai bước

```bash
# 1. Dựng lại socket của journal gateway
systemctl stop systemd-journal-gatewayd.service
systemctl restart systemd-journal-gatewayd.socket

# 2. TẠO LẠI container Supervisor (không phải chỉ khởi động lại)
docker container rm --force hassio_supervisor
systemctl restart hassio-supervisor
```

Bước 2 là chỗ hay bị bỏ sót và cũng là lý do nhiều người chữa mãi không xong.
Container Supervisor gắn tệp socket **theo đường dẫn**, mà Docker chốt tệp ngay
lúc **tạo** container. Dựng lại socket ở bước 1 sinh ra một tệp mới, còn
container vẫn ôm tệp cũ đã chết — nên `ha supervisor restart` hay
`docker restart hassio_supervisor` đều **không** ăn thua, buộc phải xoá rồi tạo
lại. Ảnh Supervisor có sẵn trên máy nên không cần mạng, và **Home Assistant Core
không bị ảnh hưởng**, vẫn chạy suốt.

### Xác nhận đã thông

```bash
docker exec hassio_supervisor curl -s -o /dev/null -w '%{http_code}\n' \
  --unix-socket /run/systemd-journal-gatewayd.sock http://localhost/machine
```

Phải ra `200`. Sau đó ba lệnh này đều có chữ:

```bash
ha host logs
ha supervisor logs
ha addons logs 36f3bad2_zalo_bot     # đổi slug cho đúng add-on của bạn
```

Lúc thử bằng `curl`, **đừng dùng `?follow`** — nó phát liên tục nên treo tới hết
giờ rồi trả về `000`, làm tưởng vẫn hỏng trong khi đã thông. Dùng `/machine`.

## Cần biết về bảo mật

Add-on chạy với `host_network: true`, nghĩa là cổng 3000 nằm thẳng trên mạng của
máy Home Assistant. **Đừng để cổng này ra Internet.**

Nhóm API Zalo — `/api/sendmessage`, `/api/findUser`, `/api/getUserInfo`,
`/api/createGroup` — đóng ngay từ lần chạy đầu, vì add-on tự sinh `api_key` nếu
bạn để trống. Chúng đòi header `Authorization: Bearer <api_key>` hoặc phiên đăng
nhập admin.

Khoá **chỉ nhận qua header**, không nhận `?api_key=…` trên URL. Query string đi
vào access log của mọi proxy trên đường, vào lịch sử trình duyệt, và vào header
`Referer` khi trang tải tài nguyên bên ngoài — ba chỗ bạn không kiểm soát được.

Đăng nhập cấp một mã phiên **mới** thay vì dùng lại mã đang có, nên mã phiên bị
biết trước không trở thành phiên có quyền sau khi bạn đăng nhập.

Bản trước bỏ trống nghĩa là mở cho mọi máy trong mạng, và tài liệu bảo người
dùng tự chạy `openssl rand -hex 32` — đòi hỏi vô lý với người cài qua giao diện,
nên phần lớn sẽ bỏ qua và ở nguyên trạng thái mở.

Khoá này cố ý chỉ cấp quyền **gửi nội dung** (tin, ảnh, tệp, video, sticker).
Đọc lịch sử chat, tra người dùng, tạo và sửa nhóm, kết bạn đều phải đăng nhập
bằng tài khoản admin.

## Giới hạn tài nguyên và phản hồi thường gặp

Gateway có các chốt an toàn để một request lỗi không chiếm hết RAM hoặc ổ đĩa:

| Tình huống | Hành vi |
|---|---|
| JSON request lớn hơn 2 MB | Gateway từ chối trước khi route xử lý. |
| Album vượt 24 ảnh hoặc tổng 100 MB | Trả HTTP `413`; không tải toàn bộ album xuống đĩa. |
| Video upload quá 180 giây | Trả HTTP `504`; tệp tạm chỉ bị xoá sau khi upload nền thực sự kết thúc. |
| Đĩa không ghi được lịch sử nhóm | Trả cache cũ hoặc rỗng thay vì làm endpoint lỗi `500`; việc ghi sẽ thử lại nền. |

Khi chạy Docker, có thể chỉnh các giới hạn dành cho môi trường đặc biệt bằng
biến `IMAGE_BATCH_MAX_ITEMS`, `IMAGE_BATCH_MAX_BYTES`,
`VIDEO_UPLOAD_TIMEOUT_MS` và `RECONNECT_LOGIN_TIMEOUT_MS`. Chỉ tăng chúng khi
đã xác nhận máy đủ RAM, ổ đĩa và băng thông.

ID người dùng, nhóm và tin nhắn Zalo được giữ ở dạng **chuỗi** để không mất chữ
số cuối với ID lớn. Ngược lại, ID poll, sticker album và quick message của
`zca-js` là số nguyên an toàn; gửi giá trị sai kiểu sẽ bị từ chối thay vì gọi
SDK với dữ liệu đã bị làm tròn.

## Chạy bằng Docker, không qua Home Assistant

Cùng một image dùng được cho cả hai đường. Ngoài Home Assistant thì không có
`/data/options.json`, nên `entrypoint.sh` bỏ qua phần đọc tuỳ chọn và **mọi thứ
lấy từ biến môi trường**.

```yaml
services:
  zalobot:
    image: ghcr.io/tritue2011/zalobot:latest
    container_name: zalobot
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Nơi lưu cookie đăng nhập, webhook, proxy. Không đặt thì mặc định
      # /app/data — nhớ gắn volume vào đúng chỗ đó, kẻo quét lại QR sau mỗi
      # lần dựng lại container.
      DATA_DIRECTORY: /app/data
      PORT: "3000"
      # Ba giá trị dưới đây tương ứng ba ô tuỳ chọn của add-on. Ý nghĩa và hậu
      # quả khi bỏ trống: xem bảng ở đầu tài liệu này.
      SESSION_SECRET: "doi-thanh-chuoi-ngau-nhien-dai"
      ZALO_SERVER_ADMIN_PASSWORD: "doi-thanh-mat-khau-manh"
      ZALO_SERVER_API_KEY: "doi-thanh-khoa-ngau-nhien-dai"
    volumes:
      - ./zalobot-data:/app/data
```

Sinh chuỗi ngẫu nhiên: `openssl rand -hex 32`.

Biến môi trường luôn **được ưu tiên hơn** tuỳ chọn trong `options.json`, nên nếu
chạy dạng add-on mà vẫn muốn ghi đè bằng env thì cũng được.

Không mở cổng 3000 ra Internet. Đây là cổng quản trị một tài khoản Zalo thật.

## API hay dùng

Mọi đường dưới đây đòi `Authorization: Bearer <api_key>` (hoặc phiên admin), trừ
`/api/health`. Thân request là JSON.

| Đường | Việc |
|---|---|
| `POST /api/sendMessageByAccount` | Gửi tin chữ |
| `POST /api/sendImageToUserByAccount` · `…ToGroupByAccount` | Gửi một ảnh |
| `POST /api/sendImagesToUserByAccount` · `…ToGroupByAccount` | Gửi album nhiều ảnh |
| `POST /api/sendFileByAccount` | Gửi tệp |
| `POST /api/sendVideoByAccount` · `sendVoiceByAccount` | Gửi video / ghi âm |
| `POST /api/sendStickerByAccount` | Gửi sticker |
| `GET  /api/accounts` | Danh sách tài khoản đang đăng nhập (cần phiên admin) |
| `GET  /api/health` | Còn sống không (công khai) |

Danh sách đầy đủ nằm ở trang `/list` của giao diện web.

**ID Zalo phải là chuỗi.** Chúng vượt quá `Number.MAX_SAFE_INTEGER` của
JavaScript, nên viết `"threadId": "1234567890123456789"` — bỏ dấu nháy là mất
chữ số cuối mà không có lỗi nào báo.

### Tin tự xoá sau vài phút

Zalo **không** có tin tự huỷ ngắn hạn. Hai cơ chế nó có:

| Cơ chế | Thực tế |
|---|---|
| `ttl` theo từng tin | Gửi lên được, nhưng Zalo **bỏ qua**. Đo thật 23/08/2026: năm mốc từ 1 phút tới 7 ngày, không tin nào tự xoá |
| Auto-delete cả cuộc trò chuyện | Chạy thật, nhưng chỉ có **0 / 1 ngày / 7 ngày / 14 ngày** |

Nên add-on tự làm: gửi tin có `ttl` thì nó hẹn giờ, hết giờ **tự thu hồi**.

```json
{ "message": "mã OTP là 123456", "threadId": "…",
  "accountSelection": "…", "ttl": 300000 }
```

Phản hồi cho biết đã hẹn được hay chưa:

```json
"messageTtl": { "requested": 300000, "applied": true,
                "scope": "auto-undo", "expiresAt": "…" }
```

**Ba điều phải biết:**

- Thu hồi **để lại dòng "Tin nhắn đã được thu hồi"**. Nội dung mất, nhưng người
  nhận biết có tin đã bị rút. Không giống tin tự huỷ thật.
- TTL dưới khoảng 10 giây có thể không kịp: add-on phải chờ Zalo dội tin về mới
  có `cliMsgId` — thứ mà lệnh thu hồi bắt buộc phải có.
- Danh sách chờ ghi xuống `message-expiry.json` trong thư mục dữ liệu và nạp lại
  lúc khởi động, nên cập nhật add-on giữa chừng không làm tin kẹt lại vĩnh viễn.

`ttl` nhận số mili-giây hoặc lời tắt: `1h`…`24h`, `1d`, `7d`, `14d`, `off`.
Giá trị không hiểu được thì trả `400`, không im lặng bỏ qua.

### Tự xoá cho cả cuộc trò chuyện

`POST /api/updateAutoDeleteChatByAccount` — đây là cơ chế **của Zalo**, xoá sạch
không để lại dấu vết, nhưng chỉ nhận bốn mốc:

| `ttl` | Nghĩa |
|---|---|
| `0` | Tắt |
| `86400000` | 1 ngày |
| `604800000` | 7 ngày |
| `1209600000` | 14 ngày |

Mốc khác trả `400`. Bản trước đẩy thẳng giá trị thô lên và Zalo im lặng bỏ qua,
nên đặt "5 phút" trông như thành công mà thực ra không có gì xảy ra.

### Định dạng chữ

Zalo cá nhân nhận **style theo khoảng ký tự**, không phải markdown. Gửi kèm
trường `styles` bên cạnh `msg`:

```json
{
  "message": {
    "msg": "Nhiệt độ 29°C",
    "styles": [{ "start": 9, "len": 5, "st": "f_18,c_db342e,b" }]
  },
  "threadId": "...",
  "accountSelection": "..."
}
```

Mã style zca-js hiểu:

| Mã | Nghĩa |
|---|---|
| `b` · `i` · `u` · `s` | đậm · nghiêng · gạch chân · gạch ngang |
| `f_18` · `f_13` | to · nhỏ — **chỉ có hai cỡ này** |
| `c_db342e` `c_f27806` `c_f7b503` `c_15a85f` | đỏ · cam · vàng · xanh lá |
| `lst_1` · `lst_2` | danh sách chấm đầu dòng · đánh số |
| `ind_10` … `ind_40` | thụt lề bốn cấp |

`start` và `len` tính theo **đơn vị UTF-16**, tức emoji đếm là 2. Đừng dùng
`f_20` — Zalo không biết mã đó, gửi lên coi như không có.

Không muốn tự tính khoảng thì dùng tích hợp HACS: nó nhận markdown quen thuộc
(`**đậm**`, `# tiêu đề`) rồi tự quy ra `styles`.

## Nâng cấp từ bản 2025.10.8

Dữ liệu và tài khoản đang có được giữ nguyên, không phải quét lại QR. Ba thay
đổi có thể khiến bạn thấy khác:

- Không còn tài khoản mặc định `admin` / `admin`. Cài mới sẽ sinh mật khẩu ngẫu
  nhiên, ghi ra `THONG-TIN-DANG-NHAP.txt` trong thư mục dữ liệu và in ra log.
  Bản đã cài từ trước giữ nguyên tài khoản cũ.
- Không còn khoá phiên cố định đoán được. Bỏ trống `session_secret` thì add-on
  tự sinh một khoá riêng cho máy này và giữ lại, nên vẫn không phải đăng nhập
  lại sau mỗi lần khởi động.
- Endpoint đặt lại mật khẩu quản trị nay đòi quyền admin, và các endpoint gỡ lỗi
  chỉ bật khi khai biến môi trường tương ứng.

## Có gì mới ở 2026.8.23

**Sửa lỗi làm mất phiên Zalo**

- Vòng kiểm tra sức khoẻ 10 phút/lần **thôi xoá cookie** khi `fetchAccountInfo`
  hỏng. Trước đây mạng rớt vài giây là cookie bị xoá vĩnh viễn, phải quét QR
  lại. Nay nó chỉ quan sát và ghi log; việc phục hồi để cho cơ chế reconnect lo.
- Khôi phục phiên lúc khởi động **tắt fallback QR** và truyền lại proxy đã lưu
  trong credential. Trước đây cookie hỏng thì add-on lặng lẽ mở một phiên đăng
  nhập QR không ai nhìn, ba lần cho mỗi tài khoản, rồi vẫn kết luận cookie hỏng.

**Chạy êm hơn**

- Băm mật khẩu chuyển sang bất đồng bộ. Bản cũ dùng `pbkdf2Sync` chặn toàn bộ
  event loop — đo trên máy ARM là **3,4 giây mỗi lần đăng nhập**, và trong lúc
  đó add-on không nhận được tin Zalo nào.
- Gỡ `sharp`: image nhẹ đi và không cần trình biên dịch lúc dựng.
- Ghi nốt lịch sử nhóm khi tắt, thay vì mất phần còn trong bộ đệm.

**Chặt hơn**

- Khoá API thôi nhận qua query string.
- Đăng nhập cấp mã phiên mới (chống session fixation).
- Thêm `/api/health` cùng `watchdog` và `HEALTHCHECK`.

## Có gì mới ở 2026.8.24

- **Tin tự xoá sau vài phút** — add-on tự thu hồi khi hết giờ, vì Zalo bỏ qua
  `ttl` theo từng tin và auto-delete của nó không có mốc nào dưới một ngày.
  Xem mục "Tin tự xoá sau vài phút" ở trên.
- **`sendMessageByAccount` nay đọc `ttl`.** Trước đây nó bỏ qua hoàn toàn, nên
  gọi bằng REST command theo đúng tài liệu này thì TTL rơi mất im lặng.
- **Tắt được tự xoá cuộc trò chuyện.** `updateAutoDeleteChat` coi `ttl: 0` là
  thiếu tham số, mà 0 chính là "tắt" — nên bản cũ chỉ bật được, không tắt được.
- **Giá trị TTL sai bị từ chối bằng `400`** thay vì đẩy lên cho Zalo im lặng bỏ
  qua.
