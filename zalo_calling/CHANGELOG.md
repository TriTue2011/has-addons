# Nhật ký thay đổi

## 2026.11.11.4
- Tự động nâng theo bản phát hành [v2026.11.11.4](https://github.com/TriTue2011/Zalo-calling/releases/tag/v2026.11.11.4): xem ghi chú phát hành để biết chi tiết.

## 2026.11.11.3
- Tự động nâng theo bản phát hành [v2026.11.11.3](https://github.com/TriTue2011/Zalo-calling/releases/tag/v2026.11.11.3): xem ghi chú phát hành để biết chi tiết.

## Chưa phát hành
- **Trường `connect` (chọn nhiều) thay công tắc `home_devices` của quy tắc** (đặt lại quy tắc cũ bằng `set_rule`; chưa có `connect` = không nối): `mic`, `speaker`, `camera` ghép bất kỳ (thoại lẫn video), lối tắt `voice`/`always`, và `ai` (AI chọn voice hay camera lúc chuyển máy). Có ở `set_rule`, `make_call`, `answer_call`, `alert_call`. Thoại mà có camera thì nâng lên video.
- **Thiết bị nhà chỉ nối khi chuyển máy**: cuộc gọi AI giữ máy không nối loa/mic/camera; chuyển sang trực tiếp mới nối, và chỉ thứ đã cài (không cài = không nối, kể cả AI). Sự kiện `zalo_call_ai_handover` thêm `reason`/`connected` (bỏ `home_devices`).
- **Dịch vụ mới `alert_call`**: gọi thoại/video để báo cảnh báo - AI đọc nội dung rồi nối thẳng thiết bị đã cài, không hỏi.
- **AI tự kết thúc cuộc gọi** khi người gọi nói không cần gì nữa (dấu `[[KET_THUC]]`); cuộc gọi đi có AI mà không `message` thì AI chào trước; `alert_call` mặc định nối tất cả thiết bị đã cài kể cả camera.
- **Ô «Thiết bị nhà dùng NGAY khi người nhận nghe máy»** (`connect_now`, ở Gọi điện đi, Nghe máy, quy tắc): ví dụ nối camera ngay, mic và loa chờ tới khi người nhà nói trực tiếp.
- **Báo ra loa khi có cuộc gọi đến** (quy tắc: `announce`, `announce_to`, `announce_text`; mặc định TẮT).
- **`alert_call` có `after`** (cúp / nối thiết bị / giữ máy) và sự kiện **`zalo_call_alert_done`** để biết đúng lúc đọc xong.
- **Ô tích thiết bị nhà** (Mic, Loa, Camera, AI tự chọn); tích Camera = cuộc gọi video; `type` không còn mặc định mà tự chọn theo ô tích.
- **Viết lại chữ hiển thị cho dễ hiểu** (tên dịch vụ, ô nhập, nhãn ô chọn, nút «Người nhà nói trực tiếp»); id dịch vụ/trường không đổi. Bảng từ ngữ ở `tools/ha_plain_words.py`.
- Sửa: nhận dấu chuyển máy của AI cả khi rơi ngoặc (`CHUYEN MAY`); giọng AI không còn bị chặn khung bởi chống vọng (hết giật); chế độ SRTP không đổi sau một cuộc im lặng.

## 2026.11.10.20
- Tự động nâng theo bản phát hành [v2026.11.10.20](https://github.com/TriTue2011/Zalo-calling/releases/tag/v2026.11.10.20): xem ghi chú phát hành để biết chi tiết.

## 2026.11.10.20
**Thay đổi hành vi (đọc trước khi cập nhật):**
- **AI trả lời tin nhắn tắt cho tới khi có quy tắc.** Trước đây công tắc «AI tự trả lời tin 1-1» + ô ID cho AI trả lời người nhắn; nay chỉ trả lời khi có quy tắc `set_rule` (`reply_ai`). Các ID trong ô cũ được tự chuyển thành quy tắc theo threadID; **ô ID trống (cũ = «mọi người») KHÔNG được chuyển** — AI sẽ không trả lời người lạ nữa cho tới khi bạn đặt quy tắc.
- **Gỡ các ô cài đặt đã chuyển sang dịch vụ:** loa/mic/camera mặc định, URL mic, chống vọng, âm lượng, tự phát mic, tự đồng ý video và thời gian chờ, các công tắc/ô AI. HA sẽ để lại các thực thể «không còn được cung cấp» — bạn tự xoá. Đặt lại bằng `set_default_devices`; xem bằng `get_default_devices`. Còn lại: ô kiểu chữ, địa chỉ HA cho app và các nút.
- App Zalo **không còn tự nghe máy**; HA quyết định theo quy tắc (một nơi duy nhất).

**Mới:**
- **Quy tắc bằng dịch vụ** `set_rule` / `remove_rule` / `list_rules` / `list_contacts`: theo threadID (người hoặc nhóm), danh bạ, người lạ, mọi nhóm. Không có quy tắc = không làm gì; thread đè nhóm; không biết quen/lạ thì không áp quy tắc nhóm; thiết bị nhà mặc định tắt (app nhận «off»); `ai`/`reply_ai` bắt buộc có `pipeline` hoặc `agent`. Có thời gian chờ nghe máy, loại cuộc gọi voice/video (nhận video **chưa kiểm**), AI, chọn Assist pipeline/trợ lý/thiết bị từ danh sách của HA.
- App báo `contact_status` (friend/stranger/group/unknown) và `call_type_raw` trong webhook cuộc gọi/tin nhắn, kèm `kind`/`voice_url` cho tin thoại.
- Tin thoại Zalo → Zalo STT → AI → trả lời bằng tin thoại (theo quy tắc `voice_text`/`reply_ai`); sự kiện `zalo_call_voice_text`.
- AI trong cuộc gọi (STT → trợ lý → TTS qua Assist pipeline), tự chuyển sang trực tiếp (`[[CHUYEN_MAY]]` hoặc công cụ; sự kiện `zalo_call_ai_handover`), `take_over_call`, `say_in_call`, `make_call` kèm `message`/`ai`.
- LLM API «Zalo Call» (tích cạnh «Assist»): trong cuộc gọi do AI giữ chỉ còn công cụ «chuyển sang trực tiếp».
- **Sửa lỗi:** tin tự gửi (người gửi «0») không còn lưu nhầm thread «0»/kích hoạt AI; `request` lặp và cuộc đến khi đang bận; tin hệ thống (bình chọn mới, sticker, thu hồi) không còn bong bóng trống trong WebUI; phát tệp TTS không lặp, không rơi khung đầu; `_request` nhận `timeout`.

## 2026.11.10.18
- Tự động nâng theo bản phát hành [v2026.11.10.18](https://github.com/TriTue2011/Zalo-calling/releases/tag/v2026.11.10.18): xem ghi chú phát hành để biết chi tiết.

## 2026.11.10.18
- **AI trong cuộc gọi chọn thiết bị Assist có sẵn** (Assist Cam, Assist R1…): dùng pipeline (STT, TTS, trợ lý) và giọng của thiết bị đó; trường `assist_device` cho từng cuộc gọi.
- **Sửa lỗi WebUI:** tin hệ thống (bình chọn mới tạo trên điện thoại, đổi sự kiện nhóm, sticker, thu hồi) không còn hiện bong bóng trống — vẽ thành dòng ghi chú theo mẫu câu có sẵn của Zalo; tin cũ đã lưu cũng được vá khi đọc. Xem trước ở danh sách hội thoại hết trống.

## 2026.11.10.17
- **Tiếp quản cuộc gọi:** nút «Tiếp quản cuộc gọi» và dịch vụ `take_over_call` — dừng AI/thông báo đang giữ cuộc gọi (không cúp máy) và trả mic nhà về để nói trực tiếp.
- **AI tự chuyển sang trực tiếp:** AI tự quyết (dấu `[[CHUYEN_MAY]]` trong câu trả lời, không bị đọc ra) khi khẩn cấp / người gọi muốn gặp người nhà / AI không giúp được: dừng AI, nối mic nhà, không cúp máy, bắn sự kiện `zalo_call_ai_handover`. Điều kiện riêng: ô «AI tự chuyển sang trực tiếp khi…» hoặc `handover_rule`.
- **Điều phối bằng giọng nói qua Assist, không cần automation/prompt:** LLM API «Zalo Call» đăng ký sẵn (tích cạnh «Assist» trong cài đặt trợ lý): gọi điện/video theo tên (không cần dấu), nghe/từ chối/cúp máy, tiếp quản, đọc lên cuộc gọi, nhắn tin. Trong cuộc gọi do AI giữ chỉ còn công cụ «chuyển sang trực tiếp» (người lạ không sai khiến được).
- **Phạm vi dữ liệu của AI trong cuộc gọi:** trợ lý hội thoại RIÊNG cho người gọi chưa tin cậy (không cần quyền thiết bị; pipeline chỉ làm STT), danh sách ID tin cậy + trợ lý riêng cho họ, lời dặn mềm «chưa xác thực» khi chưa chọn trợ lý riêng. Người trong danh bạ không tự động được tin cậy.
- README: bảng đầy đủ các trường hợp gọi đi / gọi đến.

## 2026.11.10.16
- **Tự nghe máy cuộc gọi đến** (mặc định tắt): công tắc + bộ đếm + danh sách ID Zalo được tự nghe (trống = không ai). Có trong HA (thiết bị) và WebUI → Thiết bị.
- **Thông báo bằng giọng nói:** `make_call`/`answer_call` thêm `message`, `repeat`, `hangup_after`, `tts_engine`, `language`; dịch vụ mới `say_in_call`. App thêm `POST /api/call/say`.
- **AI nói chuyện trong cuộc gọi** (STT → trợ lý → TTS qua Assist pipeline): `ai: true` hoặc công tắc «AI nghe và trả lời… trong cuộc gọi đến» + câu chào.
- **Sửa lỗi nhận cuộc gọi:** sự kiện `request` lặp lại không còn đặt lại cuộc đang nói; cuộc gọi đến khi đang bận bị từ chối (không đè cuộc đang sống).
- **Sửa lỗi tin tự gửi:** tin do chính mình gửi quay về kênh đồng bộ với người gửi «0» không còn bị lưu vào thread «0» và không còn kích hoạt AI trả lời nhầm.
- `_request` của tích hợp nhận `timeout` riêng (lỗi truyền hai lần).

## 2026.11.10.13
- **Kiểu chữ mặc định trên thiết bị:** 7 ô cài đặt (cỡ chữ, màu chữ, in đậm, nghiêng, gạch chân, tiêu đề, màu cho chế độ auto), mỗi mục có chế độ `auto` tự theo nội dung chữ.
- `send_message` có thêm `font_size`, `text_color`, `bold`, `italic`, `underline`, `heading`, `auto_color`: ghi đè mặc định cho từng tin. Trả lời của AI cũng theo mặc định.
- **`auto` theo ngữ cảnh, không chậm thêm:** câu trả lời của AI tự định dạng + chọn emoji ngay trong cùng lượt (nhúng chỉ dẫn); `send_message` dùng quy tắc tức thì, tuỳ chọn nhờ AI đánh giá riêng (`ai_style`, tối đa 8 giây, app chỉ nhận khi chữ không đổi); ô chọn trợ lý nhanh riêng.
- Công tắc **«Chữ: tự thêm emoji (auto)»** bật/tắt trên thiết bị (áp cho mọi tin, cả AI); `send_message.auto_emoji` (true/false) ghi đè từng tin. Thay công tắc «AI tự thêm emoji» cũ.
- README mô tả đầy đủ cài đặt, quy tắc auto, thứ tự ưu tiên và ví dụ.

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
