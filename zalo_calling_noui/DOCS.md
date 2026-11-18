# Zalo Calling — bản KHÔNG giao diện

Cùng mã nguồn với bản có giao diện nhưng nhỏ hơn, hợp máy cấu hình yếu. **Không có WebUI**: mọi cài đặt đặt bằng
tuỳ chọn add-on, dịch vụ Home Assistant hoặc `curl`.

> App không chính thức. **Dùng tài khoản Zalo phụ.**

Thứ tự: **1** cài add-on → **2** thêm tích hợp → **3** kết nối và đăng nhập Zalo → **4** dịch vụ → **5** automation.

## 1. Cài add-on từ đầu

**Cần có trước khi bắt đầu:** Home Assistant OS hoặc Supervised (có mục *Add-on*); một tài khoản GitHub **đã được chủ kho mời vào kho riêng `TriTue2011/Zalo-calling`** (quyền *Read*) — không được mời thì không có mã để tải; một tài khoản Zalo phụ.

**Vì sao cần token:** add-on dùng image khởi động **công khai, không chứa mã** (`ghcr.io/tritue2011/zalo-calling-loader`). Mã Zalo Calling nằm ở kho riêng; lần đầu khởi động add-on dùng token của bạn để tải mã về và lưu trong thư mục dữ liệu. Không có token (và chưa có mã đã lưu) thì add-on **không chạy**.

### 1.1. Tạo token GitHub (chỉ đọc, hạn ngắn được)
1. Đăng nhập GitHub bằng tài khoản **đã được mời vào kho `Zalo-calling`** → ảnh đại diện → **Settings**.
2. **Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
3. *Token name*: tên tuỳ ý (vd `ha-zalo`). *Expiration*: chọn hạn **tuỳ ý, ngắn cũng được** (xem mục 1.3: hết hạn thì add-on vẫn chạy, chỉ không cập nhật được).
4. *Repository access* → **Only select repositories** → chọn **`TriTue2011/Zalo-calling`** (chỉ kho này).
5. *Permissions → Repository permissions* → **Contents: Read-only** (không cần quyền nào khác).
6. **Generate token** → **sao chép ngay** chuỗi bắt đầu bằng `github_pat_…` (GitHub chỉ hiện một lần).
Không thấy kho `Zalo-calling` trong danh sách chọn = tài khoản chưa được mời: nhờ chủ kho mời rồi tạo lại.

### 1.2. Cài và chạy add-on
1. **Cài đặt → Add-on → Cửa hàng → ⋮ (góc trên phải) → Kho lưu trữ** → dán `https://github.com/TriTue2011/has-addons` → **Thêm** → đóng cửa sổ, tải lại trang.
2. Tìm và mở **Zalo Calling (không giao diện)** → **Cài đặt**.
3. Ở tab **Cấu hình** điền **`username`**, **`password`** (từ 8 ký tự) và **`github_token`** — cả ba **bắt buộc**, thiếu thì Supervisor không cho khởi động. Bấm **Lưu**.
4. Tab **Thông tin** → **Khởi động**.
5. Tab **Nhật ký** — lần đầu phải thấy lần lượt: `Zalo Calling: tải mã vX.Y.Z.N từ kho riêng…` → `Zalo Calling: đã chuẩn bị vX.Y.Z.N (… tệp)` → các dòng khởi động của app. Lần sau khởi động nhanh hơn vì mã đã lưu.
Nếu thấy `Zalo Calling: KHÔNG CHẠY — …` thì xem bảng sự cố ở mục 1.4.

| Tuỳ chọn | Bắt buộc | Ý nghĩa |
|---|---|---|
| `username` | **có** | Tên đăng nhập app (cho cổng 8080 và tích hợp). |
| `password` | **có**, từ 8 ký tự | Mật khẩu app. Đổi lúc đang chạy bằng `zalo_call.set_app_password` thì giá trị đó được giữ. |
| `github_token` | **có**, từ 20 ký tự | Token GitHub chỉ đọc kho `Zalo-calling` (mục 1.1). **Lần đầu bắt buộc**; sau này hết hạn thì add-on vẫn chạy (mục 1.3). |
| `app_version` | không | Ghim phiên bản mã (vd `v2026.11.18.6`). Trống = đúng phiên bản của add-on; `latest` = bản phát hành mới nhất. |
| `webhook_url` | không | Webhook ban đầu cho cả bốn loại; chỉ dùng khi chưa có cấu hình webhook (dùng tích hợp Zalo Call thì để trống). |


