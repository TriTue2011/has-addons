// helpers.js
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { getWebhookUrl as getConfigWebhookUrl } from '../services/webhookService.js';
import { getDataDirectory, getDataFilePath } from '../config/addon.js';

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
        await axios.post(webhookUrl, msg, { headers: { 'Content-Type': 'application/json' } });
        return true;
    } catch (error) {
        console.error("Error sending webhook request:", error.message);
        return false;
    }
}

export async function saveFileFromUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        const contentDisposition = response.headers.get('content-disposition');
        let filename;

        if (contentDisposition && contentDisposition.includes('filename=')) {
            const matches = /filename="?([^"]+)"?/.exec(contentDisposition);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }

        if (!filename) {
            filename = path.basename(new URL(url).pathname);
        }

        // Tạo một đường dẫn tạm thời an toàn
        const tempDir = path.join(process.cwd(), 'data', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFilePath = path.join(tempDir, `${Date.now()}-${filename}`);

        if (!response.body) {
            throw new Error("Response body is empty, cannot save the file.");
        }

        // Sửa lỗi: response.body từ 'node-fetch' đã là một Node.js stream,
        // nên có thể dùng trực tiếp với pipeline.
        await pipeline(
            response.body,
            fs.createWriteStream(tempFilePath)
        );

        return tempFilePath;
    } catch (error) {
        console.error('Error saving file from URL:', error);
        return null;
    }
}

export async function saveImage(url) {
    try {
        const imgPath = path.join(process.cwd(), "temp.png");

        const { data } = await axios.get(url, { responseType: "arraybuffer" });
        fs.writeFileSync(imgPath, Buffer.from(data, "utf-8"));

        return imgPath;
    } catch (error) {
        console.error(error);
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