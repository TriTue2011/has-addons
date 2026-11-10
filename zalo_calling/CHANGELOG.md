# Nhật ký thay đổi

## 2026.11.10.9
- HA khởi động lại không còn xoá «Camera mặc định» của app (cuộc gọi video không còn mất hình sau khi HA khởi động).
- Kho đổi tên `Zalo-calling`; liên kết hỗ trợ trong giao diện app trỏ đúng kho mới.

## 2026.11.10.8
- Bản add-on đầu tiên, đóng gói app Zalo Calling (cùng bản với tích hợp `zalo_call` 2026.11.10.8).
- Tài khoản WebUI đặt ở tab Cấu hình; bỏ trống mật khẩu thì add-on tự sinh và in ra Log.
- Thứ tự cuộc gọi video đúng: hình chỉ bật sau khi nghe máy 2 giây (trước đó hình nháy rồi mất).
- Cài đặt «Âm lượng cuộc gọi» và trả lại âm lượng loa sau cuộc gọi (kể cả loa R1 chỉ có 15 nấc).
