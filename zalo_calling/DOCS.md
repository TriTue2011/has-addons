# Zalo Calling — bản có giao diện

Gọi **thoại và video Zalo** từ Home Assistant. Add-on này chạy app Zalo (đăng nhập bằng mã QR) và hiện WebUI
ngay trong bảng bên của HA (mục **Zalo Calling**), không cần mở cổng hay tự dựng proxy.

> App không chính thức. **Dùng tài khoản Zalo phụ.**

Thứ tự: **1** cài add-on → **2** thêm tích hợp → **3** kết nối và đăng nhập Zalo → **4** dịch vụ → **5** automation.

## 1. Cài add-on

1. **Cài đặt → Add-on → Cửa hàng → ⋮ → Kho lưu trữ** → thêm `https://github.com/TriTue2011/Zalo-calling`.
2. Cài **Zalo Calling**, bấm **Khởi động**. Bật *Hiện trong thanh bên*.
3. (Không bắt buộc) tab *Cấu hình*:

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `username` | Tên đăng nhập app, mặc định `admin`. |
| `password` | Để trống: app tự sinh, in **một lần** trong tab *Nhật ký* và lưu ở `/data/THONG-TIN-DANG-NHAP.txt`. |
| `webhook_url` | Địa chỉ webhook ban đầu cho cả bốn loại (tin nhắn, sự kiện nhóm, biểu cảm, cuộc gọi). Chỉ dùng khi chưa có cấu hình; dùng tích hợp Zalo Call thì để trống. |

Mở bằng bảng bên của HA thì **không hỏi mật khẩu** (HA đã xác thực bạn). Mật khẩu chỉ dùng khi vào qua cổng 8080 và cho tích hợp.
Đổi mật khẩu trong WebUI hoặc bằng `zalo_call.set_app_password` thì giá trị đó được giữ, không bị tuỳ chọn ghi đè.

## 2. Thêm tích hợp Zalo Call (HACS)

1. **HACS → ⋮ → Custom repositories** → `https://github.com/TriTue2011/Zalo-calling`, **Type = Integration** → **Add**.
2. Tải **Zalo Call** → **khởi động lại Home Assistant**.

## 3. Kết nối và đăng nhập Zalo

1. **Cài đặt → Thiết bị & Dịch vụ → Thêm tích hợp → Zalo Call**: địa chỉ `http://<IP máy HA>:8080`, tên đăng nhập/mật khẩu của add-on (mục 1).
   Tích hợp tự lo webhook sang Home Assistant. Người nhận chọn ở *Cấu hình → Người và nhóm nhận*.
2. Mở **Zalo Calling** ở thanh bên → chọn **Qua PC** (gọi thoại/video) hoặc **Qua Web** (chỉ nhắn tin) → quét QR bằng Zalo trên điện thoại.
   Cảm biến **Trạng thái Zalo** báo `logged_in` khi xong. (Cũng làm được từ HA: dịch vụ `zalo_call.login_qr`, quét ở thực thể ảnh **Mã QR đăng nhập**.)

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
