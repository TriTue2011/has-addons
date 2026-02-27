# AI BOX WebSocket Bridge

WebSocket bridge cho AI BOX speakers. Cho phep ket noi tu ben ngoai (qua Cloudflare Tunnel) den cac loa AI BOX trong mang LAN.

## Cach hoat dong

```
Card (HA Dashboard)
  -> wss://aibox.domain.com?ip=172.16.10.17
  -> Cloudflare Tunnel
  -> http://ha-ip:18082  (bridge add-on)
  -> ws://172.16.10.17:8082  (loa)
```

## Cau hinh

| Option | Default | Mo ta |
|--------|---------|-------|
| `ws_port` | 18082 | Port bridge cho AiBoxPlus WS (8082) |
| `spk_port` | 18080 | Port bridge cho Speaker WS (8080) |
| `target_ws_port` | 8082 | Port AiBoxPlus tren loa |
| `target_spk_port` | 8080 | Port Speaker tren loa |
| `ping_interval` | 20 | WebSocket ping interval (giay) |
| `ping_timeout` | 20 | WebSocket ping timeout (giay) |
| `open_timeout` | 10 | Connection timeout (giay) |
| `allowed_ips` | [] | Danh sach IP loa duoc phep (trong = tat ca) |

## Cau hinh Cloudflare Tunnel

Tao 2 Public Hostnames tro ve HA:

| Hostname | Service |
|----------|---------|
| `aibox.domain.com` | `http://localhost:18082` |
| `spk.domain.com` | `http://localhost:18080` |

## Cau hinh Card

```yaml
type: custom:aibox-webui-card
tunnel_host: aibox.domain.com
speaker_tunnel_host: spk.domain.com
rooms:
  - name: "Phong khach"
    host: "172.16.10.17"
  - name: "Phong ngu"
    host: "172.16.10.16"
```
