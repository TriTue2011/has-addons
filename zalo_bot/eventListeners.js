import { getWebhookUrl, triggerN8nWebhook, getCookiesDir } from './utils/helpers.js';
import { broadcastToWebsocket } from './services/webhookService.js';
import fs from 'fs';
import path from 'path';
import { broadcastMessage } from './services/websocketHub.js';
import { storeGroupMessage } from './utils/groupHistoryStore.js';
import { noteSelfMessage } from './services/messageExpiry.js';
import { reconnectDelay } from './services/reconnectPolicy.js';
import { beginReconnectAttempt, invalidateReconnectAttempt } from './services/reconnectGuard.js';
import { withTimeout } from './utils/timeout.js';
import { khopTuKhoa } from './services/selfReplyService.js';

let reconnectLogin = null;
let accountRegistry = [];

export function configureReconnectDependencies({ login, accounts }) {
    if (typeof login !== 'function' || !Array.isArray(accounts)) {
        throw new Error('Reconnect dependencies khong hop le');
    }
    reconnectLogin = login;
    accountRegistry = accounts;
}
export const reloginAttempts = new Map();
const reconnectStates = new Map();

function reconnectTimeoutMs() {
    const timeout = Number.parseInt(process.env.RECONNECT_LOGIN_TIMEOUT_MS || '60000', 10);
    return Number.isSafeInteger(timeout) && timeout > 0 ? timeout : 60000;
}

function clearReconnectState(ownId) {
    const state = reconnectStates.get(ownId);
    if (state?.timer) clearTimeout(state.timer);
    reconnectStates.delete(ownId);
    reloginAttempts.delete(ownId);
}

function scheduleRelogin(api) {
    const ownId = api?.getOwnId?.();
    if (!ownId) return;
    const current = accountRegistry.find((account) => String(account.ownId) === String(ownId));
    if (current?.api && current.api !== api) return;
    let state = reconnectStates.get(ownId);
    if (!state) {
        state = { attempt: 0, timer: null, running: false, sourceApi: api, generation: 0 };
        reconnectStates.set(ownId, state);
    }
    if (state.running || state.timer) return;
    const delay = reconnectDelay(state.attempt);
    console.log(`[Reconnect] Thu lai ${ownId} sau ${Math.round(delay / 1000)}s (lan ${state.attempt + 1}).`);
    state.timer = setTimeout(() => { void attemptRelogin(ownId); }, delay);
    state.timer.unref?.();
}

async function attemptRelogin(ownId) {
    const state = reconnectStates.get(ownId);
    if (!state || state.running) return;
    state.timer = null;
    state.running = true;
    const isCurrentAttempt = beginReconnectAttempt(reconnectStates, ownId, state);
    reloginAttempts.set(ownId, Date.now());
    try {
        const account = accountRegistry.find((item) => String(item.ownId) === String(ownId));
        if (account?.api && account.api !== state.sourceApi) {
            clearReconnectState(ownId);
            return;
        }
        const credentialPath = path.join(getCookiesDir(), `cred_${ownId}.json`);
        if (!fs.existsSync(credentialPath)) {
            console.error(`[Reconnect] Khong co credential cho ${ownId}.`);
            clearReconnectState(ownId);
            return;
        }
        const credential = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
        const hasSavedProxy = Object.prototype.hasOwnProperty.call(credential, 'proxy');
        const hasAccountProxy = account && Object.prototype.hasOwnProperty.call(account, 'proxy');
        const savedProxy = hasSavedProxy ? (credential.proxy || null) : (account?.proxy || null);
        if (!reconnectLogin) throw new Error('Reconnect chua duoc khoi tao');
        await withTimeout(
            reconnectLogin(savedProxy, credential, {
                allowQrFallback: false,
                autoSelectProxy: !(hasSavedProxy || hasAccountProxy),
                isCurrentAttempt,
            }),
            reconnectTimeoutMs(),
            'Reconnect login timeout',
        );
        clearReconnectState(ownId);
    } catch (error) {
        console.error(`[Reconnect] Lan ${state.attempt + 1} loi cho ${ownId}: ${error.message}`);
        invalidateReconnectAttempt(state);
        state.running = false;
        state.attempt += 1;
        reconnectStates.set(ownId, state);
        scheduleRelogin(state.sourceApi);
    }
}

