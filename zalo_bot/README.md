# Zalo Bot

Chạy `zalo-server` (Node.js, dùng thư viện `zca-js`) như một add-on của Home
Assistant, để tự động hoá gửi và nhận tin nhắn Zalo cá nhân.

## Phiên bản và cập nhật

Phiên bản add-on hiện tại là **2026.8.23.3**. Cập nhật trong **Settings →
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

## Tuỳ chọn

| Tuỳ chọn | Bỏ trống thì sao |
|---|---|
| `data_directory` | Mặc định `/config/zalo_bot`. Nơi lưu cookie đăng nhập, webhook, proxy. |
| `session_secret` | Add-on tự sinh một khoá rồi giữ lại trong thư mục dữ liệu, nên phiên vẫn sống qua restart. Chỉ cần điền nếu muốn tự quản khoá hoặc dùng chung giữa nhiều nơi. |
| `admin_password` | Add-on sinh một mật khẩu ngẫu nhiên, giữ lại, và ghi ra tệp `THONG-TIN-DANG-NHAP.txt` ngay trong thư mục dữ liệu — mở bằng File editor hoặc Samba là thấy. Cũng in ra log mỗi lần khởi động. |
| `api_key` | Add-on tự sinh một khoá, giữ lại, và ghi vào `THONG-TIN-DANG-NHAP.txt`. Chỉ cần chép ra khi gọi thẳng API bằng REST command hay script. |

Đổi `admin_password` sau khi đã có tài khoản thì **không** đổi mật khẩu đang
dùng — giá trị này chỉ áp dụng lúc tạo `users.json` lần đầu. Muốn đổi thì đăng
nhập rồi dùng chức năng đổi mật khẩu.

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
