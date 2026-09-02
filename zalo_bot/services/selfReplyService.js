// selfReplyService.js
// Cấu hình "trả lời cả tin của chính chủ" THEO TỪNG THREAD ID.
//
// Bot đăng nhập bằng chính tài khoản chủ nên tin chủ tự gõ bị Zalo đánh isSelf.
// Mỗi thread bật/tắt riêng (mặc định TẮT) và có TỪ KHÓA riêng: tin isSelf trong
// thread đó CÓ chứa từ khóa mới được coi là lệnh của chủ (self_reply=true). Câu
// bot tự sinh không chứa từ khóa → không khớp → không lặp.
//
// Lưu ở data-dir/self-reply-config.json: { "<threadId>": { enabled, keyword } }.
// Quản lý qua WebUI của add-on (dùng được cho cả add-on HA lẫn docker).
import fs from 'fs';
import { getDataFilePath } from '../config/addon.js';
import { getSelfReplyKeyword } from '../config/addon.js';
import { writeJsonAtomicSync } from '../utils/atomicFile.js';

function configPath() {
    return getDataFilePath('self-reply-config.json');
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

    getAll() {
        return this.map;
    }

    // Cấu hình hiệu lực cho một thread: {enabled, keyword}. Không có bản ghi =
    // tắt (mặc định). Keyword rỗng thì rơi về từ khóa toàn cục (env) nếu có.
    get(threadId) {
        const v = this.map[String(threadId || '').trim()];
        const enabled = !!(v && v.enabled);
        let keyword = v && typeof v.keyword === 'string' ? v.keyword.trim() : '';
        if (enabled && !keyword) {
            try { keyword = (getSelfReplyKeyword() || '').trim(); } catch (_) { keyword = ''; }
        }
        return { enabled, keyword };
    }

    set(threadId, enabled, keyword) {
        const id = String(threadId || '').trim();
        if (!id) throw new Error('threadId trống');
        this.map[id] = {
            enabled: !!enabled,
            keyword: String(keyword || '').trim(),
        };
        writeJsonAtomicSync(configPath(), this.map);
        return this.map[id];
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
export const setSelfReply = (threadId, enabled, keyword) =>
    selfReplyService.set(threadId, enabled, keyword);
export const removeSelfReply = (threadId) => selfReplyService.remove(threadId);
