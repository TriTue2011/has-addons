// webhookConfig.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { getDataFilePath } from '../config/addon.js';
import { writeJsonAtomicSync } from '../utils/atomicFile.js';
import { broadcastMessage } from '../services/websocketHub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hàm lấy đường dẫn đến file cấu hình webhook - sử dụng thư mục dữ liệu tùy chỉnh
function getWebhookConfigPath() {
    const path = getDataFilePath('webhook-config.json');
    console.log(`[WebhookService] Lấy đường dẫn file webhook-config.json: ${path}`);
    return path;
}

// Cấu trúc dữ liệu mặc định
const defaultConfig = {
    // Webhook mặc định từ .env
    default: {
        messageWebhookUrl: process.env.MESSAGE_WEBHOOK_URL || "",
        groupEventWebhookUrl: process.env.GROUP_EVENT_WEBHOOK_URL || "",
        reactionWebhookUrl: process.env.REACTION_WEBHOOK_URL || ""
    },
    // Cấu hình theo ownId
    accounts: {}
};

// Biến lưu trữ cấu hình webhook
let webhookConfig = defaultConfig;

// Hàm đọc cấu hình webhook từ file
export function loadWebhookConfig() {
    try {
        const webhookConfigPath = getWebhookConfigPath();
        console.log(`[WebhookService] Đang tải cấu hình webhook từ ${webhookConfigPath}`);
        
        // Kiểm tra thư mục có tồn tại
        const dir = path.dirname(webhookConfigPath);
        console.log(`[WebhookService] Thư mục cấu hình webhook: ${dir}`);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[WebhookService] Đã tạo thư mục ${dir}`);
        }
        
        if (fs.existsSync(webhookConfigPath)) {
            console.log(`[WebhookService] File cấu hình webhook tồn tại: ${webhookConfigPath}`);
            
            // Kiểm tra quyền đọc file
            try {
                const stats = fs.statSync(webhookConfigPath);
                console.log(`[WebhookService] File cấu hình kích thước: ${stats.size} bytes`);
                console.log(`[WebhookService] File quyền: ${JSON.stringify(stats.mode)}`);
                
                if (stats.size === 0) {
                    console.warn("[WebhookService] File cấu hình rỗng, sử dụng cấu hình mặc định");
                    saveWebhookConfig();
                    return;
                }
            } catch (statError) {
                console.error(`Lỗi khi kiểm tra thông tin file: ${statError.message}`);
            }
            
            try {
                const configData = fs.readFileSync(webhookConfigPath, 'utf8');
                webhookConfig = JSON.parse(configData);
                console.log("Đã tải cấu hình webhook thành công");
                
                // Đảm bảo cấu trúc dữ liệu đúng
                if (!webhookConfig.default) {
                    console.warn("Cấu hình không có phần default, thêm vào");
                    webhookConfig.default = defaultConfig.default;
                }
                
                if (!webhookConfig.accounts) {
                    console.warn("Cấu hình không có phần accounts, thêm vào");
                    webhookConfig.accounts = {};
                }
                
                // Đồng bộ cấu hình với biến môi trường
                syncWebhookConfig();
            } catch (readError) {
                console.error(`Lỗi khi đọc/phân tích file cấu hình: ${readError.message}`);
                // Nếu không đọc được file hoặc JSON không hợp lệ, sử dụng cấu hình mặc định
                webhookConfig = defaultConfig;
                // Lưu lại cấu hình mặc định
                saveWebhookConfig();
            }
        } else {
            console.log(`File cấu hình webhook không tồn tại, tạo mới: ${webhookConfigPath}`);
            // Nếu file không tồn tại, tạo mới với cấu hình mặc định
            webhookConfig = defaultConfig;
            saveWebhookConfig();
        }
    } catch (error) {
        console.error("Lỗi khi tải cấu hình webhook:", error);
        // Đảm bảo luôn có cấu hình mặc định
        webhookConfig = defaultConfig;
    }
}

// Hàm lưu cấu hình webhook vào file
export function saveWebhookConfig() {
    try {
        const webhookConfigPath = getWebhookConfigPath();
        // Kiểm tra thư mục có tồn tại
        const dir = path.dirname(webhookConfigPath);
        console.log(`[WebhookService] Đang lưu cấu hình webhook vào thư mục: ${dir}`);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[WebhookService] Đã tạo thư mục ${dir}`);
        }
        
        // Kiểm tra quyền ghi file
        try {
            // Thử ghi một file tạm để kiểm tra quyền ghi
            const testPath = path.join(dir, '.test_write_permission');
            fs.writeFileSync(testPath, 'test', { flag: 'w' });
            fs.unlinkSync(testPath); // Xóa file test
        } catch (writeError) {
            console.error(`Không có quyền ghi vào thư mục ${dir}:`, writeError);
            throw new Error(`Không có quyền ghi vào thư mục ${dir}: ${writeError.message}`);
        }
        
        // Ghi nguyên tử (tệp tạm rồi rename). Bản cũ ghi đè thẳng, nên mất
        // điện đúng lúc ghi là hỏng tệp cấu hình webhook.
        writeJsonAtomicSync(webhookConfigPath, webhookConfig);
        console.log(`[WebhookService] Đã lưu cấu hình webhook vào ${webhookConfigPath}`);
        return true;
    } catch (error) {
        console.error("Lỗi khi lưu cấu hình webhook:", error);
        // Thử ghi vào thư mục tạm nếu thư mục gốc bị lỗi
        try {
            const tempDir = os.tmpdir();
            const tempPath = path.join(tempDir, 'webhookConfig.json');
            fs.writeFileSync(tempPath, JSON.stringify(webhookConfig, null, 2), 'utf8');
            console.log(`Đã lưu cấu hình webhook vào thư mục tạm: ${tempPath}`);
            return false;
        } catch (tempError) {
            console.error("Không thể lưu cấu hình webhook vào thư mục tạm:", tempError);
            return false;
        }
    }
}