// Không nhận `loginResolve` nữa: xem ghi chú ở onConnected bên dưới.
export function setupEventListeners(api) {
    const ownId = api.getOwnId();
    
    // Lắng nghe sự kiện tin nhắn và gửi đến webhook được cấu hình cho tin nhắn
    api.listener.on("message", (msg) => {
        if (Number(msg?.type) === 1) {
            storeGroupMessage(ownId, msg);
        }
        // Bản dội về của tin TỰ GỬI là nơi duy nhất lấy được cliMsgId — thứ mà
        // api.undo đòi nhưng phản hồi lúc gửi không trả. Xem services/messageExpiry.js.
        if (msg?.isSelf) noteSelfMessage(msg);
        // Thêm ownId vào dữ liệu để webhook biết tin nhắn từ tài khoản nào
        const msgWithOwnId = { ...msg, _accountId: ownId };

        // TIN DO CHÍNH TÀI KHOẢN NÀY GỬI (msg.isSelf) KHÔNG ĐẨY RA WEBHOOK.
        // Listener bật selfListen: true để giao diện thấy cả tin gửi từ máy
        // khác, nhưng bên nhận webhook (bot AI, n8n, automation Home Assistant)
        // hiểu mọi sự kiện "message" là tin ĐẾN: nó trả lời → tin trả lời sinh
        // ra sự kiện mới → nó lại trả lời, thành vòng lặp bot tự nói chuyện với
        // chính mình. Log 18/08: mỗi tin trích dẫn lại tin trước của chính bot,
        // lặp đều khoảng 4 giây cho tới khi tắt add-on.
        if (!msg.isSelf) {
            const messageWebhookUrl = getWebhookUrl("messageWebhookUrl", ownId);
            if (messageWebhookUrl) {
                triggerN8nWebhook(msgWithOwnId, messageWebhookUrl);
            }
        } else {
            // TIN CHU TU GUI: mac dinh KHONG day (chong lap). CHI day khi thread
            // nay da BAT (cau hinh per-thread tren WebUI) VA tin chua MOT TRONG
            // CAC TU KHOA cua thread do — do la lenh cua chu, gan self_reply=true
            // kem tag_khop. Cau bot tu sinh khong chua tu khoa nao -> van khong
            // day -> khong lap.
            try {
                const tid = String(msg?.threadId ?? msg?.data?.idTo ?? '');
                const c = msg?.data?.content;
                const text = typeof c === 'string' ? c : (c && (c.msg || c.title)) || '';
                // Trung BAT KY tu khoa nao cua thread thi day di, kem tag_khop de
                // ben nhan biet la lenh cho ai ('@ha' -> automation, '@n8n' -> n8n).
                const tagKhop = khopTuKhoa(tid, text);
                if (tagKhop) {
                    msgWithOwnId.self_reply = true;
                    msgWithOwnId.tag_khop = tagKhop;
                    const selfWebhookUrl = getWebhookUrl("messageWebhookUrl", ownId);
                    if (selfWebhookUrl) {
                        triggerN8nWebhook(msgWithOwnId, selfWebhookUrl);
                    }
                }
            } catch (e) { /* bo qua, khong day */ }
        }

        // Trang theo dõi tin nhắn vẫn nhận cả hai chiều để soi được hội thoại.
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
        clearReconnectState(ownId);
        console.log(`Connected account ${ownId}`);
        // KHÔNG resolve promise đăng nhập ở đây. Listener nối được là xong bước
        // kết nối, nhưng loginZaloAccount còn phải fetchAccountInfo rồi mới đẩy
        // tài khoản vào zaloAccounts. Resolve sớm khiến bên khôi phục phiên
        // (app.js) kiểm tra danh sách khi tài khoản chưa kịp vào, kết luận
        // "đăng nhập không báo lỗi nhưng tài khoản không vào danh sách" rồi
        // đăng nhập LẦN HAI cùng tài khoản — Zalo chỉ cho một kết nối nên báo
        // "Another connection is opened, closing this one" và listener chết,
        // bot không nhận được tin nào nữa (log 18/08). Promise nay do chính
        // loginZaloAccount resolve sau khi đã lưu tài khoản.
        
        // Gửi thông báo đến tất cả client
        try {
            broadcastMessage('login_success');
        } catch (err) {
            console.error('Lỗi khi gửi thông báo WebSocket:', err);
        }
    });
    
    api.listener.onClosed(() => {
        console.log(`Closed - API listener đã ngắt kết nối cho tài khoản ${ownId}`);
        
        scheduleRelogin(api);
    });
    
    api.listener.onError((error) => {
        console.error(`Error on account ${ownId}:`, error);
    });
}
