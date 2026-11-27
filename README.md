# Home Assistant Add-ons — TriTue

Kho add-on cho **Home Assistant OS / Supervised**: Zalo (nhắn tin và gọi điện), Telegram, và cầu nối loa AI BOX.
Mỗi add-on có trang hướng dẫn riêng — README này chỉ **giới thiệu ngắn và dẫn link**.

## Thêm kho vào Home Assistant

**Cài đặt → Add-on → Cửa hàng → ⋮ → Kho lưu trữ** → dán `https://github.com/TriTue2011/has-addons` → **Thêm**, hoặc bấm nhanh:
[![Thêm kho add-on](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FTriTue2011%2Fhas-addons)

> Home Assistant bản Docker/Container không có add-on: mỗi dự án đều có hướng dẫn Docker riêng (link trong từng mục dưới đây).

## Các add-on

| Add-on | Làm gì | Giao diện / cổng | Đọc chi tiết |
|---|---|---|---|
| 💬 [**Zalo Bot**](#-zalo-bot) | Gửi/nhận **tin nhắn** Zalo cá nhân | WebUI `3000` | [Hướng dẫn cài đặt](zalo_bot/HUONG-DAN-CAI-DAT.md) · [Tham chiếu](zalo_bot/README.md) |
| 📞 [**Raling**](#-raling-có-giao-diện) | **Gọi thoại và video** Zalo, tiếng ra loa nhà | WebUI ở **thanh bên HA** + `8080` | [Hướng dẫn](raling/DOCS.md) |
| 📞 [**Raling (không giao diện)**](#-raling-không-giao-diện) | Như trên, bản **nhẹ, không WebUI** | API `8080` | [Hướng dẫn](raling_noui/DOCS.md) |
| ✈️ [**Telegram Calling**](#telegram-calling) | Cổng **Telegram** (Python, bản xem trước) | WebUI `3333` | [Hướng dẫn](telegram_calling/README.md) |
| ✈️ [**Tele Rust**](#tele-rust) | Cổng **Telegram** (Rust, bản mới) — nhắn tin, gọi thoại/video | WebUI `3334` | [Hướng dẫn](tele_rs/DOCS.md) |
| 🏠 [**Ralo**](#ralo) | Cổng **Zalo** (Rust, bản mới) — nhắn tin, gọi thoại/video; cài **song song** Raling không đè | WebUI ở **thanh bên HA** + `8096` | [Hướng dẫn](ralo/DOCS.md) |
| 🤖 [**AI BOX WebSocket Bridge**](#-ai-box-websocket-bridge) | Điều khiển loa **AI BOX (Phicomm R1)** từ xa | WebSocket `18082` | [Hướng dẫn](aibox_bridge/README.md) |

### 💬 Zalo Bot

Gửi và nhận tin nhắn **Zalo cá nhân** trong Home Assistant: báo động, nhắc việc, gửi ảnh camera, chuyển tiếp tin nhắn vào automation. Chạy máy chủ `zalo-server` (Node.js, thư viện `zca-js`).

- **Cần hai phần:** add-on này (máy chủ đăng nhập Zalo) **và** tích hợp *Zalo Bot* qua HACS (`https://github.com/TriTue2011/zalo_bot`). Thiếu một phần thì không chạy.
- **Cần token GitHub chỉ đọc (lần đầu):** mã máy chủ ở kho riêng `zalo_bot`; add-on dùng image khởi động công khai và tải mã bằng `github_token`. **Token hết hạn vẫn chạy bản đã lưu** (chỉ không cập nhật được). Số phiên bản add-on luôn bằng image mới nhất (tự nâng).
- Đăng nhập bằng mã QR; dùng **tài khoản Zalo phụ**.
- Chi tiết: [hướng dẫn cài đặt từng bước](zalo_bot/HUONG-DAN-CAI-DAT.md) (add-on hoặc Docker, tích hợp, bảo mật, sự cố) · [tài liệu tham chiếu](zalo_bot/README.md).

### 📞 Raling (có giao diện)

**Gọi thoại và video Zalo** từ Home Assistant: điện thoại đổ chuông, tiếng bên kia ra **loa trong nhà**, mic/camera nhà gửi sang điện thoại; AI nói chuyện, cảnh báo bằng cuộc gọi, quy tắc theo từng người.
**WebUI hiện ngay ở thanh bên** Home Assistant (Ingress).

- **Cần hai phần:** add-on này **và** tích hợp *Zalo Call* qua HACS (`https://github.com/TriTue2011/Raling`), rồi kết nối và quét QR (tài khoản Zalo phụ).
- Chi tiết: [hướng dẫn từng bước](raling/DOCS.md) (cài add-on → thêm tích hợp → kết nối → dịch vụ → automation) · [danh mục dịch vụ và blueprint](https://github.com/TriTue2011/Raling#readme) · [cài bằng Docker/Compose/Portainer](https://github.com/TriTue2011/Raling#1-cài-đặt-app-bằng-docker-docker-compose-và-portainer).

### 📞 Raling (không giao diện)

Cùng mã nguồn với bản trên nhưng **không có WebUI**, nhẹ về bề mặt, hợp máy cấu hình yếu; `username`/`password` **bắt buộc** đặt ở tab Cấu hình, đăng nhập Zalo bằng dịch vụ `zalo_call.login_qr`.
**Cùng cổng 8080 với bản có giao diện nên chỉ cài một trong hai.**

- Chi tiết: [hướng dẫn từng bước](raling_noui/DOCS.md) · [danh mục dịch vụ và blueprint](https://github.com/TriTue2011/Raling#readme).

### Telegram Calling

Cổng **Telegram** cho Home Assistant (Python): đăng nhập **tài khoản Telegram phụ**, nhắn tin, gọi thoại/video, đẩy sự kiện về HA. Bản xem trước (0.x).

- Cần `api_id` và `api_hash` lấy ở <https://my.telegram.org> (hướng dẫn có trong trang chi tiết) và tích hợp *Telegram Call* qua HACS (`https://github.com/TriTue2011/Telegram-calling`).
- Chi tiết: [hướng dẫn cài đặt](telegram_calling/README.md) · [kho mã nguồn](https://github.com/TriTue2011/Telegram-calling).

### Ralo

- **Ralo** — gateway **Zalo viết bằng Rust**: nhắn tin (ảnh, video, album, tin ghim nhóm, hình nền), gọi thoại/video 1-1, SSE + webhook cho Home Assistant.
- Kho mã **riêng tư** như Raling: image `zalo-rs-loader` công khai **không chứa mã**, lần đầu dùng `github_token` chỉ đọc kho
  `TriTue2011/Ralo` để tải nhị phân dựng sẵn (amd64/arm64); token hết hạn vẫn chạy bản đã lưu.
- Tab ở **thanh bên HA** (Ingress) + cổng LAN **8096** — không đè Raling (8080). Dùng tài khoản Zalo khác với Raling.
- Chi tiết: [hướng dẫn cài đặt](ralo/DOCS.md) · [README add-on](ralo/README.md).

### Tele Rust

Cổng **Telegram** khác, viết bằng Rust: đăng nhập **tài khoản Telegram phụ**, nhắn tin, gọi thoại/video P2P, đẩy sự kiện về HA, kèm giao diện web riêng ở cổng `3334`. **Không cài đồng thời với Telegram Calling trên cùng một tài khoản Telegram** — mỗi add-on tự quản lý phiên đăng nhập riêng, dùng chung tài khoản dễ xung đột.

- Kho **công khai**, không cần token GitHub — khác với Raling.
- Cần `tg_api_id` và `tg_api_hash` lấy ở <https://my.telegram.org>, cùng `gateway_token` tự sinh.
- Không có tab ở thanh bên HA (CSP `frame-ancestors 'none'` của gateway chặn Ingress) — mở trực tiếp cổng `3334`.
- Chi tiết: [hướng dẫn cài đặt](tele_rs/DOCS.md) · [kho mã nguồn](https://github.com/TriTue2011/tele-rust#readme).

### 🤖 AI BOX WebSocket Bridge

Cầu **WebSocket** để điều khiển loa **AI BOX (Phicomm R1)** từ xa qua Cloudflare Tunnel; nhiều loa cùng lúc bằng tham số `?ip=<IP loa>`. Chạy mạng `host`, cổng bridge mặc định `18082`.

- Chi tiết: [hướng dẫn cài đặt](aibox_bridge/README.md) (add-on hoặc Docker Compose) · [DOCS](aibox_bridge/DOCS.md).

## Chọn add-on nào?

- **Nhắn tin Zalo** → *Zalo Bot*. **Gọi điện Zalo** → *Raling*. Hai add-on làm việc khác nhau và **chạy cùng nhau được**.
- *Raling* có hai bản (có / không giao diện), cùng cổng 8080: **chỉ cài một**.
- Telegram thay cho Zalo → *Telegram Calling* (Python, cũ) hoặc *Tele Rust* (Rust, mới — khuyến nghị). Điều khiển loa R1 từ xa → *AI BOX WebSocket Bridge*.

## Phiên bản tự cập nhật

Phiên bản *Raling* (hai bản), *Zalo Bot*, *Telegram Calling* và *Tele Rust* **tự nâng** khi kho mã nguồn ra bản phát hành và ảnh Docker đã dựng xong (`.github/scripts/auto_bump.py`); bật «Tự động cập nhật» ở add-on là lên bản mới không cần làm gì.

## Hỗ trợ và báo lỗi

- Nhóm hỗ trợ: Zalo <https://zalo.me/g/alvkgn274> · Facebook <https://www.facebook.com/groups/aiboxvn>
- Báo lỗi: <https://github.com/TriTue2011/has-addons/issues> — kèm nội dung tab **Nhật ký** của add-on, và nhớ **che mật khẩu cùng khoá API** trước khi dán.
