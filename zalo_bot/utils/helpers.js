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
export async function saveImage(url, maxBytesOverride, { throwOnError = false } = {}) {
    try {
        const configuredMaxBytes = Number.parseInt(
            process.env.IMAGE_DOWNLOAD_MAX_BYTES || String(25 * 1024 * 1024),
            10,
        );
        const maxBytes = Number.isSafeInteger(maxBytesOverride) && maxBytesOverride > 0
            ? Math.min(configuredMaxBytes, maxBytesOverride)
            : configuredMaxBytes;
        return await downloadToTemp(url, { maxBytes });
    } catch (error) {
        console.error('Error saving image from URL:', error?.message || error);
        if (throwOnError) throw error;
        return null;
    }
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
