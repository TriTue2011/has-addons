# Nhật ký thay đổi

## 0.4.1
- Tin thoại bằng giọng đọc (TTS) của gateway: đổi PCM sang ogg/opus đúng định dạng Telegram, thử lại khi dịch vụ giọng trả «No audio», lỗi engine báo 502 rõ ràng thay vì 500.

## 0.4.0
- Nhắn tin đầy đủ như Zalo Call: gửi chữ (định dạng markdown/html, trả lời), ảnh, video, âm thanh, tin thoại (mp3… tự đổi sang ogg/opus, hoặc TTS), tệp; sửa, xoá, chuyển tiếp, thả emoji, đánh dấu đã đọc.
- Đọc lịch sử, danh sách hội thoại, danh bạ, tìm theo tên; dịch văn bản bằng Telegram; tải tệp đính kèm về.
- Nhận tin: sự kiện `telegram_call_message`, cảm biến «Tin nhắn gần nhất».
- Sửa: sửa/phản ứng/xoá ngay sau khi gửi (id tạm → id thật); TTS của gateway chạy ngoài vòng lặp.

## 0.3.0
- Gọi bằng **@tên đăng nhập** hoặc **+số điện thoại** (`peer`), không chỉ ID số.
- Sửa rò rỉ đĩa: tệp ghi tiếng bên kia (~345 MB mỗi giờ gọi) nay xoá khi cuộc gọi kết thúc và quét khi khởi động; sổ cuộc gọi cũ được cắt tỉa.
- Tuỳ chọn `video_profile = low` cho máy yếu (480x270, 10 khung/giây).
- Icon riêng (máy bay giấy). Bản phát hành là bản thường, kèm docker-compose.yml.

## 0.2.1
- Tiếng bên kia ra **loa R1 / loa camera Imou-Dahua** (kiểu phát `push`), có «Loa mặc định» và «Âm lượng cuộc gọi».
- Cuộc gọi đến dùng thiết bị mặc định (trước đó luôn mic/camera «test»).
- Gateway báo đúng số phiên bản.

## 0.1.0
- Bản add-on đầu tiên, đóng gói gateway Telegram từ kho Telegram-calling. Tuỳ chọn: `api_id`, `api_hash`, `gateway_token`, `ha_webhook_url`.