### 1.3. Token hết hạn thì sao? (chạy tiếp, chỉ không cập nhật)
- **Chỉ lần đầu** mới nhất thiết cần token còn hạn (để tải mã về). Sau đó token **hết hạn, bị xoá, sai, bị thu hồi quyền** hoặc mất mạng: add-on **vẫn khởi động và chạy bình thường bằng bản mã đã lưu gần nhất**. Nhật ký ghi một dòng `Zalo Calling: CẢNH BÁO — … Chạy bản đã lưu vX…; KHÔNG cập nhật được cho tới khi có token mới`.
- **Muốn cập nhật lại:** tạo token mới (mục 1.1) → dán vào `github_token` → **Lưu** → **Khởi động lại** add-on. Mã mới sẽ được tải.
- **Số phiên bản add-on luôn bằng bản Zalo Calling mới nhất:** mỗi lần Zalo Calling có image mới, kho `has-addons` tự nâng `version` của add-on cho bằng (tối đa vài chục phút sau khi image xuất hiện). Home Assistant hiện nút **Cập nhật** (bật *Tự động cập nhật* thì tự lên). Cập nhật add-on chỉ kéo image khởi động công khai nên **không cần token**; còn **mã** mới được tải lúc khởi động nên cần token còn hạn — nếu token đã hết hạn, add-on lên phiên bản mới nhưng vẫn chạy mã cũ đã lưu (có cảnh báo trong nhật ký) cho tới khi bạn dán token mới.
- Xem phiên bản mã đang chạy thật: dòng `đã chuẩn bị vX…` hoặc `CẢNH BÁO … Chạy bản đã lưu vX` trong *Nhật ký*; app báo ở `GET /api/status` (`version`).

### 1.4. Sự cố thường gặp (đọc tab Nhật ký)
| Dòng trong nhật ký | Nghĩa là | Cách xử lý |
|---|---|---|
| `KHÔNG CHẠY — Chưa đặt token GitHub … lần đầu BẮT BUỘC có token` | Chưa có token và chưa có mã đã lưu | Làm mục 1.1 rồi dán vào `github_token` |
| `KHÔNG CHẠY — GitHub báo token sai hoặc đã hết hạn (401)` (lần đầu) | Token sai/hết hạn và chưa có mã lưu | Tạo token mới (mục 1.1) |
| `KHÔNG CHẠY — Token không có quyền đọc kho Zalo-calling (GitHub trả 403/404)` (lần đầu) | Token không đúng kho/quyền, hoặc tài khoản chưa được mời | Tạo lại token: chọn **Only select repositories → Zalo-calling**, **Contents: Read-only**; nhờ chủ kho mời tài khoản |
| `KHÔNG CHẠY — Không nối được GitHub …` (lần đầu) | Mất mạng hoặc GitHub không truy cập được | Kiểm mạng/DNS của HA rồi khởi động lại |
| `CẢNH BÁO — … Chạy bản đã lưu vX` | Đã có mã lưu; token hết hạn / mất mạng / không tải được bản mới | Add-on vẫn chạy. Muốn cập nhật: token mới + khởi động lại |
| `KHÔNG CHẠY — Gói tải về thiếu docker-entrypoint.py …` | Phiên bản mã chọn (`app_version`) sai hoặc kho đổi cấu trúc | Để trống `app_version` hoặc đặt `latest` |
| *Invalid configuration* khi lưu | `github_token` trống hoặc dưới 20 ký tự hoặc `password` dưới 8 ký tự | Điền đủ rồi lưu |

## 2. Thêm tích hợp Zalo Call (HACS)

1. **HACS → ⋮ → Custom repositories** → `https://github.com/TriTue2011/Zalo-calling`, **Type = Integration** → **Add**.
2. Tải **Zalo Call** → **khởi động lại Home Assistant**.
   Kho này riêng tư: tài khoản GitHub đang đăng nhập HACS phải được mời vào kho. Nếu HACS không thêm được kho riêng, tải `zalo_call.zip` ở trang *Releases* của kho (đăng nhập GitHub mới tải được), giải nén vào `/config/custom_components/zalo_call/` rồi khởi động lại HA.

## 3. Kết nối và đăng nhập Zalo

1. **Cài đặt → Thiết bị & Dịch vụ → Thêm tích hợp → Zalo Call**: địa chỉ `http://<IP máy HA>:8080` và đúng cặp `username`/`password` ở mục 1.
   Tích hợp tự lo webhook sang Home Assistant. Người nhận chọn ở *Cấu hình → Người và nhóm nhận*.
2. Đăng nhập Zalo: gọi dịch vụ **`zalo_call.login_qr`** (`type: pc` để gọi thoại/video, `web` chỉ nhắn tin) rồi mở thực thể ảnh
   **Mã QR đăng nhập**, quét bằng Zalo trên điện thoại. Cảm biến **Trạng thái Zalo** báo `logged_in` khi xong.
