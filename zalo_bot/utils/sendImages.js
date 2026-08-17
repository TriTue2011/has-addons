// Gửi NHIỀU ẢNH cho Zalo cá nhân — chia lô, nghỉ giữa lô, chặn sớm định dạng lạ.
//
// Vì sao cần lớp này thay vì gọi thẳng api.sendMessage({attachments: [...]}):
//
// 1. GIỚI HẠN SỐ ẢNH MỖI TIN do SERVER ZALO cấp, không nằm trong code. zca-js
//    đọc `settings.features.sharefile.max_file` từ phản hồi lúc đăng nhập rồi tự
//    ném `ZaloApiError: Exceed maximum file of N`. Gọi thẳng với 30 ảnh là mất cả
//    lô, không tấm nào tới — mà lỗi chỉ hiện lúc chạy.
// 2. RATE LIMIT LÀ RỦI RO THẬT VÀ KHÔNG AI BIẾT NGƯỠNG. Ba issue trên repo zca-js
//    (#114, #223, #325) báo `ZaloApiError: Vượt quá số request cho phép, code 221`
//    đúng khi gửi nhiều ảnh; chính người bảo trì trả lời là họ không rõ giới hạn,
//    chỉ khuyên "tạm dừng gửi 1h–24h". Nên phải nghỉ giữa các lô, không bắn liên
//    tục.
// 3. GIF ĐI ĐƯỜNG KHÁC. zca-js lọc gif ra khỏi `attachments` trước khi upload và
//    gửi riêng từng cái, nên trộn gif vào là phá khối album (mỗi gif thành một
//    tin). Chặn sớm và nói rõ còn hơn để người dùng thấy ảnh rời rạc mà không
//    hiểu vì sao.
// 4. CHỈ jpg/jpeg/png/webp vào được album — ext khác bị zca-js xếp loại "others"
//    và gửi như TỆP ĐÍNH KÈM, không phải ảnh.
//
// Nhiều ảnh + chữ = HAI tin nhắn: zca-js chỉ dán chữ làm caption khi gửi ĐÚNG MỘT
// ảnh; từ hai tấm trở lên nó gửi chữ ở tin riêng trước rồi mới tới album. Đây là
// hành vi cố ý của thư viện, không phải lỗi — nên mặc định chỉ gắn caption cho lô
// đầu, tránh chữ lặp lại ở mỗi lô.

import fs from 'node:fs/promises';
import path from 'node:path';

// Ext vào được KHỐI ALBUM (khớp danh sách trong zca-js uploadAttachment).
const EXT_ALBUM = new Set(['jpg', 'jpeg', 'png', 'webp']);

// Chốt an toàn khi không đọc được cấu hình từ server. Không phải giới hạn thật
// của Zalo — chỉ để không bao giờ bắn một lô khổng lồ khi thiếu thông tin.
const MAX_FILE_DU_PHONG = 6;
const NGHI_MAC_DINH_MS = 1500;

const extCuaFile = (p) => path.extname(p).slice(1).toLowerCase();

/** Giới hạn THẬT từ phiên Zalo. Đọc mỗi lần gửi vì nó thuộc phiên, không phải
 *  hằng số biên dịch — đổi tài khoản là đổi giá trị. */
export function docGioiHan(api) {
    let sf = null;
    try {
        sf = api.getContext()?.settings?.features?.sharefile || null;
    } catch {
        sf = null;
    }
    const maxFile = Number(sf?.max_file) > 0 ? Number(sf.max_file) : MAX_FILE_DU_PHONG;
    // max_size_share_file_v3 tính theo MB (zca-js nhân 1024*1024 khi so sánh).
    const maxBytes = Number(sf?.max_size_share_file_v3) > 0
        ? Number(sf.max_size_share_file_v3) * 1024 * 1024
        : 0;
    const extBiChan = Array.isArray(sf?.restricted_ext_file) ? sf.restricted_ext_file : [];
    return { maxFile, maxBytes, extBiChan, doDuocCauHinh: !!sf };
}

