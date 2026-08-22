# Zalo Bot

Chạy `zalo-server` (Node.js, dùng thư viện `zca-js`) như một add-on của Home
Assistant, để tự động hoá gửi và nhận tin nhắn Zalo cá nhân.

## Phiên bản và cập nhật

Phiên bản add-on hiện tại là **2026.8.22.1**. Cập nhật trong **Settings →
Add-ons → Zalo Bot → Update**, sau đó khởi động lại add-on. Cookie đăng nhập,
webhook và proxy nằm trong `data_directory`, nên việc cập nhật **không** bắt
quét lại mã QR nếu vẫn dùng cùng thư mục dữ liệu.

Nếu dùng kèm tích hợp HACS, nên cập nhật luôn repo `TriTue2011/zalo_bot` rồi
khởi động lại Home Assistant. Hai phần được phát hành độc lập, nhưng bản HACS
mới có kiểm tra kiểu ID tương ứng với gateway mới.

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

## Cần biết về bảo mật

Add-on chạy với `host_network: true`, nghĩa là cổng 3000 nằm thẳng trên mạng của
máy Home Assistant. **Đừng để cổng này ra Internet.**

Nhóm API Zalo — `/api/sendmessage`, `/api/findUser`, `/api/getUserInfo`,
`/api/createGroup` — đóng ngay từ lần chạy đầu, vì add-on tự sinh `api_key` nếu
bạn để trống. Chúng đòi header `Authorization: Bearer <api_key>` hoặc phiên đăng
nhập admin.

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