3. Đọc / đổi cài đặt lúc đang chạy (không cần WebUI): `zalo_call.get_app_settings` (`sections`, `reveal_secrets`), `zalo_call.set_app_settings`
   (`section`: `webhooks` · `devices` · `retention` · `proxy` · `security`, kèm `values`), `zalo_call.set_app_password`, `zalo_call.test_webhook`, `zalo_call.logout`.
   Hoặc `curl`: `POST /api/app/login` lấy cookie rồi `GET/POST /api/webhooks`, `/api/settings/devices`, …; kiểm sống `GET /api/app/status`.

## 4. Dịch vụ

Sau khi kết nối, mọi dịch vụ là `zalo_call.<tên>` (**Công cụ nhà phát triển → Hành động**, gõ `zalo_call.`). Mỗi ô có mô tả và ô chọn.

| Nhóm | Dịch vụ chính | Chi tiết |
|---|---|---|
| Gọi và nghe | `make_call` (gọi thoại/video, đọc thông báo, cho AI nói chuyện), `alert_call` (gọi cảnh báo lần lượt), `answer_call`, `reject_call`, `end_call`, `upgrade_to_video` | [mục 5](https://github.com/TriTue2011/Zalo-calling#5-dịch-vụ-cuộc-gọi-ai-cảnh-báo-và-quy-tắc) |
| Quy tắc cho từng người | `set_rule`, `list_rules`, `remove_rule` (chưa có quy tắc thì hệ thống không làm gì với người đó) | [mục 5](https://github.com/TriTue2011/Zalo-calling#5-dịch-vụ-cuộc-gọi-ai-cảnh-báo-và-quy-tắc), [mục 6](https://github.com/TriTue2011/Zalo-calling#6-các-trường-hợp-xảy-ra) |
| Tin nhắn, tệp, ghi âm | `send_message` và các dịch vụ gửi ảnh/tệp/giọng nói, định dạng chữ | [mục 7](https://github.com/TriTue2011/Zalo-calling#7-tin-nhắn-tệp-ghi-âm-và-định-dạng-chữ) |
| Đăng nhập và cài đặt app | `login_qr`, `logout`, `get_app_settings`, `set_app_settings`, `set_app_password`, `test_webhook` | [mục 3](https://github.com/TriTue2011/Zalo-calling#3-kết-nối-tích-hợp-với-app-đăng-nhập-zalo) |
| Mọi dịch vụ (hơn 370) | danh mục đầy đủ, có mã YAML mẫu cho từng ô | [mục 9](https://github.com/TriTue2011/Zalo-calling#9-danh-mục-mọi-dịch-vụ), [docs/DICH-VU.md](https://github.com/TriTue2011/Zalo-calling/blob/main/docs/DICH-VU.md) |

Người nhận chọn từ danh sách (thực thể `notify.zalo_<tên>`), không phải gõ mã Zalo — xem [mục 4](https://github.com/TriTue2011/Zalo-calling#4-quy-ước-và-nguyên-tắc-riêng-tư).

## 5. Automation

- **Sự kiện**: có người gọi tới → Home Assistant bắn sự kiện `zalo_call_call_state` (`incoming`, `answered`, `missed`, `ended`…); tin nhắn đến cũng có sự kiện riêng. Bảng trường và ví dụ YAML: [mục 10](https://github.com/TriTue2011/Zalo-calling#10-nhận-cuộc-gọi-sự-kiện-và-ví-dụ-automation).
- **Blueprint dựng sẵn** (chọn từ danh sách, không gõ mã): gọi cảnh báo khi cảm biến kích hoạt, một nút nghe/cúp/gọi, quy tắc cho cuộc gọi đến, nhắn tin tuỳ biến, nhắc hẹn theo lịch — nút nhập ở [mục 11](https://github.com/TriTue2011/Zalo-calling#11-blueprint-mẫu-chọn-từ-danh-sách-không-gõ-tay), kho [TriTue2011/Blueprint](https://github.com/TriTue2011/Blueprint).

## Lưu ý

- Cổng **8080** để tích hợp và loa/camera gọi vào; đổi ở tab *Mạng* nếu trùng, nhớ đổi cả địa chỉ trong tích hợp.
- Dữ liệu (phiên Zalo, tin nhắn, cài đặt) nằm ở `/data` của add-on và đi theo bản sao lưu của HA.
- **Không cài đồng thời** hai bản (có và không giao diện) với cùng cổng 8080; muốn chạy cả hai thì đổi cổng một bản.
- Tin nhắn 1-1 chỉ có từ lúc app bắt đầu lưu tin (Zalo không có API lấy lịch sử 1-1); tin mới vẫn hiện tức thì.
- Cài bằng Docker/Compose/Portainer thay vì add-on: xem [README gốc, mục 1](https://github.com/TriTue2011/Zalo-calling#1-cài-đặt-app-bằng-docker-docker-compose-và-portainer).
