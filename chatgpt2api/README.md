# chatgpt2api — Home Assistant Addon

OpenAI-compatible API gateway tích hợp ChatGPT, Codex OAuth, OpenCode free, Gemini, DALL-E.

## Cài đặt

[![Add Repository](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTriTue2011%2Fhas-addons)

Hoặc: **Settings → Add-ons → Add-on Store → ⋮ → Repositories** → thêm `https://github.com/TriTue2011/has-addons`

Sau đó tìm **chatgpt2api** → **Install**.

## Cấu hình

| Option | Mặc định | Mô tả |
|--------|----------|-------|
| `auth_key` | **(trống — bắt buộc điền)** | Khoá bảo vệ API và Web UI. Ai có khoá này được cấp quyền **quản trị**, mà add-on chạy trên mạng của máy Home Assistant — nên phải đặt khoá riêng, dài. Sinh bằng `openssl rand -hex 32` |
| `base_url` | (trống) | URL công khai nếu dùng ngoài mạng local (vd: `https://chatgpt.mydomain.com`) |

## ⚠️ Nâng cấp lên 1.2.7: phải đặt lại `auth_key`

Các bản trước đặt sẵn `auth_key` là `sk-chatgpt2api`. Giá trị đó nằm trong kho
mã nguồn công khai, nên bất kỳ ai trong mạng nội bộ cũng đoán được và dùng nó để
lấy quyền quản trị — add-on chạy `host_network` ở cổng 3030.

Từ bản này giá trị mặc định bị bỏ trống, và ứng dụng **từ chối khởi động** nếu
khoá để trống, ngắn dưới 8 ký tự, hoặc là một giá trị mẫu đã biết. Nếu add-on
không chạy sau khi cập nhật, mở tab Log — thông báo sẽ nói rõ lý do.

Cách xử lý: vào tab Configuration, điền `auth_key` bằng chuỗi sinh từ
`openssl rand -hex 32`, rồi khởi động lại. Nhớ cập nhật khoá đó ở mọi nơi đang
gọi vào gateway (Home Assistant, script, ứng dụng khác).

## Sau khi cài

1. Mở Web UI: `http://HA_IP:3030` → đăng nhập bằng `auth_key`
2. Thêm tài khoản: **Tài khoản** → **Nhập tài khoản**
3. Cấu hình HA integration:

| Field | Value |
|-------|-------|
| Base URL | `http://localhost:3030/v1` |
| API Key | `sk-chatgpt2api` |
| Model | `ha-agent` |

## Model

| Model | Chat | Tool | Ảnh | Token |
|-------|------|------|-----|-------|
| `ha-agent` | ✅ | ✅ | ✅ | Auto |
| `oc/auto` | ✅ | ✅ | ❌ | Free |
| `cx/auto` | ✅ | ✅ | ❌ | OAuth |
| `gemini_free/auto` | ✅ | ✅ | ❌ | API key |

## Thêm token

- **ChatGPT**: Vào https://chatgpt.com/api/auth/session → copy `accessToken` → Web UI paste
- **Gemini**: Lấy key tại https://aistudio.google.com/apikey → Web UI **Cài đặt → Gemini**
- **9router**: Web UI → **Sao lưu** → kéo thả file backup

## Troubleshooting

- **Addon không hiện**: Ctrl+F5 refresh Add-on Store, hoặc Check for updates
- **413 Error**: Dùng model `oc/auto` hoặc `cx/auto` (không giới hạn 24KB)
- **Token hết quota**: Hệ thống tự round-robin. Thêm nhiều Gemini key nếu cần.

Tài liệu đầy đủ: https://github.com/TriTue2011/chatgpt2api
