# Nhật ký thay đổi

## 2026.11.10.12
- **Tin thoại** (bong bóng ghi âm) gửi được: làm đúng cách zalo cũ — đổi sang AAC, tải lên như tệp rồi gửi bằng `forward`. Dịch vụ `send_voice` nhận tệp mp3/m4a/wav hoặc URL; phản hồi có `voice_url`.
- **Thả cảm xúc** không cần đăng nhập lại QR nữa (domain `reaction` dự phòng, đã thử thật); `icon` chọn trong bảng 54 biểu tượng.
- **Dịch bằng Zalo AI** (`translate_message`, `translate_message_suggest`): app tự dựng tham số, ô `params` thành tuỳ chọn. Đã thử thật với `en` và `ko`; `ja`, `zh`, `fr` Zalo từ chối (lỗi 111).
- `voice_to_text` (STT của Zalo AI): đã thử thật trên tin thoại nhận từ người khác, ra đúng chữ; nhận trường `voiceUrl`, kết quả về sự kiện `zalo_call_voice_to_text`.
- `send_sticker` gửi theo **từ khoá** (`keyword`, `pick: first|random`) — tự tìm rồi gửi; `send_message` thêm `zalo_emoji` (bảng emoji Zalo: heart, haha, wow…).

## 2026.11.10.11
- Trả lời của AI định dạng đúng (markdown → đậm/nghiêng/danh sách thật, hết dấu `**` thô); công tắc/ô chọn mới trên thiết bị để tự nhấn mạnh số bằng màu và tự thêm emoji.
- Kiểm thử đầu-cuối trong Home Assistant thật (8 ca) cho dịch vụ gửi tin, bảng chọn và đường AI.

## 2026.11.10.10
- Sửa tiến trình ma: ffmpeg (mic, loa, hình) bị giết nhưng không được thu xác, nay thu xác ngay khi dừng.
- Trần RAM/CPU/số tiến trình và xoay vòng nhật ký trong compose; mục «Máy yếu» trong README.
- Icon Zalo riêng.

## 2026.11.10.9
- HA khởi động lại không còn xoá «Camera mặc định» của app (cuộc gọi video không còn mất hình sau khi HA khởi động).
- Kho đổi tên `Zalo-calling`; liên kết hỗ trợ trong giao diện app trỏ đúng kho mới.

## 2026.11.10.8
- Bản add-on đầu tiên, đóng gói app Zalo Calling (cùng bản với tích hợp `zalo_call` 2026.11.10.8).
- Tài khoản WebUI đặt ở tab Cấu hình; bỏ trống mật khẩu thì add-on tự sinh và in ra Log.
- Thứ tự cuộc gọi video đúng: hình chỉ bật sau khi nghe máy 2 giây (trước đó hình nháy rồi mất).
- Cài đặt «Âm lượng cuộc gọi» và trả lại âm lượng loa sau cuộc gọi (kể cả loa R1 chỉ có 15 nấc).
