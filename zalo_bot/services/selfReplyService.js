// selfReplyService.js
// Cấu hình "trả lời cả tin của chính chủ" THEO TỪNG THREAD ID.
//
// Bot đăng nhập bằng chính tài khoản chủ nên tin chủ tự gõ bị Zalo đánh isSelf.
// Mỗi thread bật/tắt riêng (mặc định TẮT) và có DANH SÁCH TỪ KHÓA riêng: tin
// isSelf trong thread đó chứa BẤT KỲ từ khóa nào mới được coi là lệnh của chủ
// (self_reply=true, kèm tag_khop cho biết trúng từ khóa nào). Câu bot tự sinh
// không chứa từ khóa nào → không khớp → không lặp.
//
// Vì sao NHIỀU từ khóa chứ không phải một: để mỗi tag đi một nơi — '@ha' cho
// automation Home Assistant, '@n8n' cho n8n, '@toi' cho bot AI… Add-on chỉ báo
// TRÚNG TAG NÀO; chọn đường đi là việc của bên nhận webhook. Cố ý không định
// tuyến ở đây, kẻo có hai nơi cùng quyết định "ai trả lời cái gì".
//
// Lưu ở data-dir/self-reply-config.json:
//   { "<threadId>": { enabled, keywords: ["@toi", "@ha"] } }
// Bản ghi cũ dạng { enabled, keyword: "@toi" } vẫn đọc được (hoá thành danh
// sách một phần tử lúc đọc); lần lưu kế tiếp ghi ra dạng mới.
import fs from 'fs';
import { getDataFilePath } from '../config/addon.js';
import { writeJsonAtomicSync } from '../utils/atomicFile.js';

function configPath() {
    return getDataFilePath('self-reply-config.json');
}

// Nhận mảng, hoặc chuỗi nhiều từ khóa cách nhau bằng dấu phẩy / xuống dòng.
// Bỏ khoảng trắng thừa, bỏ mục rỗng, bỏ trùng (không phân biệt hoa thường).
function chuanHoaDanhSach(nguon) {
    const tho = Array.isArray(nguon) ? nguon : String(nguon ?? '').split(/[,\n]/);
    const ra = [];
    for (const x of tho) {
        const s = String(x ?? '').trim();
        if (s && !ra.some((y) => y.toLowerCase() === s.toLowerCase())) ra.push(s);
    }
    return ra;
}

class SelfReplyService {
    constructor() {
        this.map = {};
        try {
            const data = fs.readFileSync(configPath(), 'utf8');
            const parsed = JSON.parse(data);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                this.map = parsed;
            }
        } catch (err) {
            this.map = {};
            if (err.code === 'ENOENT') {
                try { writeJsonAtomicSync(configPath(), {}); } catch (_) { /* noop */ }
            } else {
                console.error('[SelfReply] Không đọc được self-reply-config.json:', err.message);
            }
        }
    }

    // Toàn bộ cấu hình, đã chuẩn hoá về dạng mới để WebUI khỏi phải biết dạng cũ.
    getAll() {
        const ra = {};
        for (const id of Object.keys(this.map)) ra[id] = this.get(id);
        return ra;
    }

    // Cấu hình hiệu lực cho một thread: {enabled, keywords}. Không có bản ghi =
    // tắt (mặc định). Bật mà danh sách rỗng cũng coi như tắt — không có từ khóa
    // thì không phân biệt được tin chủ với câu bot tự sinh (chống lặp).
    get(threadId) {
        const v = this.map[String(threadId || '').trim()];
        const keywords = chuanHoaDanhSach(
            v && (Array.isArray(v.keywords) ? v.keywords : v.keyword));
        const enabled = !!(v && v.enabled) && keywords.length > 0;
        return { enabled, keywords };
    }

    // Từ khóa vừa trúng trong ``text``, '' nếu không trúng.
    //
    // Không phân biệt hoa thường — cổng gateway bên chatgpt2api cũng vậy, để
    // cùng một từ khóa không xử sự khác nhau tuỳ tầng nào quyết. Thử từ khóa
    // DÀI trước để '@n8n' không bị '@n' nuốt khi khai cả hai.
    // ``batBuocBat`` = có đòi thread phải BẬT không. Bật là chốt chống lặp, chỉ
    // cần cho tin CHỦ TỰ GỬI; tin người khác không có nguy cơ lặp nên dán nhãn
    // tag được kể cả khi thread chưa bật, để automation chỉ phải rẽ theo MỘT
    // trường ``tag_khop`` cho cả hai chiều.
    khop(threadId, text, batBuocBat = true) {
        const { enabled, keywords } = this.get(threadId);
        if (batBuocBat && !enabled) return '';
        if (!keywords.length || typeof text !== 'string' || !text) return '';
        const hay = text.toLowerCase();
        for (const kw of [...keywords].sort((a, b) => b.length - a.length)) {
            if (hay.includes(kw.toLowerCase())) return kw;
        }
        return '';
    }

    set(threadId, enabled, keywords) {
        const id = String(threadId || '').trim();
        if (!id) throw new Error('threadId trống');
        this.map[id] = {
            enabled: !!enabled,
            keywords: chuanHoaDanhSach(keywords),
        };
        writeJsonAtomicSync(configPath(), this.map);
        return this.get(id);
    }

    remove(threadId) {
        const id = String(threadId || '').trim();
        if (this.map[id]) {
            delete this.map[id];
            writeJsonAtomicSync(configPath(), this.map);
        }
        return true;
    }
}

const selfReplyService = new SelfReplyService();

export { selfReplyService };
export const getSelfReplyConfig = (threadId) => selfReplyService.get(threadId);
export const getAllSelfReply = () => selfReplyService.getAll();
export const setSelfReply = (threadId, enabled, keywords) =>
    selfReplyService.set(threadId, enabled, keywords);
export const removeSelfReply = (threadId) => selfReplyService.remove(threadId);
export const khopTuKhoa = (threadId, text) => selfReplyService.khop(threadId, text);
// Dán nhãn tag cho tin NGƯỜI KHÁC: không đòi thread phải bật, vì cờ bật chỉ là
// chốt chống lặp cho tin tự gửi.
export const nhanTag = (threadId, text) => selfReplyService.khop(threadId, text, false);