function chiaLo(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

/** Soát danh sách ảnh TRƯỚC khi gửi. Trả về {ok, loi[]} thay vì ném ngay, để
 *  người gọi báo được đủ mọi lỗi trong một lần thay vì sửa từng tấm một. */
export async function soatDanhSachAnh(duongDan, gioiHan) {
    const loi = [];
    for (const p of duongDan) {
        const ext = extCuaFile(p);
        if (ext === 'gif') {
            loi.push(`${path.basename(p)}: GIF đi đường riêng của Zalo, không vào chung khối ảnh — gửi tách`);
            continue;
        }
        if (!EXT_ALBUM.has(ext)) {
            loi.push(`${path.basename(p)}: chỉ jpg/jpeg/png/webp mới gửi được thành ảnh (ext khác sẽ thành tệp đính kèm)`);
            continue;
        }
        if (gioiHan.extBiChan.includes(ext)) {
            loi.push(`${path.basename(p)}: Zalo đang chặn ext .${ext}`);
            continue;
        }
        try {
            const st = await fs.stat(p);
            if (gioiHan.maxBytes > 0 && st.size > gioiHan.maxBytes) {
                loi.push(`${path.basename(p)}: ${(st.size / 1048576).toFixed(1)} MB, vượt giới hạn ${(gioiHan.maxBytes / 1048576).toFixed(0)} MB của Zalo`);
            }
        } catch (e) {
            loi.push(`${path.basename(p)}: không đọc được tệp (${e.message})`);
        }
    }
    return { ok: loi.length === 0, loi };
}

/**
 * Tải ảnh về từ URL/base64, gửi theo lô, dọn tệp tạm DÙ THÀNH CÔNG HAY LỖI.
 *
 * `tep` là {saveImage, removeImage} truyền từ ngoài vào — không import trực tiếp,
 * để hàm này test được mà không phải nạp cả zca-js và listener của zalo.js.
 *
 * Dọn trong finally chứ không phải sau lời gọi: guiNhieuAnh chủ động NÉM khi ảnh
 * sai định dạng hoặc quá dung lượng, nên đường lỗi bây giờ nhiều hơn đường thành
 * công. Dọn sau lời gọi là rò tệp tạm ở mọi lần người dùng gửi sai định dạng.
 */
export async function taiVeVaGuiNhieuAnh(tep, api, imageUrls, threadId, threadType, tuyChon = {}) {
    const duongDan = [];
    try {
        for (const url of imageUrls) {
            const p = await tep.saveImage(url);
            if (!p) throw new Error('Không thể lưu một hoặc nhiều hình ảnh');
            duongDan.push(p);
        }
        return await guiNhieuAnh(api, duongDan, threadId, threadType, tuyChon);
    } finally {
        for (const p of duongDan) tep.removeImage(p);
    }
}

/**
 * Gửi nhiều ảnh, chia lô theo giới hạn của Zalo.
 *
 * @param {object}   api        api của zca-js (đã đăng nhập)
 * @param {string[]} duongDan   ảnh cục bộ
 * @param {string}   threadId
 * @param {number}   threadType ThreadType.User | ThreadType.Group
 * @param {object}   tuyChon    {caption, nghiMs, captionChiLoDau}
 * @returns {Promise<{ok, soAnh, soLo, ketQua[], canhBao[]}>}
 */
export async function guiNhieuAnh(api, duongDan, threadId, threadType, tuyChon = {}) {
    const {
        caption = '',
        nghiMs = NGHI_MAC_DINH_MS,
        captionChiLoDau = true,
    } = tuyChon;

    if (!Array.isArray(duongDan) || duongDan.length === 0) {
        throw new Error('Danh sách ảnh trống');
    }

    const gioiHan = docGioiHan(api);
    const soat = await soatDanhSachAnh(duongDan, gioiHan);
    if (!soat.ok) {
        // Chặn TRƯỚC khi upload: để zca-js ném giữa chừng thì một phần ảnh đã lên
        // server Zalo rồi, người dùng nhận được lô dở dang mà không biết thiếu gì.
        const e = new Error('Ảnh không hợp lệ:\n- ' + soat.loi.join('\n- '));
        e.chiTiet = soat.loi;
        throw e;
    }

    const canhBao = [];
    if (!gioiHan.doDuocCauHinh) {
        canhBao.push(`Không đọc được giới hạn từ phiên Zalo, tạm dùng ${gioiHan.maxFile} ảnh/tin`);
    }
    if (caption && duongDan.length > 1) {
        canhBao.push('Nhiều ảnh kèm chữ: Zalo sẽ gửi chữ ở MỘT TIN RIÊNG trước, rồi mới tới khối ảnh');
    }

    const cacLo = chiaLo(duongDan, gioiHan.maxFile);
    const ketQua = [];
    for (let i = 0; i < cacLo.length; i++) {
        // msg PHẢI có, dù rỗng: zca-js đọc `msg.length` nên thiếu nó là
        // TypeError "Cannot read properties of undefined".
        const res = await api.sendMessage(
            {
                msg: (captionChiLoDau && i > 0) ? '' : caption,
                attachments: cacLo[i],
            },
            threadId,
            threadType,
        );
        ketQua.push(res);
        // Nghỉ giữa các lô — xem chú thích (2) đầu file. Lô cuối không cần nghỉ.
        if (i < cacLo.length - 1) await nghi(nghiMs);
    }

    return {
        ok: true,
        soAnh: duongDan.length,
        soLo: cacLo.length,
        maxFile: gioiHan.maxFile,
        ketQua,
        canhBao,
    };
}
