// helpers.js
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWebhookUrl as getConfigWebhookUrl } from '../services/webhookService.js';
import { getDataDirectory, getDataFilePath } from '../config/addon.js';
import { downloadToTemp } from './download.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hàm lấy đường dẫn đến thư mục cookies
export function getCookiesDir() {
    const cookiesDir = path.join(getDataDirectory(), 'cookies');
    
    // Đảm bảo thư mục cookies tồn tại
    if (!fs.existsSync(cookiesDir)) {
        try {
            fs.mkdirSync(cookiesDir, { recursive: true });
            console.log(`[Helpers] Đã tạo thư mục cookies tại: ${cookiesDir}`);
        } catch (error) {
            console.error(`[Helpers] Lỗi khi tạo thư mục cookies: ${error.message}`);
        }
    }
    
    return cookiesDir;
}

// Hàm lấy đường dẫn đến file proxy
export function getProxiesFilePath() {
    return getDataFilePath('proxies.json');
}

export function getWebhookUrl(key, ownId) {
    return getConfigWebhookUrl(key, ownId);
}

export async function triggerN8nWebhook(msg, webhookUrl) {
    if (!webhookUrl) {
        console.warn("Webhook URL is empty, skipping webhook trigger");
        return false;
    }
    
    try {
        const payload = JSON.stringify(msg);
        const maxBytes = 2 * 1024 * 1024;
        if (Buffer.byteLength(payload) > maxBytes) {
            throw new Error(`Webhook payload vuot qua gioi han ${maxBytes} bytes`);
        }
        await axios.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: Number.parseInt(process.env.WEBHOOK_TIMEOUT_MS || '10000', 10),
            maxBodyLength: maxBytes,
            maxContentLength: 1024 * 1024,
        });
        return true;
    } catch (error) {
        console.error("Error sending webhook request:", error.message);
        return false;
    }
}

export async function saveFileFromUrl(url) {
    try {
        const maxBytes = Number.parseInt(
            process.env.FILE_DOWNLOAD_MAX_BYTES || String(150 * 1024 * 1024),
            10,
        );
        return await downloadToTemp(url, { maxBytes });
    } catch (error) {
        console.error('Error saving file from URL:', error);
        return null;
    }
}

// Tên tệp PHẢI khác nhau mỗi lời gọi. Trước đây dùng cố định "temp.png":
// taiVeVaGuiNhieuAnh gọi hàm này một lần cho MỖI ảnh, nên cả N lần ghi lên cùng
// một tệp và mảng đường dẫn chứa N bản của CÙNG một đường dẫn. Zalo nhận đủ N
// tấm (soAnh báo đúng N) nhưng tấm nào cũng là ảnh tải về CUỐI CÙNG. Hai yêu cầu
// gửi chạy song song cũng ghi đè lẫn nhau vì lý do này.

// Đọc mấy byte đầu của tệp — dùng chung cho các hàm soi định dạng bên dưới.
function docDauTep(filePath, soByte = 12) {
    let fd = null;
    try {
        const dau = Buffer.alloc(soByte);
        fd = fs.openSync(filePath, 'r');
        const doDoc = fs.readSync(fd, dau, 0, soByte, 0);
        return doDoc > 0 ? dau.subarray(0, doDoc) : null;
    } catch (error) {
        console.error('Khong doc duoc dau tep vua tai ve:', error?.message || error);
        return null;
    } finally {
        if (fd !== null) { try { fs.closeSync(fd); } catch { /* da dong */ } }
    }
}

/**
 * Tệp tải về có THẬT SỰ là ảnh không — soi mấy byte đầu, không tin phần đuôi tên.
 * Trả về đuôi ứng với định dạng thật ('jpg'|'png'|'gif'|'webp'|'bmp'), hoặc null
 * nếu không phải ảnh.
 *
 * Vì sao cần: downloadToTemp chỉ xét `response.ok`. Một máy chủ đòi đăng nhập
 * thường trả 200 kèm trang HTML, và vì URL kết thúc bằng ".jpg" nên tệp tạm cũng
 * mang đuôi .jpg. Đo thật 24/08/2026: add-on tải chính trang admin-login của nó
 * (3.918 byte HTML) rồi đẩy lên Zalo như một tấm ảnh — Zalo nhận, lưu, và người
 * nhận thấy một ô đen 1280x720. Chặn ở đây thì hỏng ra lỗi, không ra ô đen.
 */
