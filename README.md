# 🔊 AI BOX Add-ons cho Home Assistant

## ❓ Nhóm Support:
- Zalo: https://zalo.me/g/alvkgn274
- Facebook: https://www.facebook.com/groups/aiboxvn

---

# Ai dùng Docker thì vào thư mục từng add-on sẽ có hướng dẫn riêng cho Docker

# Hướng Dẫn Thêm Kho Add-on cho Home Assistant

Kho add-on này chứa các tiện ích mở rộng cho thiết bị **AI BOX (Phicomm R1)** trên Home Assistant. Dưới đây là hướng dẫn từng bước để thêm kho repository vào Home Assistant của bạn.

## Bước 1: Mở Home Assistant

- Đăng nhập vào giao diện Home Assistant trên trình duyệt (ví dụ: `http://homeassistant.local:8123` hoặc địa chỉ IP của thiết bị chạy Home Assistant).

## Bước 2: Truy cập phần Add-on Store

- Nhấp vào **Settings** (Cài đặt) ở góc dưới bên trái.
- Chọn **Add-ons** → **Add-on Store**.

## Bước 3: Thêm Kho Repository

- Trong giao diện Add-on Store, nhấp vào biểu tượng **ba dấu chấm** (⋮) ở góc trên bên phải.
- Chọn **Repositories**.
- Dán đường dẫn sau vào ô nhập liệu:

```
https://github.com/TriTue2011/has-addons
```

- Nhấp **Add** để xác nhận.

## Bước 4: Cài đặt Add-on

- Sau khi thêm kho thành công, F5 lại trình duyệt rồi tìm tên add-on.
- Nhấp vào add-on bạn muốn cài đặt, sau đó nhấp **Install** (Cài đặt).
- Sau khi cài đặt, vào tab **Configuration** để cấu hình, sau đó nhấp **Start**.

---

## 📦 Danh sách Add-on

### 🌐 AI BOX WebSocket Bridge

WebSocket bridge cho phép điều khiển loa AI BOX (Phicomm R1) từ xa qua Cloudflare Tunnel. Hỗ trợ nhiều loa cùng lúc.

**Tính năng:**
- Route kết nối WebSocket đến đúng loa qua tham số `?ip=`
- Hỗ trợ 2 port: WS Control (18082) và Speaker (18080)
- IP whitelist bảo mật
- Dùng kết hợp với Cloudflare Tunnel và [AI BOX WebUI Card](https://github.com/TriTue2011/R1-card)

**Cấu hình nhanh:**
1. Cài add-on → vào tab **Configuration**
2. Thêm IP các loa vào `allowed_ips`
3. **Start**
4. Cấu hình Cloudflare Tunnel trỏ 2 hostname về `http://localhost:18082` và `http://localhost:18080`

---

### 💬 Zalo Bot

Chạy `zalo-server` để tự động hoá gửi và nhận tin nhắn Zalo cá nhân từ Home
Assistant. Dùng kèm tích hợp HACS [zalo_bot](https://github.com/TriTue2011/zalo_bot)
— add-on là phần nói chuyện với Zalo, tích hợp là phần tạo service và entity
trong Home Assistant. **Cần cả hai.**

- Thư mục: [`zalo_bot/`](zalo_bot/) — có [README riêng](zalo_bot/README.md) kèm hướng dẫn chạy bằng Docker
- Image: `ghcr.io/tritue2011/zalobot` (một image cho mọi kiến trúc: amd64, aarch64, armv7, armhf)
- Cổng: 3000

Sau khi cài, mở tab **Configuration**. Ô `api_key` **nên điền** — bỏ trống thì
mọi máy trong mạng nội bộ đều gọi được các API gửi tin mà không cần đăng nhập.
Mật khẩu quản trị nếu để trống sẽ được sinh ngẫu nhiên, ghi vào tệp
`THONG-TIN-DANG-NHAP.txt` trong thư mục dữ liệu và in ra tab **Log**.

---

### 🤖 chatgpt2api

Cổng API tương thích OpenAI, gộp ChatGPT, Codex OAuth, OpenCode, Gemini, DALL-E.

- Thư mục: [`chatgpt2api/`](chatgpt2api/) — xem [README riêng](chatgpt2api/README.md)
- Image: `ghcr.io/tritue2011/chatgpt2api`
- Cổng: 3030 (Web UI + API)

Ô `auth_key` **bắt buộc phải đặt**. Khoá này cấp quyền quản trị, và add-on chạy
trên mạng của máy Home Assistant — để trống hoặc dùng giá trị mẫu thì ứng dụng
từ chối khởi động.

---

## 🎴 Card điều khiển AI BOX

Card Lovelace đi kèm: [AI BOX WebUI Card (R1-card)](https://github.com/TriTue2011/R1-card)

Cài qua HACS → Custom repositories → `https://github.com/TriTue2011/R1-card` → Category: Dashboard

Cấu hình card:

```yaml
# 1 loa qua tunnel
type: custom:aibox-webui-card
host: <ip_loa>
tunnel_host: <your_tunnel_domain>
speaker_tunnel_host: <your_speaker_tunnel_domain>
mode: auto

# Nhiều loa
type: custom:aibox-webui-card
mode: auto
rooms:
  - name: "Phòng khách"
    host: "<ip_loa_1>"
    tunnel_host: <your_tunnel_domain>
    speaker_tunnel_host: <your_speaker_tunnel_domain>
  - name: "Phòng ngủ"
    host: "<ip_loa_2>"
    tunnel_host: <your_tunnel_domain>
    speaker_tunnel_host: <your_speaker_tunnel_domain>
```

---

## 🔧 Lưu ý

- Add-on sử dụng `host_network` để truy cập loa trong mạng LAN.
- Nếu gặp lỗi, kiểm tra kết nối mạng hoặc cập nhật Home Assistant lên phiên bản mới nhất.
- Để biết thêm chi tiết về từng add-on, xem tab **Documentation** trong trang cài đặt add-on.

## 🆘 Hỗ trợ

Nếu bạn cần trợ giúp, hãy mở issue trên GitHub tại:
[https://github.com/TriTue2011/has-addons/issues](https://github.com/TriTue2011/has-addons/issues)

Cảm ơn bạn đã sử dụng kho add-on!