// Hàm lấy webhook URL theo ownId và loại
export function getWebhookUrl(key, ownId) {
    try {
        // Nếu có ownId và có cấu hình riêng cho ownId đó
        if (ownId && webhookConfig.accounts[ownId] && webhookConfig.accounts[ownId][key]) {
            return webhookConfig.accounts[ownId][key];
        }
        
        // Nếu không có cấu hình riêng, sử dụng cấu hình mặc định
        return webhookConfig.default[key] || "";
    } catch (error) {
        console.error("Lỗi khi lấy webhook URL:", error);
        return "";
    }
}

// Ghi webhook MẶC ĐỊNH (áp cho mọi tài khoản chưa có cấu hình riêng) vào file
// cấu hình trong thư mục dữ liệu, để nó sống qua các lần cập nhật add-on.
export function setDefaultWebhookUrl(key, url) {
    try {
        webhookConfig.default[key] = url;
        return saveWebhookConfig();
    } catch (error) {
        console.error("Lỗi khi thiết lập webhook mặc định:", error);
        return false;
    }
}

// Hàm thiết lập webhook URL cho một số điện thoại cụ thể
export function setWebhookUrl(ownId, key, url) {
    try {
        // Đảm bảo đã khởi tạo đối tượng cho ownId
        if (!webhookConfig.accounts[ownId]) {
            webhookConfig.accounts[ownId] = {};
        }
        
        // Thiết lập URL cho key tương ứng
        webhookConfig.accounts[ownId][key] = url;
        
        // Lưu cấu hình vào file
        console.log(`[WebhookService] Đang lưu cấu hình webhook cho ownId=${ownId}, key=${key}`);
        const result = saveWebhookConfig();
        console.log(`[WebhookService] Kết quả lưu cấu hình: ${result ? 'Thành công' : 'Thất bại'}`);
        return result;
    } catch (error) {
        console.error("Lỗi khi thiết lập webhook URL:", error);
        return false;
    }
}

// Hàm xóa cấu hình webhook cho một số điện thoại
export function removeWebhookConfig(ownId) {
    try {
        if (webhookConfig.accounts[ownId]) {
            delete webhookConfig.accounts[ownId];
            console.log(`[WebhookService] Đã xóa cấu hình webhook cho ownId=${ownId}`);
            const result = saveWebhookConfig();
            console.log(`[WebhookService] Kết quả xóa cấu hình: ${result ? 'Thành công' : 'Thất bại'}`);
        }
        return true;
    } catch (error) {
        console.error("Lỗi khi xóa cấu hình webhook:", error);
        return false;
    }
}

// Hàm lấy toàn bộ cấu hình webhook
export function getAllWebhookConfigs() {
    return webhookConfig;
}

// Hàm đồng bộ cấu hình webhook với biến môi trường
export function syncWebhookConfig() {
    // Đảm bảo cấu hình mặc định luôn sử dụng giá trị từ biến môi trường
    if (process.env.MESSAGE_WEBHOOK_URL) {
        webhookConfig.default.messageWebhookUrl = process.env.MESSAGE_WEBHOOK_URL;
    }
    if (process.env.GROUP_EVENT_WEBHOOK_URL) {
        webhookConfig.default.groupEventWebhookUrl = process.env.GROUP_EVENT_WEBHOOK_URL;
    }
    if (process.env.REACTION_WEBHOOK_URL) {
        webhookConfig.default.reactionWebhookUrl = process.env.REACTION_WEBHOOK_URL;
    }
    
    // Lưu cấu hình đã đồng bộ
    return saveWebhookConfig();
}

// Hàm gửi tin nhắn đến tất cả WebSocket clients
export function broadcastToWebsocket(data) {
  try {
    // Log để debug
    console.log(`[WebhookService] Gửi dữ liệu tới WebSocket clients:`, data);
    
    // Chuyển đổi dữ liệu thành chuỗi JSON
    const message = JSON.stringify(data);
    
    // Gửi tới tất cả clients
    broadcastMessage(message);
    
    return true;
  } catch (error) {
    console.error(`[WebhookService] Lỗi khi gửi dữ liệu tới WebSocket:`, error);
    return false;
  }
}

// KHÔNG tự nạp lúc import: app.js đã gọi loadWebhookConfig() sau khi
// loadHomeAssistantOptions() chốt xong thư mục dữ liệu. Nạp ở đây chạy TRƯỚC
// bước đó, nên khi DATA_DIRECTORY chưa có trong môi trường thì lần nạp đầu đọc
// và tạo tệp ở đường dẫn khác với lần thứ hai.

export default {
    getWebhookUrl,
    setWebhookUrl,
    setDefaultWebhookUrl,
    removeWebhookConfig,
    loadWebhookConfig,
    saveWebhookConfig,
    getAllWebhookConfigs,
    syncWebhookConfig,
    broadcastToWebsocket
};