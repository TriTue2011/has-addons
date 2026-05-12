# chatgpt2api — Home Assistant Addon

OpenAI-compatible API gateway tích hợp ChatGPT, Codex OAuth, OpenCode free, Gemini, DALL-E.

## Cấu hình

| Option | Default | Mô tả |
|--------|---------|-------|
| `auth_key` | `sk-chatgpt2api` | API key bảo vệ |

## Sau khi cài đặt

1. Mở Web UI: `http://HA_IP:3030` → đăng nhập `auth_key`
2. Thêm tài khoản: Web UI → **Tài khoản** → **Nhập tài khoản**
3. Cấu hình HA: Settings → Devices → Add Integration → **OpenAI Conversation**

| Field | Value |
|-------|-------|
| Base URL | `http://localhost:3030/v1` |
| API Key | `sk-chatgpt2api` |
| Model | `ha-agent` |

## Model gợi ý

| Model | Chat | Tool Call | Ảnh | Token |
|-------|------|-----------|-----|-------|
| `ha-agent` | ✅ | ✅ | ✅ | Auto |
| `oc/auto` | ✅ | ✅ | ❌ | Free |
| `cx/auto` | ✅ | ✅ | ❌ | OAuth |
| `gemini_free/auto` | ✅ | ✅ | ❌ | API key |

## Tài liệu đầy đủ

[https://github.com/TriTue2011/chatgpt2api](https://github.com/TriTue2011/chatgpt2api)
