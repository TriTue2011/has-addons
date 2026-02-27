# 🌐 AI BOX WebSocket Bridge

WebSocket bridge cho phép điều khiển loa AI BOX (Phicomm R1) từ xa qua Cloudflare Tunnel.
Hỗ trợ nhiều loa cùng lúc thông qua tham số `?ip=`.

```
Card (browser)
  → wss://aibox.domain.com/?ip=<speaker_ip>
  → Cloudflare Tunnel
  → http://<ha_ip>:18082  (bridge)
  → ws://<speaker_ip>:8082  (loa)
```

## ❓ Nhóm Support:
- Zalo: https://zalo.me/g/alvkgn274

---

## 📦 Cài đặt Bridge

Bridge có 2 cách cài: **HA Add-on** (cho HAOS) hoặc **Docker Compose**.

---

### Cách 1: HA Add-on (khuyến nghị cho HAOS)

#### Bước 1: Thêm kho add-on

1. Vào **Settings** → **Add-ons** → **Add-on Store**
2. Nhấp biểu tượng **⋮** góc trên phải → **Repositories**
3. Dán đường dẫn:

```
https://github.com/TriTue2011/has-addons
```

4. Nhấp **Add** → F5 reload trình duyệt

#### Bước 2: Cài đặt

1. Cuộn xuống tìm **AI BOX WebSocket Bridge** → **Install**
2. Đợi build xong (~1-2 phút)

#### Bước 3: Cấu hình

Vào tab **Configuration** của add-on:

```yaml
ws_port: 18082
spk_port: 18080
target_ws_port: 8082
target_spk_port: 8080
allowed_ips:
  - "<speaker_ip_1>"
  - "<speaker_ip_2>"
```

> Để trống `allowed_ips` nếu muốn cho phép tất cả IP.

#### Bước 4: Khởi động

Vào tab **Info** → nhấp **Start**. Xem log tại tab **Log**.

---

### Cách 2: Docker Compose

#### Bước 1: Tạo thư mục và file

```bash
mkdir -p /opt/aibox_bridge
cd /opt/aibox_bridge
```

Copy 2 file vào thư mục:
- `bridge.py`
- `docker-compose.yml`

Tạo file `.env` (tuỳ chọn):

```bash
nano /opt/aibox_bridge/.env
```

```env
ALLOWED_IPS=<speaker_ip_1>,<speaker_ip_2>
```

> Để trống hoặc không tạo file `.env` nếu muốn cho phép tất cả IP.

#### Bước 2: Chạy

```bash
cd /opt/aibox_bridge
docker compose up -d
```

Hoặc deploy qua **Portainer** → **Stacks** → **Add stack** → paste nội dung `docker-compose.yml`.

#### Bước 3: Kiểm tra

```bash
docker logs aibox_bridge
```

Thấy dòng sau là OK:

```
Bridge ready. Waiting for connections...
```

---

## ☁️ Cấu hình Cloudflare Tunnel

Bridge cần 2 hostname tunnel — một cho WS Control (8082), một cho Speaker (8080).

---

### Cách 1: Tunnel qua HA Add-on (Cloudflared)

Nếu đang dùng add-on **Cloudflared** trên HAOS, thêm vào cấu hình add-on:

```yaml
additional_hosts:
  - hostname: aibox.domain.com
    service: http://<ha_ip>:18082
  - hostname: spk.domain.com
    service: http://<ha_ip>:18080
```

> Thay `<ha_ip>` bằng IP máy chạy Home Assistant, thay `domain.com` bằng domain của bạn.

Lưu → Restart add-on Cloudflared.

---

### Cách 2: Tunnel qua Docker

Mỗi tunnel token tương ứng 1 hostname trên Cloudflare Dashboard.

#### Bước 1: Tạo tunnel trên Cloudflare Dashboard

1. Vào [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels**
2. Tạo **Tunnel 1** → Public Hostname: `aibox.domain.com` → Service: `http://<ha_ip>:18082` → copy token
3. Tạo **Tunnel 2** → Public Hostname: `spk.domain.com` → Service: `http://<ha_ip>:18080` → copy token

#### Bước 2: Tạo thư mục và file

```bash
mkdir -p /opt/cloudflared_aibox
cd /opt/cloudflared_aibox
```

Tạo `docker-compose.yml`:

```yaml
version: "3.8"
services:
  cloudflared-aibox:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-aibox
    restart: unless-stopped
    environment:
      - TUNNEL_TOKEN=<token_tunnel_1>
    command: tunnel --no-autoupdate run

  cloudflared-spk:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-spk
    restart: unless-stopped
    environment:
      - TUNNEL_TOKEN=<token_tunnel_2>
    command: tunnel --no-autoupdate run
```

#### Bước 3: Chạy

```bash
cd /opt/cloudflared_aibox
docker compose up -d
```

Hoặc deploy qua **Portainer**.

---

## ✅ Kiểm tra hoạt động

Sau khi bridge + tunnel chạy xong, kiểm tra bằng cách mở browser → F12 Console:

```javascript
const ws = new WebSocket("wss://aibox.domain.com/?ip=<speaker_ip>");
ws.onopen = () => console.log("OK");
ws.onerror = (e) => console.log("FAIL", e);
```

Thấy `OK` là bridge hoạt động.

---

## 🎴 Cấu hình Card

Cài card: [AI BOX WebUI Card (R1-card)](https://github.com/TriTue2011/R1-card)

```yaml
# 1 loa
type: custom:aibox-webui-card
host: <speaker_ip>
tunnel_host: aibox.domain.com
speaker_tunnel_host: spk.domain.com
mode: auto

# Nhiều loa
type: custom:aibox-webui-card
mode: auto
rooms:
  - name: "Phòng khách"
    host: "<speaker_ip_1>"
    tunnel_host: aibox.domain.com
    speaker_tunnel_host: spk.domain.com
  - name: "Phòng ngủ"
    host: "<speaker_ip_2>"
    tunnel_host: aibox.domain.com
    speaker_tunnel_host: spk.domain.com
```

---

## 🔧 Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `No ?ip= param` | Card chưa update v6.1.1 | Update card từ HACS |
| `connection refused` | Bridge chưa chạy hoặc sai port | Kiểm tra `docker logs` hoặc add-on log |
| Bridge không thấy loa | Docker dùng bridge network | Phải dùng `network_mode: host` |
| `Non-UTF-8 \x96` | File bridge.py sai encoding | Download lại bridge.py từ repo |
| `400 Bad Request` spam | Healthcheck cũ gửi HTTP vào WS | Dùng docker-compose mới (process check) |

---

## License

MIT
