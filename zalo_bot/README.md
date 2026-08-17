# Zalo Bot

Chạy `zalo-server` (Node.js, dùng thư viện `zca-js`) như một add-on của Home
Assistant, để tự động hoá gửi và nhận tin nhắn Zalo cá nhân.

## Tuỳ chọn

| Tuỳ chọn | Bỏ trống thì sao |
|---|---|
| `data_directory` | Mặc định `/config/zalo_bot`. Nơi lưu cookie đăng nhập, webhook, proxy. |
| `session_secret` | Add-on tự sinh một khoá rồi giữ lại trong thư mục dữ liệu, nên phiên vẫn sống qua restart. Chỉ cần điền nếu muốn tự quản khoá hoặc dùng chung giữa nhiều nơi. |
| `admin_password` | Lần chạy đầu server **sinh mật khẩu ngẫu nhiên và in ra log add-on đúng một lần**. Mở tab Log để lấy, rồi đăng nhập và đổi. |
| `api_key` | **Các API gửi tin vẫn mở cho mọi máy trong mạng LAN.** Xem mục dưới. |

Đổi `admin_password` sau khi đã có tài khoản thì **không** đổi mật khẩu đang
dùng — giá trị này chỉ áp dụng lúc tạo `users.json` lần đầu. Muốn đổi thì đăng
nhập rồi dùng chức năng đổi mật khẩu.

## Cần biết về bảo mật

Add-on chạy với `host_network: true`, nghĩa là cổng 3000 nằm thẳng trên mạng của
máy Home Assistant. **Đừng để cổng này ra Internet.**

Khi chưa đặt `api_key`, một nhóm API Zalo vẫn mở không cần đăng nhập — trong đó
có `/api/sendmessage`, `/api/findUser`, `/api/getUserInfo`, `/api/createGroup`.
Nghĩa là bất kỳ máy nào trong mạng cũng **gửi tin từ tài khoản Zalo của bạn**
được. Đặt `api_key` là đóng lại: từ lúc đó các API này đòi header
`Authorization: Bearer <api_key>` hoặc phiên đăng nhập admin.

Khoá này cố ý chỉ cấp quyền **gửi nội dung** (tin, ảnh, tệp, video, sticker).
Đọc lịch sử chat, tra người dùng, tạo và sửa nhóm, kết bạn đều phải đăng nhập
bằng tài khoản admin.

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
  nhiên in ra log. Bản đã cài từ trước giữ nguyên tài khoản cũ.
- Không còn khoá phiên cố định đoán được. Bỏ trống `session_secret` thì add-on
  tự sinh một khoá riêng cho máy này và giữ lại, nên vẫn không phải đăng nhập
  lại sau mỗi lần khởi động.
- Endpoint đặt lại mật khẩu quản trị nay đòi quyền admin, và các endpoint gỡ lỗi
  chỉ bật khi khai biến môi trường tương ứng.