function duoiAnhThat(filePath) {
    const dau = docDauTep(filePath);
    if (!dau || dau.length < 2) return null;
    if (dau[0] === 0xFF && dau[1] === 0xD8 && dau[2] === 0xFF) return 'jpg'; // JPEG
    if (dau.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png'; // PNG
    if (dau.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif'; // GIF
    if (dau.subarray(0, 4).toString('latin1') === 'RIFF'
        && dau.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'; // WebP
    if (dau[0] === 0x42 && dau[1] === 0x4D) return 'bmp'; // BMP
    return null;
}

/**
 * Tệp vừa tải có phải MP4 thật không — ISO BMFF mang chữ 'ftyp' ở byte 4..8.
 * Loại nhánh QuickTime ('qt  ') ra: đó là .mov, đổi tên thành .mp4 là nói dối.
 */
function laMp4That(filePath) {
    const dau = docDauTep(filePath);
    if (!dau || dau.length < 12) return false;
    if (dau.subarray(4, 8).toString('latin1') !== 'ftyp') return false;
    return dau.subarray(8, 12).toString('latin1') !== 'qt  ';
}

// Đuôi đã coi là khớp sẵn với định dạng thật thì khỏi đổi tên.
const DUOI_KHOP_SAN = {
    jpg: ['jpg', 'jpeg'],
    png: ['png'],
    gif: ['gif'],
    webp: ['webp'],
    bmp: ['bmp'],
    mp4: ['mp4'],
};

/**
 * Đặt lại đuôi tên tệp tạm cho khớp ĐỊNH DẠNG THẬT của nội dung.
 *
 * zca-js phân loại tệp đính kèm bằng ĐUÔI TÊN, không soi nội dung: nó lấy
 * `path.extname()` rồi switch, ngoài jpg/jpeg/png/webp là xếp hết vào "others"
 * và đẩy qua asyncfile/upload — tới nơi thành TỆP ĐÍNH KÈM chứ không phải ảnh.
 * Mà tên tệp tạm lại lấy từ đường dẫn URL, nên ảnh camera của Home Assistant
 * (`/api/image_proxy/image.cua_nha_last_motion_image`) mang "đuôi"
 * `.cua_nha_last_motion_image`: đủ để downloadToTemp tưởng tệp đã có đuôi và bỏ
 * qua Content-Type `image/jpeg`. Đo thật 24/08/2026: ảnh cửa nhà tới Zalo dưới
 * dạng share.file, fileExt "cua_nha_last_motion_image", trong khi cùng ảnh đó
 * Telegram nhận đúng là ảnh vì Telegram soi nội dung.
 */
function doiDuoiChoKhop(duongDan, duoi) {
    const dangCo = path.extname(duongDan).slice(1).toLowerCase();
    if (DUOI_KHOP_SAN[duoi].includes(dangCo)) return duongDan;
    const duongDanMoi = `${duongDan}.${duoi}`;
    fs.renameSync(duongDan, duongDanMoi);
    return duongDanMoi;
}

export async function saveImage(url, maxBytesOverride, { throwOnError = false } = {}) {
    try {
        const configuredMaxBytes = Number.parseInt(
            process.env.IMAGE_DOWNLOAD_MAX_BYTES || String(25 * 1024 * 1024),
            10,
        );
        const maxBytes = Number.isSafeInteger(maxBytesOverride) && maxBytesOverride > 0
            ? Math.min(configuredMaxBytes, maxBytesOverride)
            : configuredMaxBytes;
        const duongDan = await downloadToTemp(url, { maxBytes });
        const duoi = duoiAnhThat(duongDan);
        if (!duoi) {
            const co = fs.existsSync(duongDan) ? fs.statSync(duongDan).size : 0;
            removeImage(duongDan);
            throw new Error(
                `Dia chi ${url} khong tra ve anh (tai duoc ${co} byte, khong khop `
                + 'dinh dang JPEG/PNG/GIF/WebP/BMP). Thuong la trang dang nhap hoac '
                + 'trang loi tra ve kem ma 200.',
            );
        }
        return doiDuoiChoKhop(duongDan, duoi);
    } catch (error) {
        console.error('Error saving image from URL:', error?.message || error);
        if (throwOnError) throw error;
        return null;
    }
}

/**
 * Tải video về và bảo đảm tên tệp tạm kết thúc bằng .mp4 khi nội dung đúng là MP4.
 *
 * zca-js chỉ cho đính kèm đi ĐƯỜNG VIDEO khi đuôi tên đúng "mp4"; mọi đuôi khác
 * rơi vào nhánh "others" và bay lên endpoint asyncfile — tới nơi thành tệp đính
 * kèm chứ không phải đoạn phim bấm phát được ngay trong khung chat. Mà tên tệp
 * tạm lấy từ đường dẫn URL, nên URL trỏ tới video mà không mang đuôi .mp4 là
 * hỏng đúng kiểu ảnh đã hỏng — xem doiDuoiChoKhop.
 *
 * Không phải MP4 thì để nguyên: Zalo không có đường video nào khác, và đổi tên
 * một tệp .mkv thành .mp4 chỉ là đẩy chỗ hỏng xuống máy người nhận.
 */
export async function saveVideoFromUrl(url) {
    const duongDan = await saveFileFromUrl(url);
    if (!duongDan) return duongDan;
    return laMp4That(duongDan) ? doiDuoiChoKhop(duongDan, 'mp4') : duongDan;
}

export function removeImage(imgPath) {
    try {
        if (fs.existsSync(imgPath)) {
            fs.unlinkSync(imgPath);
        }
    } catch (error) {
        console.error(`Error removing image ${imgPath}:`, error);
    }
}

export function removeFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error(`Error removing file ${filePath}:`, error);
    }
}
