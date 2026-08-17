# Zalo Bot

Chạy `zalo-server` (Node.js, dùng thư viện `zca-js`) như một add-on của Home
Assistant, để tự động hoá gửi và nhận tin nhắn Zalo cá nhân.

## Tuỳ chọn

| Tuỳ chọn | Bỏ trống thì sao |
|---|---|
| `data_directory` | Mặc định `/config/zalo_bot`. Nơi lưu cookie đăng nhập, webhook, proxy. |
| `session_secret` | Mỗi lần khởi động lại sinh khoá mới, nên **ai đang đăng nhập sẽ bị đá ra**. Điền một chuỗi ngẫu nhiên dài để phiên sống qua restart. |
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

## Nâng cấp từ bản 2025.10.8

Dữ liệu và tài khoản đang có được giữ nguyên, không phải quét lại QR. Ba thay
đổi có thể khiến bạn thấy khác:

- Không còn tài khoản mặc định `admin` / `admin`. Cài mới sẽ sinh mật khẩu ngẫu
  nhiên in ra log. Bản đã cài từ trước giữ nguyên tài khoản cũ.
- Không còn khoá phiên cố định. Chưa đặt `session_secret` thì phải đăng nhập lại
  sau mỗi lần khởi động add-on.
- Endpoint đặt lại mật khẩu quản trị nay đòi quyền admin, và các endpoint gỡ lỗi
  chỉ bật khi khai biến môi trường tương ứng.
