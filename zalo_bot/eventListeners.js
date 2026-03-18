import { GroupEventType } from "zca-js";
import { getWebhookUrl, triggerN8nWebhook } from './utils/helpers.js';
import { broadcastToWebsocket } from './services/webhookService.js';
import fs from 'fs';
import { loginZaloAccount, zaloAccounts } from './api/zalo/zalo.js';
import { broadcastMessage } from './server.js';

// Biến để theo dõi thời gian relogin cho từng tài khoản
export const reloginAttempts = new Map();
// Thời gian tối thiểu giữa các lần thử relogin (5 phút)
const RELOGIN_COOLDOWN = 5 * 60 * 1000;

export function setupEventListeners(api, loginResolve) {
    const ownId = api.getOwnId();
    
    // Lắng nghe sự kiện tin nhắn và gửi đến webhook được cấu hình cho tin nhắn
    api.listener.on("message", (msg) => {
        const messageWebhookUrl = getWebhookUrl("messageWebhookUrl", ownId);
        // Thêm ownId vào dữ liệu để webhook biết tin nhắn từ tài khoản nào
        const msgWithOwnId = { ...msg, _accountId: ownId };
        
        // Gửi tới webhook nếu được cấu hình
        if (messageWebhookUrl) {
            triggerN8nWebhook(msgWithOwnId, messageWebhookUrl);
        }
        
        // Broadcast tin nhắn tới WebSocket cho trang hiển thị thread_id
        broadcastToWebsocket(msgWithOwnId);
    });

    // Lắng nghe sự kiện nhóm và gửi đến webhook được cấu hình cho sự kiện nhóm
    api.listener.on("group_event", (data) => {
        const groupEventWebhookUrl = getWebhookUrl("groupEventWebhookUrl", ownId);
        // Thêm ownId vào dữ liệu
        const dataWithOwnId = { ...data, _accountId: ownId };
        
        // Gửi tới webhook nếu được cấu hình
        if (groupEventWebhookUrl) {
            triggerN8nWebhook(dataWithOwnId, groupEventWebhookUrl);
        }
        
        // Broadcast sự kiện nhóm tới WebSocket 
        broadcastToWebsocket(dataWithOwnId);
    });

    // Lắng nghe sự kiện reaction và gửi đến webhook được cấu hình cho reaction
    api.listener.on("reaction", (reaction) => {
        const reactionWebhookUrl = getWebhookUrl("reactionWebhookUrl", ownId);
        console.log("Nhận reaction:", reaction);
        if (reactionWebhookUrl) {
            // Thêm ownId vào dữ liệu
            const reactionWithOwnId = { ...reaction, _accountId: ownId };
            triggerN8nWebhook(reactionWithOwnId, reactionWebhookUrl);
        }
    });

    api.listener.onConnected(() => {
        console.log(`Connected account ${ownId}`);
        loginResolve('login_success');
        
        // Gửi thông báo đến tất cả client
        try {
            broadcastMessage('login_success');
        } catch (err) {
            console.error('Lỗi khi gửi thông báo WebSocket:', err);
        }
    });
    
    api.listener.onClosed(() => {
        console.log(`Closed - API listener đã ngắt kết nối cho tài khoản ${ownId}`);
        
        // Xử lý đăng nhập lại khi API listener bị đóng
        handleRelogin(api);
    });
    
    api.listener.onError((error) => {
        console.error(`Error on account ${ownId}:`, error);
    });
}

// Hàm xử lý đăng nhập lại
async function handleRelogin(api) {
    try {
        console.log("Đang thử đăng nhập lại...");
        
        // Lấy ownId của tài khoản bị ngắt kết nối
        const ownId = api.getOwnId();
        
        if (!ownId) {
            console.error("Không thể xác định ownId, không thể đăng nhập lại");
            return;
        }
        
        // Kiểm tra thời gian relogin gần nhất
        const lastReloginTime = reloginAttempts.get(ownId);
        const now = Date.now();
        
        if (lastReloginTime && now - lastReloginTime < RELOGIN_COOLDOWN) {
            console.log(`Bỏ qua việc đăng nhập lại tài khoản ${ownId}, đã thử cách đây ${Math.floor((now - lastReloginTime) / 1000)} giây`);
            return;
        }
        
        // Cập nhật thời gian relogin
        reloginAttempts.set(ownId, now);
        
        // Tìm thông tin proxy từ mảng zaloAccounts
        const accountInfo = zaloAccounts.find(acc => acc.ownId === ownId);
        const customProxy = accountInfo?.proxy || null;
        
        // Tìm file cookie tương ứng
        const cookiesDir = './data/cookies';
        const cookieFile = `${cookiesDir}/cred_${ownId}.json`;
        
        if (!fs.existsSync(cookieFile)) {
            console.error(`Không tìm thấy file cookie cho tài khoản ${ownId}`);
            return;
        }
        
        // Đọc cookie từ file
        const cookie = JSON.parse(fs.readFileSync(cookieFile, "utf-8"));
        
        // Đăng nhập lại với cookie
        console.log(`Đang đăng nhập lại tài khoản ${ownId} với proxy ${customProxy || 'không có'}...`);
        
        // Thực hiện đăng nhập lại
        await loginZaloAccount(customProxy, cookie);
        console.log(`Đã đăng nhập lại thành công tài khoản ${ownId}`);
    } catch (error) {
        console.error("Lỗi khi thử đăng nhập lại:", error);
    }
}
