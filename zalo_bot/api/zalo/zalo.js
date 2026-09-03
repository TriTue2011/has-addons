// api/zalo/zalo.js
import { Zalo, ThreadType } from 'zca-js';
import { getPROXIES, getAvailableProxyIndex } from '../../services/proxyService.js';
import { configureReconnectDependencies, setupEventListeners } from '../../eventListeners.js';
import { HttpsProxyAgent } from "https-proxy-agent";
import nodefetch from "node-fetch";
import fs from 'fs';
import path from 'path';
import {
    getCookiesDir,
    saveImage,
    removeImage,
    saveFileFromUrl,
    saveVideoFromUrl,
    removeFile,
} from '../../utils/helpers.js';
import { taiVeVaGuiNhieuAnh as guiTheoLo } from '../../utils/sendImages.js';
import { getCachedGroupHistory } from '../../utils/groupHistoryStore.js';
import { createVideoThumbnail } from '../../utils/videoThumbnail.js';
import { readVideoDuration } from '../../utils/videoDuration.js';
import {
    OperationTimeoutError,
    cleanupAfterSettled,
    withTimeout,
} from '../../utils/timeout.js';
import {
    getRequestedMessageTtl,
    normalizeMessageTtl,
    normalizeAutoDeleteTtl,
    normalizeThreadType,
    normalizeZcaNumberId,
    withMessageTtl,
} from '../../utils/zaloContract.js';
import {
    configureExpiryDependencies,
    napTuDia,
    scheduleUndo,
} from '../../services/messageExpiry.js';
import { writeJsonAtomicSync } from '../../utils/atomicFile.js';
export const zaloAccounts = [];
configureExpiryDependencies({
    layApi: (ownId) => zaloAccounts.find(
        (acc) => String(acc.ownId) === String(ownId),
    )?.api || null,
});
napTuDia();

/**
 * Hẹn tự thu hồi mọi tin vừa gửi trong một lời gọi.
 *
 * Zalo bỏ qua `ttl` theo từng tin — đo thật 23/08/2026, xem
 * services/messageExpiry.js — nên muốn tin tự mất sau vài phút thì chính bot
 * phải gọi undo. Một lời gọi có thể đẻ nhiều tin (album ảnh) nên hẹn cho tất cả.
 */
function henThuHoi(account, result, threadId, threadType, ttlMs) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return null;
    const ids = [];
    if (result?.message?.msgId) ids.push(result.message.msgId);
    for (const phan of result?.attachment || []) {
        if (phan?.msgId) ids.push(phan.msgId);
    }
    let ketQua = null;
    for (const msgId of ids) {
        ketQua = scheduleUndo({
            ownId: account.ownId,
            msgId,
            threadId: String(threadId),
            type: threadType,
            ttlMs,
        }) || ketQua;
    }
    // Xin TTL mà không hẹn được thì phải NÓI RA. Trả null sẽ bị người gọi đọc
    // thành "không yêu cầu tự xoá", tức im lặng nuốt mất yêu cầu.
    if (!ketQua) {
        return {
            requested: ttlMs,
            applied: false,
            scope: 'auto-undo',
            note: 'Zalo không trả msgId cho tin này nên chưa hẹn được thu hồi.',
        };
    }
    return ketQua;
}

/** Album đi theo nhiều LÔ, mỗi lô là một phản hồi sendMessage riêng. */
function henThuHoiAlbum(account, cacLo, threadId, threadType, ttlMs) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return null;
    let ketQua = null;
    for (const lo of Array.isArray(cacLo) ? cacLo : [cacLo]) {
        ketQua = henThuHoi(account, lo, threadId, threadType, ttlMs) || ketQua;
    }
    return ketQua;
}
configureReconnectDependencies({
    accounts: zaloAccounts,
    login: (...args) => loginZaloAccount(...args),
});

function deferFileCleanup(task, filePath, label) {
    cleanupAfterSettled(task, () => removeFile(filePath));
    void task.catch((error) => {
        console.warn(`[Video] ${label} ket thuc sau timeout: ${error.message}`);
    });
}

function imageRequestErrorStatus(error) {
    if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
        return error.status;
    }
    return 500;
}

/** Bốn endpoint gửi nhiều ảnh (user/group × có-chọn-tài-khoản/không) dùng chung
 *  một đường: tải về → chia lô → dọn tệp tạm trong finally. */
const taiVeVaGuiNhieuAnh = (api, imageUrls, threadId, threadType, tuyChon) =>
    guiTheoLo({ saveImage, removeImage }, api, imageUrls, threadId, threadType, tuyChon);

/** Tuỳ chọn gửi ảnh lấy từ body — dùng chung cho cả bốn endpoint. */
function tuyChonGuiAnh(req) {
    const { caption = "", nghiMs } = req.body || {};
    return { caption, ...(nghiMs ? { nghiMs: Number(nghiMs) } : {}) };
}

// Kiểm tra trạng thái đăng nhập định kỳ (10 phút/lần) — CHỈ QUAN SÁT.
//
// Vòng này KHÔNG xoá cookie và KHÔNG loại tài khoản khỏi zaloAccounts.
//
// Bản cũ coi mọi lần fetchAccountInfo hỏng — kể cả quá hạn chờ 30 giây hay mạng
// rớt vài giây — là bằng chứng cookie hết hạn, rồi xoá luôn cred_<ownId>.json.
// Đó là cùng một lỗi mà đoạn khôi phục phiên trong app.js đã chặn: mất mạng là
// chuyện TẠM THỜI, xoá cookie là mất VĨNH VIỄN (phải quét lại mã QR). Máy chủ
// còn có đúng kiểu hỏng đó: tường lửa dựng lại iptables SAU Docker rồi xoá mất
// luật NAT, container mất đường ra Internet vài phút.
//
// Việc phục hồi để cho reconnect trong eventListeners.js lo — nó đã có backoff,
// hạn chờ và guard thế hệ.
//
// Bản cũ còn dựng lại zaloAccounts từ ảnh chụp lấy TRƯỚC khi chờ mạng 30 giây,
// nên ai đăng nhập bằng QR trong khoảng đó bị xoá khỏi danh sách dù phiên vẫn
// sống. Nay không đụng vào mảng nữa nên hết đường đua đó.
let dangKiemTraDangNhap = false;

async function checkLoginStatus() {
    if (dangKiemTraDangNhap) {
        console.log('[Docker] Bỏ qua kiểm tra: lượt trước vẫn đang chạy.');
        return;
    }
    dangKiemTraDangNhap = true;
    try {
        if (zaloAccounts.length === 0) {
            console.log('[Docker] Không có tài khoản nào để kiểm tra');
            return;
        }

        console.log('[Docker] Đang kiểm tra trạng thái đăng nhập của tất cả tài khoản...');
        const ketQua = await Promise.all(zaloAccounts.map(async (account) => {
            const nhan = account?.phoneNumber || account?.ownId || 'không xác định';
            if (!account?.api) {
                console.warn(`[Docker] Tài khoản ${nhan} chưa có API; giữ nguyên credential.`);
                return false;
            }
            try {
                const accountInfo = await withTimeout(
                    account.api.fetchAccountInfo(),
                    30_000,
                    'Health-check timeout',
                );
                if (accountInfo?.profile) {
                    console.log(`[Docker] Tài khoản ${nhan} vẫn đăng nhập thành công`);
                    return true;
                }
                console.warn(`[Docker] Tài khoản ${nhan} không trả về profile; KHÔNG xoá cookie, chờ reconnect.`);
                return false;
            } catch (error) {
                console.warn(`[Docker] Kiểm tra ${nhan} lỗi: ${error.message}. KHÔNG xoá cookie, chờ reconnect.`);
                return false;
            }
        }));

        const soKhoe = ketQua.filter(Boolean).length;
        console.log(
            `[Docker] Hoàn thành kiểm tra: ${soKhoe} khoẻ, ${ketQua.length - soKhoe} cần theo dõi. Cookie giữ nguyên.`,
        );
    } finally {
        dangKiemTraDangNhap = false;
    }
}

// Khởi động kiểm tra tự động sau khi server bắt đầu (đảm bảo đã đăng nhập đủ)
let checkLoginInterval;

// Đảm bảo chỉ có một interval chạy
export function startLoginCheck() {
    // Xóa interval cũ nếu có
    if (checkLoginInterval) {
        clearInterval(checkLoginInterval);
    }
    
    console.log("[Docker] Khởi động hệ thống kiểm tra trạng thái đăng nhập tự động (10 phút/lần)");
    
    // Thiết lập kiểm tra định kỳ mỗi 10 phút
    checkLoginInterval = setInterval(() => {
        // checkLoginStatus là hàm async — try/catch quanh lời gọi KHÔNG bắt
        // được lỗi bên trong nó, phải bắt trên promise.
        void checkLoginStatus().catch((error) => {
            console.error("[Docker] Lỗi khi chạy kiểm tra đăng nhập:", error);
        });
    }, 10 * 60 * 1000);
    
}

// Đăng ký MỘT LẦN ở cấp module. Bản cũ đăng ký bên trong startLoginCheck nên
// mỗi lần gọi lại hàm đó là thêm một listener, dẫn tới cảnh báo
// MaxListenersExceededWarning.
process.once('SIGTERM', () => {
    console.log("[Docker] Nhận tín hiệu kết thúc, dừng kiểm tra đăng nhập");
    if (checkLoginInterval) {
        clearInterval(checkLoginInterval);
    }
});

// Alias export cho tương thích với app.js
export const startLoginStatusCheck = startLoginCheck;

// Chờ server khởi động hoàn tất trước khi bắt đầu kiểm tra
const loginCheckStartupTimer = setTimeout(() => {
    try {
        // Kiểm tra ngay lần đầu
        void checkLoginStatus().catch((error) => {
            console.error("[Docker] Lỗi khi chạy kiểm tra đăng nhập:", error);
        });
        
        // Bắt đầu kiểm tra định kỳ
        startLoginCheck();
    } catch (error) {
        console.error("[Docker] Lỗi khi khởi động hệ thống kiểm tra:", error);
    }
}, 120 * 1000); // Đợi 2 phút sau khi khởi động để đảm bảo tất cả tài khoản đã được khôi phục và container ổn định
loginCheckStartupTimer.unref?.();

// API để lấy danh sách tài khoản đã đăng nhập
export async function getLoggedAccounts(req, res) {
    try {
        const accounts = zaloAccounts.map(acc => ({
            ownId: acc.ownId,
            phoneNumber: acc.phoneNumber,
            proxy: acc.proxy || 'Không có proxy',
            displayName: `${acc.phoneNumber} (${acc.ownId})`,
            isOnline: acc.api ? true : false
        }));

        res.json({
            success: true,
            data: accounts,
            total: accounts.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API để lấy thông tin chi tiết một tài khoản
export async function getAccountDetails(req, res) {
    try {
        const { ownId } = req.params;
        const account = zaloAccounts.find(acc => acc.ownId === ownId);

        if (!account) {
            return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
        }

        // Lấy thông tin profile từ API
        const accountInfo = await account.api.fetchAccountInfo();

        res.json({
            success: true,
            data: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber,
                proxy: account.proxy || 'Không có proxy',
                profile: accountInfo?.profile || {},
                isOnline: account.api ? true : false
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== N8N-FRIENDLY WRAPPER APIs =====
// Các API này sử dụng account selection thay vì ownId

// Middleware để xử lý account selection
function getAccountFromSelection(accountSelection) {
    if (!accountSelection) {
        throw new Error('Vui lòng chọn tài khoản');
    }

    // Hỗ trợ cả ownId và phoneNumber
    let account = zaloAccounts.find(acc => acc.ownId === accountSelection);
    if (!account) {
        account = zaloAccounts.find(acc => acc.phoneNumber === accountSelection);
    }

    if (!account) {
        throw new Error(`Không tìm thấy tài khoản: ${accountSelection}`);
    }

    return account;
}

// API tìm user với account selection
export async function findUserByAccount(req, res) {
    try {
        const { phone, accountSelection } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'Số điện thoại là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const userData = await account.api.findUser(phone);

        res.json({
            success: true,
            data: userData,
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API gửi tin nhắn với account selection
export async function sendMessageByAccount(req, res) {
    try {
        const { message, threadId, type, accountSelection, quote } = req.body;

        if (!message || !threadId) {
            return res.status(400).json({ error: 'Tin nhắn và threadId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const msgType = type || ThreadType.User;
        
        // Handle quote message if provided
        let messageContent = message;
        if (quote) {
            // Convert simple string message to MessageContent object with quote
            if (typeof message === 'string') {
                messageContent = {
                    msg: message,
                    quote: quote
                };
            } else if (typeof message === 'object') {
                // If message is already an object, add the quote to it
                messageContent.quote = quote;
            }
        }

        // Bản cũ KHÔNG đọc ttl ở đây: gọi bằng REST command theo đúng tài liệu
        // của chính add-on thì TTL rơi mất im lặng. Đọc cả `body.ttl` lẫn
        // `message.ttl` vì tích hợp HACS đặt nó lồng trong message.
        const ttlYeuCau = normalizeMessageTtl(
            getRequestedMessageTtl(req.body, messageContent),
        ) ?? 0;
        messageContent = withMessageTtl(messageContent, ttlYeuCau);

        const result = await account.api.sendMessage(messageContent, String(threadId), msgType);

        res.json({
            success: true,
            data: result,
            messageTtl: henThuHoi(account, result, threadId, msgType, ttlYeuCau),
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        const status = /ttl/i.test(error?.message || '') ? 400 : 500;
        res.status(status).json({ success: false, error: error.message });
    }
}

// API gửi hình ảnh với account selection
export async function sendImageByAccount(req, res) {
    try {
        const { imagePath: imageUrl, threadId, type, accountSelection, ttl, message } = req.body;

        if (!imageUrl || !threadId) {
            return res.status(400).json({ error: 'Đường dẫn hình ảnh và threadId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const imagePath = await saveImage(imageUrl);

        if (!imagePath) {
            return res.status(500).json({ success: false, error: 'Không thể lưu hình ảnh' });
        }

        const threadType = type === 'group' ? ThreadType.Group : ThreadType.User;
        const result = await account.api.sendMessage(
            {
                msg: message || "",  // Thêm message support
                attachments: [imagePath],
                ttl: normalizeMessageTtl(ttl) ?? 0
            },
            threadId,
            threadType
        );

        removeImage(imagePath);

        res.json({
            success: true,
            data: result,
            messageTtl: henThuHoi(account, result, threadId, threadType, normalizeMessageTtl(ttl) ?? 0),
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API lấy thông tin user với account selection
export async function getUserInfoByAccount(req, res) {
    try {
        const { userId, accountSelection } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'UserId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const info = await account.api.getUserInfo(userId);

        res.json({
            success: true,
            data: info,
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API gửi lời mời kết bạn với account selection
export async function sendFriendRequestByAccount(req, res) {
    try {
        const { userId, message, accountSelection } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'UserId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const friendMessage = message || 'Xin chào, hãy kết bạn với tôi!';
        const result = await account.api.sendFriendRequest(friendMessage, userId);

        res.json({
            success: true,
            data: result,
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API tạo nhóm với account selection
export async function createGroupByAccount(req, res) {
    try {
        const { members, name, avatarPath, accountSelection } = req.body;

        if (!members || !Array.isArray(members) || members.length === 0) {
            return res.status(400).json({ error: 'Danh sách thành viên là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.createGroup({ members, name, avatarPath });

        res.json({
            success: true,
            data: result,
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API lấy thông tin nhóm với account selection
export async function getGroupInfoByAccount(req, res) {
    try {
        const { groupId, accountSelection } = req.body;

        if (!groupId || (Array.isArray(groupId) && groupId.length === 0)) {
            return res.status(400).json({ error: 'GroupId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getGroupInfo(groupId);

        res.json({
            success: true,
            data: result,
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API thêm thành viên vào nhóm với account selection
export async function addUserToGroupByAccount(req, res) {
    try {
        const { groupId, memberId, accountSelection } = req.body;

        if (!groupId || !memberId || (Array.isArray(memberId) && memberId.length === 0)) {
            return res.status(400).json({ error: 'GroupId và memberId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.addUserToGroup(memberId, groupId);

        res.json({
            success: true,
            data: result,
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API xóa thành viên khỏi nhóm với account selection
export async function removeUserFromGroupByAccount(req, res) {
    try {
        const { memberId, groupId, accountSelection } = req.body;

        if (!groupId || !memberId || (Array.isArray(memberId) && memberId.length === 0)) {
            return res.status(400).json({ error: 'GroupId và memberId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.removeUserFromGroup(memberId, groupId);

        res.json({
            success: true,
            data: result,
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API gửi hình ảnh đến user với account selection
export async function sendImageToUserByAccount(req, res) {
    try {
        const { imagePath: imageUrl, threadId, accountSelection, ttl } = req.body;

        if (!imageUrl || !threadId) {
            return res.status(400).json({ error: 'Đường dẫn hình ảnh và threadId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const imagePath = await saveImage(imageUrl);

        if (!imagePath) {
            return res.status(500).json({ success: false, error: 'Không thể lưu hình ảnh' });
        }

        const result = await account.api.sendMessage(
            {
                msg: "",
                attachments: [imagePath]
            },
            threadId,
            ThreadType.User
        );

        removeImage(imagePath);

        res.json({
            success: true,
            data: result,
            messageTtl: henThuHoi(account, result, threadId, ThreadType.User, normalizeMessageTtl(ttl) ?? 0),
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API gửi nhiều hình ảnh đến user với account selection
export async function sendImagesToUserByAccount(req, res) {
    try {
        const { imagePaths: imageUrls, threadId, accountSelection, ttl } = req.body;

        if (!imageUrls || !threadId || !Array.isArray(imageUrls) || imageUrls.length === 0) {
            return res.status(400).json({ error: 'Danh sách hình ảnh và threadId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);

        // Chia lô theo giới hạn THẬT của Zalo thay vì bắn cả mảng một lần.
        //
        // Bản cũ đưa nguyên mảng vào một lời gọi: quá `max_file` (giá trị do server
        // Zalo cấp lúc đăng nhập, không có trong code) là zca-js ném "Exceed maximum
        // file of N" và MẤT CẢ LÔ — không tấm nào tới, mà lỗi chỉ hiện lúc chạy.
        const ketQua = await taiVeVaGuiNhieuAnh(
            account.api, imageUrls, threadId, ThreadType.User, tuyChonGuiAnh(req),
        );

        res.json({
            success: true,
            data: ketQua.ketQua,
            messageTtl: henThuHoiAlbum(account, ketQua.ketQua, threadId, ThreadType.User, normalizeMessageTtl(ttl) ?? 0),
            // Nói ra số lô và giới hạn đang áp dụng: người gọi cần biết vì sao 30
            // ảnh lại thành 5 tin nhắn, thay vì tưởng hệ thống gửi lặp.
            soAnh: ketQua.soAnh,
            soLo: ketQua.soLo,
            maxFilePerMessage: ketQua.maxFile,
            canhBao: ketQua.canhBao,
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(imageRequestErrorStatus(error)).json({
            success: false,
            error: error.message,
            ...(error.chiTiet ? { chiTiet: error.chiTiet } : {}),
        });
    }
}

// API gửi hình ảnh đến nhóm với account selection
export async function sendImageToGroupByAccount(req, res) {
    try {
        const { imagePath: imageUrl, threadId, accountSelection, ttl } = req.body;

        if (!imageUrl || !threadId) {
            return res.status(400).json({ error: 'Đường dẫn hình ảnh và threadId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const imagePath = await saveImage(imageUrl);

        if (!imagePath) {
            return res.status(500).json({ success: false, error: 'Không thể lưu hình ảnh' });
        }

        const result = await account.api.sendMessage(
            {
                msg: "",
                attachments: [imagePath]
            },
            threadId,
            ThreadType.Group
        );

        removeImage(imagePath);

        res.json({
            success: true,
            data: result,
            messageTtl: henThuHoi(account, result, threadId, ThreadType.Group, normalizeMessageTtl(ttl) ?? 0),
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// API gửi nhiều hình ảnh đến nhóm với account selection
export async function sendImagesToGroupByAccount(req, res) {
    try {
        const { imagePaths: imageUrls, threadId, accountSelection, ttl } = req.body;

        if (!imageUrls || !threadId || !Array.isArray(imageUrls) || imageUrls.length === 0) {
            return res.status(400).json({ error: 'Danh sách hình ảnh và threadId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);

        const ketQua = await taiVeVaGuiNhieuAnh(
            account.api, imageUrls, threadId, ThreadType.Group, tuyChonGuiAnh(req),
        );

        res.json({
            success: true,
            data: ketQua.ketQua,
            messageTtl: henThuHoiAlbum(account, ketQua.ketQua, threadId, ThreadType.Group, normalizeMessageTtl(ttl) ?? 0),
            soAnh: ketQua.soAnh,
            soLo: ketQua.soLo,
            maxFilePerMessage: ketQua.maxFile,
            canhBao: ketQua.canhBao,
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(imageRequestErrorStatus(error)).json({
            success: false,
            error: error.message,
            ...(error.chiTiet ? { chiTiet: error.chiTiet } : {}),
        });
    }
}

// API gửi file với account selection
export async function sendFileByAccount(req, res) {
    try {
        const { fileUrl, threadId, type, accountSelection, message, ttl } = req.body;

        if (!fileUrl || !threadId) {
            return res.status(400).json({ error: 'URL của file và threadId là bắt buộc' });
        }

        const account = getAccountFromSelection(accountSelection);
        const filePath = await saveFileFromUrl(fileUrl);

        if (!filePath) {
            return res.status(500).json({ success: false, error: 'Không thể tải và lưu file' });
        }

        const threadType = type === 'group' ? ThreadType.Group : ThreadType.User;
        const result = await account.api.sendMessage(
            {
                msg: message || "", // Có thể gửi kèm tin nhắn
                attachments: [filePath],
                ttl: normalizeMessageTtl(ttl) ?? 0
            },
            threadId,
            threadType
        );

        removeFile(filePath); // Dọn dẹp file tạm

        res.json({
            success: true,
            data: result,
            messageTtl: henThuHoi(account, result, threadId, threadType, normalizeMessageTtl(ttl) ?? 0),
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        removeFile(filePath); // Dọn dẹp file tạm nếu có lỗi
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW FRIEND MANAGEMENT APIs =====

export async function acceptFriendRequestByAccount(req, res) {
    try {
        const { userId, accountSelection } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.acceptFriendRequest(userId);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function blockUserByAccount(req, res) {
    try {
        const { userId, accountSelection } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.blockUser(userId);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function unblockUserByAccount(req, res) {
    try {
        const { userId, accountSelection } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.unblockUser(userId);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function blockViewFeedByAccount(req, res) {
    try {
        const { isBlockFeed, userId, accountSelection } = req.body;
        if (typeof isBlockFeed !== 'boolean' || !userId) {
            return res.status(400).json({ error: 'isBlockFeed (boolean) và userId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.blockViewFeed(isBlockFeed, userId);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function changeFriendAliasByAccount(req, res) {
    try {
        const { alias, friendId, accountSelection } = req.body;
        if (!friendId) {
            return res.status(400).json({ error: 'friendId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.changeFriendAlias(alias, friendId);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function removeFriendAliasByAccount(req, res) {
    try {
        const { friendId, accountSelection } = req.body;
        if (!friendId) {
            return res.status(400).json({ error: 'friendId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.removeFriendAlias(friendId);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getAllFriendsByAccount(req, res) {
    try {
        const { count, page, accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getAllFriends(count, page);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getAliasListByAccount(req, res) {
    try {
        const { count, page, accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getAliasList(count, page);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getFriendRecommendationsByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        // API đã được đổi tên trong thư viện mới
        const result = await account.api.getFriendRecommendations();
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getSentFriendRequestByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getSentFriendRequest();
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function undoFriendRequestByAccount(req, res) {
    try {
        const { friendId, accountSelection } = req.body;
        if (!friendId) {
            return res.status(400).json({ error: 'friendId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.undoFriendRequest(friendId);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function removeFriendByAccount(req, res) {
    try {
        const { friendId, accountSelection } = req.body;
        if (!friendId) {
            return res.status(400).json({ error: 'friendId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.removeFriend(friendId);
        res.json({
            success: true,
            data: result,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW GROUP MANAGEMENT APIs =====

export async function addGroupDeputyByAccount(req, res) {
    try {
        const { memberId, groupId, accountSelection } = req.body;
        if (!memberId || !groupId) {
            return res.status(400).json({ error: 'memberId và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.addGroupDeputy(memberId, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function removeGroupDeputyByAccount(req, res) {
    try {
        const { memberId, groupId, accountSelection } = req.body;
        if (!memberId || !groupId) {
            return res.status(400).json({ error: 'memberId và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.removeGroupDeputy(memberId, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function changeGroupAvatarByAccount(req, res) {
    try {
        const { avatarSource, groupId, accountSelection } = req.body;
        if (!avatarSource || !groupId) {
            return res.status(400).json({ error: 'avatarSource và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.changeGroupAvatar(avatarSource, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function changeGroupNameByAccount(req, res) {
    try {
        const { name, groupId, accountSelection } = req.body;
        if (!name || !groupId) {
            return res.status(400).json({ error: 'name và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.changeGroupName(name, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function changeGroupOwnerByAccount(req, res) {
    try {
        const { memberId, groupId, accountSelection } = req.body;
        if (!memberId || !groupId) {
            return res.status(400).json({ error: 'memberId và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.changeGroupOwner(memberId, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function disperseGroupByAccount(req, res) {
    try {
        const { groupId, accountSelection } = req.body;
        if (!groupId) {
            return res.status(400).json({ error: 'groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.disperseGroup(groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function enableGroupLinkByAccount(req, res) {
    try {
        const { groupId, accountSelection } = req.body;
        if (!groupId) {
            return res.status(400).json({ error: 'groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.enableGroupLink(groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function disableGroupLinkByAccount(req, res) {
    try {
        const { groupId, accountSelection } = req.body;
        if (!groupId) {
            return res.status(400).json({ error: 'groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.disableGroupLink(groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getAllGroupsByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getAllGroups();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getGroupChatHistoryByAccount(req, res) {
    try {
        const { groupId, count = 50, accountSelection } = req.body;

        if (!groupId) {
            return res.status(400).json({ error: 'groupId là bắt buộc' });
        }

        // Tran 1000 cho khop kho cua chinh minh: groupHistoryStore giu toi 5000
        // tin moi nhom, chan o 200 thi phan con lai khong bao gio lay ra duoc.
        const parsedCount = Number.parseInt(count, 10);
        if (!Number.isSafeInteger(parsedCount) || parsedCount < 1 || parsedCount > 1000) {
            return res.status(400).json({ error: 'count phai la so nguyen tu 1 den 1000' });
        }
        const account = getAccountFromSelection(accountSelection);
        let result;
        let source = 'zca-js-2.1.2';
        let warning;
        try {
            result = await account.api.getGroupChatHistory(String(groupId), parsedCount);
        } catch (error) {
            result = getCachedGroupHistory(account.ownId, groupId, parsedCount);
            source = 'local-cache';
            warning = `Khong lay duoc history truc tiep tu Zalo (${error.message}); dang tra cache local.`;
        }

        // Enrich dName: Zalo API trả dName=null trong history, cần tra qua getUserInfo
        if (result.groupMsgs && result.groupMsgs.length > 0) {
            const ownId = account.ownId;
            const uniqueUids = [...new Set(
                result.groupMsgs
                    .map(msg => msg.data.uidFrom)
                    .filter(uid => uid && uid !== "0" && uid !== ownId)
            )];

            if (uniqueUids.length > 0) {
                try {
                    const userInfo = await account.api.getUserInfo(uniqueUids);
                    const profiles = userInfo?.changed_profiles || {};

                    for (const msg of result.groupMsgs) {
                        const uid = msg.data.uidFrom;
                        if (msg.data.dName === null || msg.data.dName === undefined) {
                            const profile = profiles[`${uid}_0`] || profiles[uid];
                            if (profile) {
                                msg.data.dName = profile.displayName || profile.zaloName || uid;
                            } else {
                                msg.data.dName = uid; // fallback: dùng uid
                            }
                        }
                    }
                } catch (enrichError) {
                    // Không làm crash API chính nếu enrich thất bại
                    console.warn("Không thể enrich dName:", enrichError.message);
                }
            }
        }

        // TEN NHOM: history tra ve mot day tin khong kem dau hieu nao cho biet
        // day la nhom nao. Lay mot lan o day; hong thi bo trong chu khong lam
        // chet API chinh.
        let groupName = '';
        try {
            const gInfo = await account.api.getGroupInfo(String(groupId));
            const gmap = gInfo?.gridInfoMap || gInfo?.data?.gridInfoMap;
            if (gmap && typeof gmap === 'object') {
                const g = gmap[String(groupId)] || Object.values(gmap)[0];
                if (g && typeof g === 'object') {
                    groupName = String(g.name || g.groupName || g.title || '').trim();
                }
            }
        } catch (e) {
            console.warn('Khong lay duoc ten nhom:', e.message);
        }

        res.json({
            success: true,
            data: result,
            groupId: String(groupId),
            groupName,
            source,
            ...(warning ? { warning } : {}),
            usedAccount: {
                ownId: account.ownId,
                phoneNumber: account.phoneNumber
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getGroupLinkInfoByAccount(req, res) {
    try {
        const { link, accountSelection } = req.body;
        if (!link) {
            return res.status(400).json({ error: 'link là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getGroupLinkInfo(link);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getGroupMembersInfoByAccount(req, res) {
    try {
        const { memberId, accountSelection } = req.body;
        if (!memberId) {
            return res.status(400).json({ error: 'memberId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getGroupMembersInfo(memberId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function inviteUserToGroupsByAccount(req, res) {
    try {
        const { memberId, groupId, accountSelection } = req.body;
        if (!memberId || !groupId) {
            return res.status(400).json({ error: 'memberId và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.inviteUserToGroups(memberId, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function joinGroupByAccount(req, res) {
    try {
        const { link, accountSelection } = req.body;
        if (!link) {
            return res.status(400).json({ error: 'link là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.joinGroup(link);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function leaveGroupByAccount(req, res) {
    try {
        const { groupId, silent, accountSelection } = req.body;
        if (!groupId) {
            return res.status(400).json({ error: 'groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        // API leaveGroup đã thay đổi: chỉ chấp nhận một chuỗi duy nhất làm tham số đầu tiên
        // Cũ: leaveGroup(groupId, silent)
        // Mới: leaveGroup(groupId)
        const result = await account.api.leaveGroup(groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function updateGroupSettingsByAccount(req, res) {
    try {
        const { options, groupId, accountSelection } = req.body;
        if (!options || !groupId) {
            return res.status(400).json({ error: 'options và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.updateGroupSettings(options, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW MESSAGE INTERACTION APIs =====

export async function addReactionByAccount(req, res) {
    try {
        const { icon, dest, accountSelection } = req.body;
        if (!icon || !dest) {
            return res.status(400).json({ error: 'icon và dest là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.addReaction(icon, dest);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function deleteMessageByAccount(req, res) {
    try {
        const { dest, onlyMe, accountSelection } = req.body;
        if (!dest) {
            return res.status(400).json({ error: 'dest là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.deleteMessage(dest, onlyMe);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function forwardMessageByAccount(req, res) {
    try {
        const { params, type, threadIds, accountSelection } = req.body;
        if (!params) {
            return res.status(400).json({ error: 'params là bắt buộc' });
        }
        if (!threadIds) {
            return res.status(400).json({ error: 'threadIds là bắt buộc trong phiên bản mới' });
        }
        const account = getAccountFromSelection(accountSelection);
        // API đã thay đổi: forwardMessage(payload, threadIds, type)
        const result = await account.api.forwardMessage(params, threadIds, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function parseLinkByAccount(req, res) {
    try {
        const { link, accountSelection } = req.body;
        if (!link) {
            return res.status(400).json({ error: 'link là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.parseLink(link);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function sendCardByAccount(req, res) {
    try {
        const { options, threadId, type, accountSelection } = req.body;
        if (!options || !threadId) {
            return res.status(400).json({ error: 'options và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.sendCard(options, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function sendLinkByAccount(req, res) {
    try {
        const { options, threadId, type, accountSelection } = req.body;
        if (!options || !threadId) {
            return res.status(400).json({ error: 'options và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.sendLink(options, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function sendStickerByAccount(req, res) {
    try {
        const { sticker, threadId, type, accountSelection } = req.body;
        if (!sticker || typeof sticker !== 'object' || Array.isArray(sticker) || !threadId) {
            return res.status(400).json({ error: 'sticker và threadId là bắt buộc' });
        }
        try {
            sticker.id = normalizeZcaNumberId(sticker.id, 'sticker.id');
        } catch (error) {
            return res.status(400).json({ success: false, error: error.message });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.sendSticker(sticker, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getStickersByAccount(req, res) {
    try {
        const { query, accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getStickers(query);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getStickersDetailByAccount(req, res) {
    try {
        const { stickerAlbum, accountSelection } = req.body;
        if (!stickerAlbum) {
            return res.status(400).json({ error: 'stickerAlbum là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getStickersDetail(stickerAlbum);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// Tải tệp về rồi ĐẨY LÊN máy chủ Zalo trước khi nhắn, thay vì đưa thẳng địa chỉ
// người gọi cung cấp.
//
// Vì sao phải vòng thế: api.sendVideo của zca-js KHÔNG tải tệp lên. Nó chỉ nhét
// videoUrl vào nội dung tin, và máy người nhận tự vào lấy MỖI LẦN MỞ. Bên gọi
// thường chỉ có địa chỉ nội bộ — Home Assistant chẳng hạn, dựng một máy chủ tạm
// ở địa chỉ LAN sống 90 giây — nên đoạn phim xem được đúng lúc gửi, đúng trong
// mạng nhà, rồi hỏng vĩnh viễn. Đẩy lên trước thì tệp nằm trên hạ tầng Zalo, xem
// được mãi và ở đâu cũng mở, không đòi bên gọi phải mở cổng hay có tên miền.
//
// Ảnh bìa đi cùng đường: thiếu nó Zalo trả "Tham số không hợp lệ" và tin không đi.
export async function sendVideoByAccount(req, res) {
    let duongVideo = null;
    let duongThumb = null;
    try {
        const { options, threadId, type, accountSelection } = req.body;
        if (!options || !threadId) {
            return res.status(400).json({ error: 'options và threadId là bắt buộc' });
        }
        if (!options.videoUrl) {
            return res.status(400).json({ error: 'options.videoUrl là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);

        duongVideo = await saveVideoFromUrl(options.videoUrl);
        if (!duongVideo) throw new Error('Khong the tai video nguon');

        // Zalo in nhan thoi luong tu con so gui kem tin nhan chu khong tu do tep,
        // nen phai do o day. Day cung la noi duy nhat chac chan cam tep that: ke ca
        // khi nguoi goi chi dua vao mot dia chi URL thi video da duoc tai ve dia.
        const thoiLuongMs = await readVideoDuration(duongVideo);
        const uploadTimeout = Number.parseInt(process.env.VIDEO_UPLOAD_TIMEOUT_MS || '180000', 10);
        const timeoutMs = Number.isSafeInteger(uploadTimeout) && uploadTimeout > 0
            ? uploadTimeout : 180000;
        const videoPath = duongVideo;
        const videoUpload = account.api.uploadAttachment([videoPath], threadId, type);
        let videoDaLen;
        try {
            [videoDaLen] = await withTimeout(
                videoUpload, timeoutMs, 'Het thoi gian tai video len Zalo',
            );
        } catch (error) {
            if (error instanceof OperationTimeoutError) {
                deferFileCleanup(videoUpload, videoPath, 'Upload video');
                duongVideo = null;
            }
            throw error;
        }
        if (!videoDaLen || !videoDaLen.fileUrl) {
            throw new Error('Zalo không trả về địa chỉ video sau khi tải lên');
        }

        // Anh bia BAT BUOC phai la ANH. Tich hop Home Assistant mac dinh lay chinh
        // dia chi video lam thumbnailUrl khi nguoi dung khong khai, nen duong nay
        // gan nhu luon nhan mot tep MP4 — saveImage soi magic bytes roi vut di.
        // Khong tu trich lay mot khung hinh thi con lai o bia rong, ma Zalo tra
        // "Tham so khong hop le" khien tin khong di. Do that 24/08/2026: moi lan
        // gui video tu tep cuc bo deu hong vi dung ly do nay.
        let thumbnailUrl = options.thumbnailUrl || '';
        let thumbnailSource = thumbnailUrl ? 'custom' : 'auto';
        // Thumbnail la anh nen dung tran IMAGE_DOWNLOAD_MAX_BYTES (mac dinh 25 MB),
        // khong de mot URL "thumbnail" an het tran video 150 MB.
        if (thumbnailUrl) duongThumb = await saveImage(thumbnailUrl);
        if (!duongThumb) {
            thumbnailSource = 'auto';
            duongThumb = await createVideoThumbnail(duongVideo);
        }
        if (duongThumb) {
            const thumbnailPath = duongThumb;
            const thumbnailUpload = account.api.uploadAttachment([thumbnailPath], threadId, type);
            try {
                const [thumbDaLen] = await withTimeout(
                    thumbnailUpload, Math.min(timeoutMs, 60000),
                    'Het thoi gian tai thumbnail len Zalo',
                );
                // Anh tra ve ba co; uu tien ban nhe nhat.
                thumbnailUrl = (thumbDaLen
                    && (thumbDaLen.thumbUrl || thumbDaLen.normalUrl || thumbDaLen.hdUrl)) || '';
            } catch (error) {
                if (error instanceof OperationTimeoutError) {
                    deferFileCleanup(thumbnailUpload, thumbnailPath, 'Upload thumbnail');
                    duongThumb = null;
                }
                console.warn('[Video] Upload thumbnail loi, tiep tuc bang fallback:', error.message);
                thumbnailUrl = '';
                thumbnailSource = 'fallback';
            }
        } else {
            thumbnailUrl = '';
            thumbnailSource = 'fallback';
        }

        const result = await account.api.sendVideo(
            { ...options, videoUrl: videoDaLen.fileUrl, thumbnailUrl, duration: thoiLuongMs ?? options.duration ?? 0 },
            threadId,
            type
        );
        res.json({
            success: true,
            data: result,
            thumbnailSource,
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber },
        });
    } catch (error) {
        res.status(error instanceof OperationTimeoutError ? 504 : 500)
            .json({ success: false, error: error.message });
    } finally {
        if (duongVideo) removeFile(duongVideo);
        if (duongThumb) removeFile(duongThumb);
    }
}

export async function sendVoiceByAccount(req, res) {
    try {
        const { options, threadId, type, accountSelection } = req.body;
        if (!options || !threadId) {
            return res.status(400).json({ error: 'options và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.sendVoice(options, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function undoByAccount(req, res) {
    try {
        const { payload, threadId, type, accountSelection } = req.body;
        if (!payload || !threadId) {
            return res.status(400).json({ error: 'payload và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.undo(payload, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function sendDeliveredEventByAccount(req, res) {
    try {
        const { isSeen, messages, type, accountSelection } = req.body;
        if (typeof isSeen !== 'boolean' || !messages) {
            return res.status(400).json({ error: 'isSeen và messages là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.sendDeliveredEvent(isSeen, messages, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function sendSeenEventByAccount(req, res) {
    try {
        const { messages, type, accountSelection } = req.body;
        if (!messages) {
            return res.status(400).json({ error: 'messages là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const threadType = type === 'group' ? ThreadType.Group : ThreadType.User;
        const result = await account.api.sendSeenEvent(messages, threadType);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function sendTypingEventByAccount(req, res) {
    try {
        const { threadId, accountSelection } = req.body;
        if (!threadId) {
            return res.status(400).json({ error: 'threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        
        // Mặc định luôn là User thread với DestType.User
        const result = await account.api.sendTypingEvent(threadId, ThreadType.User, 3); // DestType.User = 3
            
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW BOARD & NOTES APIs =====

export async function createNoteByAccount(req, res) {
    try {
        const { options, groupId, accountSelection } = req.body;
        if (!options || !groupId) {
            return res.status(400).json({ error: 'options và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        // API đã đổi tên: createNoteGroup -> createNote
        const result = await account.api.createNote(options, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function editNoteByAccount(req, res) {
    try {
        const { options, groupId, accountSelection } = req.body;
        if (!options || !groupId) {
            return res.status(400).json({ error: 'options và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        // API đã đổi tên: editNoteGroup -> editNote
        const result = await account.api.editNote(options, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getFriendBoardListByAccount(req, res) {
    try {
        const { conversationId, accountSelection } = req.body;
        if (!conversationId) {
            return res.status(400).json({ error: 'conversationId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getFriendBoardList(conversationId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getListBoardByAccount(req, res) {
    try {
        const { options, groupId, accountSelection } = req.body;
        if (!groupId) {
            return res.status(400).json({ error: 'groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getListBoard(options, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW POLLS APIs =====

export async function createPollByAccount(req, res) {
    try {
        const { options, groupId, accountSelection } = req.body;
        if (!options || !groupId) {
            return res.status(400).json({ error: 'options và groupId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.createPoll(options, groupId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getPollDetailByAccount(req, res) {
    try {
        const { pollId, accountSelection } = req.body;
        if (!pollId) {
            return res.status(400).json({ error: 'pollId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getPollDetail(pollId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function lockPollByAccount(req, res) {
    try {
        const { pollId, accountSelection } = req.body;
        if (!pollId) {
            return res.status(400).json({ error: 'pollId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.lockPoll(pollId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW REMINDERS APIs =====

export async function createReminderByAccount(req, res) {
    try {
        const { options, threadId, type, accountSelection } = req.body;
        if (!options || !threadId) {
            return res.status(400).json({ error: 'options và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.createReminder(options, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function editReminderByAccount(req, res) {
    try {
        const { options, threadId, type, accountSelection } = req.body;
        if (!options || !threadId) {
            return res.status(400).json({ error: 'options và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.editReminder(options, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function removeReminderByAccount(req, res) {
    try {
        const { reminderId, threadId, type, accountSelection } = req.body;
        if (!reminderId || !threadId) {
            return res.status(400).json({ error: 'reminderId và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.removeReminder(reminderId, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getReminderByAccount(req, res) {
    try {
        const { reminderId, accountSelection } = req.body;
        if (!reminderId) {
            return res.status(400).json({ error: 'reminderId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getReminder(reminderId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getListReminderByAccount(req, res) {
    try {
        const { options, threadId, type, accountSelection } = req.body;
        if (!threadId) {
            return res.status(400).json({ error: 'threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getListReminder(options, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getReminderResponsesByAccount(req, res) {
    try {
        const { reminderId, accountSelection } = req.body;
        if (!reminderId) {
            return res.status(400).json({ error: 'reminderId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getReminderResponses(reminderId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW QUICK MESSAGES APIs =====

export async function addQuickMessageByAccount(req, res) {
    try {
        const { addPayload, accountSelection } = req.body;
        if (!addPayload) {
            return res.status(400).json({ error: 'addPayload là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.addQuickMessage(addPayload);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getQuickMessageListByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        // API đã đổi tên: getQuickMessage -> getQuickMessageList
        const result = await account.api.getQuickMessageList();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function removeQuickMessageByAccount(req, res) {
    try {
        const { itemIds, accountSelection } = req.body;
        if (!itemIds) {
            return res.status(400).json({ error: 'itemIds là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.removeQuickMessage(itemIds);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function updateQuickMessageByAccount(req, res) {
    try {
        const { updatePayload, itemId, accountSelection } = req.body;
        if (!updatePayload || !itemId) {
            return res.status(400).json({ error: 'updatePayload và itemId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.updateQuickMessage(updatePayload, itemId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW LABELS APIs =====

export async function getLabelsByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getLabels();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function updateLabelsByAccount(req, res) {
    try {
        const { label, accountSelection } = req.body;
        if (!label) {
            return res.status(400).json({ error: 'label là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.updateLabels(label);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW CONVERSATION MANAGEMENT APIs =====

export async function addUnreadMarkByAccount(req, res) {
    try {
        const { threadId, type, accountSelection } = req.body;
        if (!threadId) {
            return res.status(400).json({ error: 'threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.addUnreadMark(threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function removeUnreadMarkByAccount(req, res) {
    try {
        const { threadId, type, accountSelection } = req.body;
        if (!threadId) {
            return res.status(400).json({ error: 'threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.removeUnreadMark(threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function deleteChatByAccount(req, res) {
    try {
        const { lastMessage, threadId, type, accountSelection } = req.body;
        if (!lastMessage || !threadId) {
            return res.status(400).json({ error: 'lastMessage và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.deleteChat(lastMessage, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getArchivedChatListByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getArchivedChatList();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getAutoDeleteChatByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getAutoDeleteChat();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function updateAutoDeleteChatByAccount(req, res) {
    try {
        const { ttl, threadId, type, accountSelection } = req.body;
        // `!ttl` coi 0 LÀ THIẾU tham số, mà 0 chính là "tắt tự xoá" — nên bản cũ
        // không tắt được tự xoá qua API, chỉ bật được.
        if (ttl === undefined || ttl === null || ttl === '' || !threadId) {
            return res.status(400).json({ error: 'ttl và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const threadType = normalizeThreadType(type);
        // Zalo chỉ nhận 0 / 1 ngày / 7 ngày / 14 ngày (enum ChatTTL của zca-js).
        // Bản cũ đẩy thẳng giá trị thô lên: gửi 5 phút thì Zalo IM LẶNG bỏ qua và
        // người dùng tưởng đã đặt xong. Nay từ chối rõ ràng bằng 400.
        const normalizedTtl = normalizeAutoDeleteTtl(ttl);
        const result = await account.api.updateAutoDeleteChat(normalizedTtl, String(threadId), threadType);
        res.json({
            success: true,
            data: result,
            autoDelete: {
                enabled: normalizedTtl !== 0,
                ttl: normalizedTtl,
                scope: 'conversation',
            },
            usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber },
        });
    } catch (error) {
        const status = /ttl|type khong hop le/i.test(error.message) ? 400 : 500;
        res.status(status).json({ success: false, error: error.message });
    }
}

export async function getHiddenConversationsByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getHiddenConversations();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function setHiddenConversationsByAccount(req, res) {
    try {
        const { hidden, threadId, type, accountSelection } = req.body;
        if (typeof hidden !== 'boolean' || !threadId) {
            return res.status(400).json({ error: 'hidden và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.setHiddenConversations(hidden, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function updateHiddenConversPinByAccount(req, res) {
    try {
        const { pin, accountSelection } = req.body;
        if (!pin) {
            return res.status(400).json({ error: 'pin là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.updateHiddenConversPin(pin);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function resetHiddenConversPinByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.resetHiddenConversPin();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getMuteByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getMute();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function setMuteByAccount(req, res) {
    try {
        const { params, threadID, type, accountSelection } = req.body;
        if (!params || !threadID) {
            return res.status(400).json({ error: 'params và threadID là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.setMute(params, threadID, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getPinConversationsByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getPinConversations();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function setPinnedConversationsByAccount(req, res) {
    try {
        const { pinned, threadId, type, accountSelection } = req.body;
        if (typeof pinned !== 'boolean' || !threadId) {
            return res.status(400).json({ error: 'pinned và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.setPinnedConversations(pinned, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getUnreadMarkByAccount(req, res) {
    try {
        const { accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getUnreadMark();
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== NEW ACCOUNT PROFILE MANAGEMENT APIs =====

export async function changeAccountAvatarByAccount(req, res) {
    try {
        const { avatarSource, accountSelection } = req.body;
        if (!avatarSource) {
            return res.status(400).json({ error: 'avatarSource là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.changeAccountAvatar(avatarSource);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function deleteAvatarListByAccount(req, res) {
    try {
        const { photoId, accountSelection } = req.body;
        if (!photoId) {
            return res.status(400).json({ error: 'photoId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.deleteAvatar(photoId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getAvatarListByAccount(req, res) {
    try {
        const { count, page, accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.getAvatarList(count, page);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function reuseAvatarByAccount(req, res) {
    try {
        const { photoId, accountSelection } = req.body;
        if (!photoId) {
            return res.status(400).json({ error: 'photoId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.reuseAvatar(photoId);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function updateProfileByAccount(req, res) {
    try {
        const { name, dob, gender, accountSelection } = req.body;
        // Basic validation, can be improved
        if (name === undefined || dob === undefined || gender === undefined) {
            return res.status(400).json({ error: 'name, dob, và gender là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.updateProfile(name, dob, gender);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function updateLangByAccount(req, res) {
    try {
        const { language, accountSelection } = req.body;
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.updateLang(language);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function updateSettingsByAccount(req, res) {
    try {
        const { type, status, accountSelection } = req.body;
        if (!type || status === undefined) {
            return res.status(400).json({ error: 'type và status là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.updateSettings(type, status);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===== OTHER APIs =====

export async function lastOnlineByAccount(req, res) {
    try {
        const { uid, accountSelection } = req.body;
        if (!uid) {
            return res.status(400).json({ error: 'uid là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.lastOnline(uid);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function sendReportByAccount(req, res) {
    try {
        const { options, threadId, type, accountSelection } = req.body;
        if (!options || !threadId) {
            return res.status(400).json({ error: 'options và threadId là bắt buộc' });
        }
        const account = getAccountFromSelection(accountSelection);
        const result = await account.api.sendReport(options, threadId, type);
        res.json({ success: true, data: result, usedAccount: { ownId: account.ownId, phoneNumber: account.phoneNumber } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}


export async function findUser(req, res) {
    try {
        const { phone, ownId } = req.body;
        if (!phone || !ownId) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        }
        const account = zaloAccounts.find(acc => acc.ownId === ownId);
       
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }
        const userData = await account.api.findUser(phone);
        res.json({ success: true, data: userData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getUserInfo(req, res) {
    try {
        const { userId, ownId } = req.body;
        if (!userId || !ownId) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        }
        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }
        const info = await account.api.getUserInfo(userId);
        res.json({ success: true, data: info });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function sendFriendRequest(req, res) {
    try {
        const { userId, ownId } = req.body;
        if (!userId || !ownId) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        }
        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }
        const result = await account.api.sendFriendRequest('Xin chào, hãy kết bạn với tôi!', userId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function sendMessage(req, res) {
    try {
        const { message, threadId, type, ownId, quote } = req.body;
        if (!message || !threadId || !ownId) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        }
        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }
        const msgType = type || ThreadType.User;

        // Handle quote message if provided
        let messageContent = message;
        if (quote) {
            // Convert simple string message to MessageContent object with quote
            if (typeof message === 'string') {
                messageContent = {
                    msg: message,
                    quote: quote
                };
            } else if (typeof message === 'object') {
                // If message is already an object, add the quote to it
                messageContent.quote = quote;
            }
        }

        const result = await account.api.sendMessage(messageContent, threadId, msgType);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function createGroup(req, res) {
    try {
        const { members, name, avatarPath, ownId } = req.body;
        // Kiểm tra dữ liệu hợp lệ
        if (!members || !Array.isArray(members) || members.length === 0 || !ownId) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        }
        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }
        // Gọi API createGroup từ zaloAccounts
        const result = await account.api.createGroup({ members, name, avatarPath });
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function getGroupInfo(req, res) {
    try {
        const { groupId, ownId } = req.body;
        // Kiểm tra dữ liệu: groupId phải tồn tại và nếu là mảng thì không rỗng
        if (!groupId || (Array.isArray(groupId) && groupId.length === 0)) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        }
        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }
        // Gọi API getGroupInfo từ zaloAccounts
        const result = await account.api.getGroupInfo(groupId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function addUserToGroup(req, res) {
    try {
        const { groupId, memberId, ownId } = req.body;
        // Kiểm tra dữ liệu hợp lệ: groupId và memberId không được bỏ trống
        if (!groupId || !memberId || (Array.isArray(memberId) && memberId.length === 0)) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        }
        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }
        // Gọi API addUserToGroup từ zaloAccounts
        const result = await account.api.addUserToGroup(memberId, groupId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function removeUserFromGroup(req, res) {
    try {
        const { memberId, groupId, ownId } = req.body;
        // Kiểm tra dữ liệu: groupId và memberId phải được cung cấp, nếu memberId là mảng thì không được rỗng
        if (!groupId || !memberId || (Array.isArray(memberId) && memberId.length === 0)) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        }
        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }
        // Gọi API removeUserFromGroup từ zaloAccounts
        const result = await account.api.removeUserFromGroup(memberId, groupId);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// Hàm gửi một hình ảnh đến người dùng
export async function sendImageToUser(req, res) {
    try {
        const { imagePath: imageUrl, threadId, ownId } = req.body;
        if (!imageUrl || !threadId || !ownId) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ: imagePath và threadId là bắt buộc' });
        }


        const imagePath = await saveImage(imageUrl);
        if (!imagePath) return res.status(500).json({ success: false, error: 'Failed to save image' });

        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }

        // Không bọc `.catch(console.error)` như bản cũ: nuốt lỗi ở đây thì người
        // gọi nhận success:true kèm data:undefined, tưởng ảnh đã tới trong khi lỗi
        // chỉ nằm trong log container.
        let result;
        try {
            result = await account.api.sendMessage(
                { msg: "", attachments: [imagePath] },
                threadId,
                ThreadType.User
            );
        } finally {
            removeImage(imagePath);
        }
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// Hàm gửi nhiều hình ảnh đến người dùng
export async function sendImagesToUser(req, res) {
    try {
        const { imagePaths: imageUrls, threadId, ownId } = req.body;
        if (!imageUrls || !threadId || !ownId || !Array.isArray(imageUrls) || imageUrls.length === 0) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ: imagePaths phải là mảng không rỗng và threadId là bắt buộc' });
        }


        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }

        // Bản cũ có `.catch(console.error)` bọc lời gửi: gửi thất bại thì lỗi chỉ
        // nằm trong log container, còn người gọi vẫn nhận `success: true` với
        // `data: undefined` — tưởng ảnh đã tới. Bỏ đi để lỗi rơi xuống catch và
        // trả về đúng 500.
        const ketQua = await taiVeVaGuiNhieuAnh(
            account.api, imageUrls, threadId, ThreadType.User, tuyChonGuiAnh(req),
        );

        res.json({
            success: true,
            data: ketQua.ketQua,
            soAnh: ketQua.soAnh,
            soLo: ketQua.soLo,
            maxFilePerMessage: ketQua.maxFile,
            canhBao: ketQua.canhBao,
        });
    } catch (error) {
        res.status(imageRequestErrorStatus(error)).json({
            success: false,
            error: error.message,
            ...(error.chiTiet ? { chiTiet: error.chiTiet } : {}),
        });
    }
}

// Hàm gửi một hình ảnh đến nhóm
export async function sendImageToGroup(req, res) {
    try {
        const { imagePath: imageUrl, threadId, ownId } = req.body;
        if (!imageUrl || !threadId || !ownId) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ: imagePath và threadId là bắt buộc' });
        }


        const imagePath = await saveImage(imageUrl);
        if (!imagePath) return res.status(500).json({ success: false, error: 'Failed to save image' });

        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }

        let result;
        try {
            result = await account.api.sendMessage(
                { msg: "", attachments: [imagePath] },
                threadId,
                ThreadType.Group
            );
        } finally {
            removeImage(imagePath);
        }
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// Hàm gửi nhiều hình ảnh đến nhóm
export async function sendImagesToGroup(req, res) {
    try {
        const { imagePaths: imageUrls, threadId, ownId } = req.body;
        if (!imageUrls || !threadId || !ownId || !Array.isArray(imageUrls) || imageUrls.length === 0) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ: imagePaths phải là mảng không rỗng và threadId là bắt buộc' });
        }


        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }

        const ketQua = await taiVeVaGuiNhieuAnh(
            account.api, imageUrls, threadId, ThreadType.Group, tuyChonGuiAnh(req),
        );

        res.json({
            success: true,
            data: ketQua.ketQua,
            soAnh: ketQua.soAnh,
            soLo: ketQua.soLo,
            maxFilePerMessage: ketQua.maxFile,
            canhBao: ketQua.canhBao,
        });
    } catch (error) {
        res.status(imageRequestErrorStatus(error)).json({
            success: false,
            error: error.message,
            ...(error.chiTiet ? { chiTiet: error.chiTiet } : {}),
        });
    }
}

export async function sendFile(req, res) {
    let filePath;
    try {
        const { fileUrl, threadId, ownId, type, message } = req.body;
        if (!fileUrl || !threadId || !ownId) {
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ: fileUrl, threadId và ownId là bắt buộc' });
        }

        filePath = await saveFileFromUrl(fileUrl);
        if (!filePath) {
            return res.status(500).json({ success: false, error: 'Không thể tải và lưu file' });
        }

        const account = zaloAccounts.find(acc => acc.ownId === ownId);
        if (!account) {
            removeFile(filePath);
            return res.status(400).json({ error: 'Không tìm thấy tài khoản Zalo với OwnId này' });
        }

        const threadType = type === 'group' ? ThreadType.Group : ThreadType.User;
        const result = await account.api.sendMessage(
            {
                msg: message || "",
                attachments: [filePath]
            },
            threadId,
            threadType
        );

        removeFile(filePath);
        res.json({ success: true, data: result });
    } catch (error) {
        if (filePath) removeFile(filePath);
        res.status(500).json({ success: false, error: error.message });
    }
}

export async function loginZaloAccount(customProxy, cred, options = {}) {
    const {
        allowQrFallback = true,
        autoSelectProxy = true,
        isCurrentAttempt,
    } = options;
    const isCurrent = typeof isCurrentAttempt === 'function' ? isCurrentAttempt : () => true;
    const loginCredential = cred && typeof cred === 'object'
        ? (() => {
            const { proxy: _savedProxy, ...credential } = cred;
            return credential;
        })()
        : cred;
    return new Promise(async (resolve, reject) => {
        let agent;
        let proxyUsed = null;
        let useCustomProxy = false;
        let proxies = [];

        // Import hàm getProxiesFilePath
        const { getProxiesFilePath } = await import('../../utils/helpers.js');
        const proxiesFilePath = getProxiesFilePath();

        try {
            if (fs.existsSync(proxiesFilePath)) {
                const proxiesJson = fs.readFileSync(proxiesFilePath, 'utf8');
                proxies = JSON.parse(proxiesJson);
            } else {
                fs.writeFileSync(proxiesFilePath, '[]', 'utf8');
            }
        } catch (error) {
            console.error(`Lỗi đọc proxies.json:`, error.message);
            const proxyDir = path.dirname(proxiesFilePath);
            if (!fs.existsSync(proxyDir)) fs.mkdirSync(proxyDir, { recursive: true });
            fs.writeFileSync(proxiesFilePath, '[]', 'utf8');
            proxies = [];
        }

        // Kiểm tra nếu người dùng nhập proxy
        if (customProxy && customProxy.trim() !== "") {
            try {
                new URL(customProxy);
                useCustomProxy = true;
                if (!proxies.includes(customProxy)) {
                    proxies.push(customProxy);
                    fs.writeFileSync(proxiesFilePath, JSON.stringify(proxies, null, 4), 'utf8');
                }
            } catch (err) {
                console.log(`Proxy không hợp lệ: ${customProxy}, dùng proxy mặc định`);
            }
        }

        if (useCustomProxy) {
            console.log('Sử dụng proxy tùy chỉnh:', customProxy);
            agent = new HttpsProxyAgent(customProxy);
        } else if (autoSelectProxy) {
            // Chọn proxy tự động từ danh sách nếu không có proxy do người dùng nhập hợp lệ
            if (proxies.length > 0) {
                const proxyIndex = getAvailableProxyIndex();
                if (proxyIndex === -1) {
                    console.log('Tất cả proxy đều đã đủ tài khoản. Không thể đăng nhập thêm!');
                } else {
                    proxyUsed = getPROXIES()[proxyIndex];
                    console.log('Sử dụng proxy tự động:', proxyUsed.url);
                    agent = new HttpsProxyAgent(proxyUsed.url);
                }
            } else {
                console.log('Không có proxy nào có sẵn, sẽ đăng nhập không qua proxy');
                agent = null; // Không sử dụng proxy
            }
        }
        let zalo;
        // Hàm lấy metadata của hình ảnh
        const getImageMetadata = async (filePath) => {
            try {
                if (!filePath.startsWith('http://') && !filePath.startsWith('https://') && fs.existsSync(filePath)) {
                    try {
                        const stats = fs.statSync(filePath);
                        try {
                            const sizeOf = await import('image-size').then(module => module.default || module);
                            // Đưa BUFFER ĐẦU FILE thay vì đường dẫn.
                            //
                            // `image-size` đang có lỗ DoS (high) mà thượng nguồn
                            // CHƯA có bản vá — `npm audit` báo `fixAvailable:
                            // false`. Ảnh ở đây do người dùng Zalo gửi lên nên
                            // là dữ liệu kẻ tấn công điều khiển được.
                            //
                            // Truyền đường dẫn thì thư viện tự đọc bao nhiêu tuỳ
                            // nó; truyền buffer thì nó chỉ thấy đúng phần ta cho
                            // thấy. Kích thước ảnh của JPEG/PNG/GIF/WebP đều nằm
                            // trong vài KB đầu, nên 256 KB là thừa cho việc đọc
                            // đúng mà vẫn chặn được đầu vào khổng lồ.
                            const TRAN_HEADER = 256 * 1024;
                            const doDoc = Math.min(stats.size, TRAN_HEADER);
                            const dau = Buffer.alloc(doDoc);
                            const fdH = fs.openSync(filePath, 'r');
                            try { fs.readSync(fdH, dau, 0, doDoc, 0); }
                            finally { fs.closeSync(fdH); }
                            const dimensions = sizeOf(dau);
                            return { width: dimensions.width, height: dimensions.height, size: stats.size };
                        } catch (importError) {
                            const buffer = Buffer.alloc(24);
                            const fd = fs.openSync(filePath, 'r');
                            fs.readSync(fd, buffer, 0, 24, 0);
                            fs.closeSync(fd);
                            
                            // Kiểm tra các định dạng ảnh phổ biến (JPEG, PNG)
                            if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                                // JPEG: tìm SOF marker để lấy kích thước
                                const fileData = fs.readFileSync(filePath);
                                let pos = 2;
                                while (pos < fileData.length) {
                                    if (fileData[pos] !== 0xFF) pos++;
                                    else if (fileData[pos+1] >= 0xC0 && fileData[pos+1] <= 0xCF && fileData[pos+1] !== 0xC4 && fileData[pos+1] !== 0xC8) {
                                        const height = (fileData[pos+5] << 8) + fileData[pos+6];
                                        const width = (fileData[pos+7] << 8) + fileData[pos+8];
                                        console.log(`JPEG: đọc được kích thước ${width}x${height}, size: ${stats.size}`);
                                        return { width, height, size: stats.size };
                                    } else {
                                        pos += 2 + (fileData[pos+2] << 8) + fileData[pos+3];
                                    }
                                }
                            } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                                // PNG: kích thước ở byte 16-23
                                const width = (buffer[16] << 24) + (buffer[17] << 16) + (buffer[18] << 8) + buffer[19];
                                const height = (buffer[20] << 24) + (buffer[21] << 16) + (buffer[22] << 8) + buffer[23];
                                console.log(`PNG: đọc được kích thước ${width}x${height}, size: ${stats.size}`);
                                return { width, height, size: stats.size };
                            }
                            
                            // Header không cho ra kích thước — rất có thể tệp
                            // này không phải ảnh. Không có đường lui nào nữa.
                            console.warn('Không đọc được kích thước ảnh từ header của tệp');
                        }
                    } catch (err) {
                        console.warn(`Không thể đọc thông tin file ${filePath}: ${err.message}`);
                    }
                }
                
                // Đọc không ra kích thước thì TỪ CHỐI, không bịa 1280x720.
                //
                // Bịa số nghĩa là một tệp không phải ảnh vẫn đi được lên Zalo.
                // Đo thật 24/08/2026: add-on tải nhầm trang admin-login của
                // chính nó (3.918 byte HTML) về dưới tên .jpg, hàm này bịa
                // 1280x720, tin gửi đi trót lọt, và người nhận thấy một ô đen
                // đúng tỉ lệ 1280x720 — không có lỗi nào ở đâu cả.
                //
                // Trả null thì zca-js ném ZaloApiError("Failed to get image
                // metadata"), lỗi nói thẳng ra tận Home Assistant.
                console.error(`Không đọc được kích thước ảnh: ${filePath} — từ chối gửi.`);
                return null;
            } catch (error) {
                console.error(`Lỗi khi lấy metadata cho ảnh ${filePath}: ${error.message}`);
                return null;
            }
        };
        
        if (useCustomProxy || agent) {
            zalo = new Zalo({
                agent: agent,
                // @ts-ignore
                polyfill: nodefetch,
                imageMetadataGetter: getImageMetadata,
                selfListen: true
            });
        } else {
            zalo = new Zalo({
                imageMetadataGetter: getImageMetadata,
                selfListen: true
            });
        }

        let api;
        try {
            if (loginCredential) {
                try {
                    api = await zalo.login(loginCredential);
                } catch (error) {
                    console.error("Lỗi đăng nhập cookie:", error.message);
                    if (!allowQrFallback) throw error;
                    console.log('Chuyển sang đăng nhập bằng mã QR...');
                    api = await zalo.loginQR(null, (qrData) => {
                        if (qrData?.data?.image) {
                            const qrCodeImage = `data:image/png;base64,${qrData.data.image}`;
                            console.log('Đã tạo mã QR');
                            resolve(qrCodeImage);
                        } else {
                            reject(new Error("Không thể lấy mã QR"));
                        }
                    });
                }
            } else {
                console.log('Đang tạo mã QR...');
                api = await zalo.loginQR(null, (qrData) => {
                    if (qrData?.data?.image) {
                        const qrCodeImage = `data:image/png;base64,${qrData.data.image}`;
                        console.log('Đã tạo mã QR');
                        resolve(qrCodeImage);
                    } else {
                        reject(new Error("Không thể lấy mã QR"));
                    }
                });
            }

            const accountInfo = await api.fetchAccountInfo();
            if (!accountInfo?.profile) {
                throw new Error("Không tìm thấy thông tin profile");
            }
            const { profile } = accountInfo;
            const phoneNumber = profile.phoneNumber;
            const ownId = profile.userId;
            const displayName = profile.displayName;
            const context = await api.getContext();
            const {imei, cookie, userAgent} = context;

            // Login da timeout trong reconnect co the ket thuc muon. Khong cho
            // phep no dang ky listener hay ghi de account/cookie cua lan moi.
            if (!isCurrent()) {
                try { api.listener.stop?.(); } catch { /* best effort */ }
                throw new Error('Phien reconnect da het han');
            }

            api.listener.onConnected(() => {
                // Không resolve ở đây — đợi setup xong mới resolve
            });
            setupEventListeners(api);
            api.listener.start();

            if (!useCustomProxy && proxyUsed) {
                proxyUsed.usedCount++;
                proxyUsed.accounts.push(api);
            }

            const existingAccountIndex = zaloAccounts.findIndex(acc => acc.ownId === api.getOwnId());
            if (existingAccountIndex !== -1) {
                zaloAccounts[existingAccountIndex] = { api: api, ownId: api.getOwnId(), proxy: useCustomProxy ? customProxy : (proxyUsed && proxyUsed.url), phoneNumber: phoneNumber };
            } else {
                zaloAccounts.push({ api: api, ownId: api.getOwnId(), proxy: useCustomProxy ? customProxy : (proxyUsed && proxyUsed.url), phoneNumber: phoneNumber });
            }

            const data = {
                imei,
                cookie,
                userAgent,
                proxy: useCustomProxy ? customProxy : (proxyUsed && proxyUsed.url) || null,
            };
            const cookiesDir = getCookiesDir();

            if (!fs.existsSync(cookiesDir)) {
                fs.mkdirSync(cookiesDir, { recursive: true });
            }

            const credFilePath = path.join(cookiesDir, `cred_${ownId}.json`);
            writeJsonAtomicSync(credFilePath, data, 4);
            try { fs.chmodSync(credFilePath, 0o600); } catch { /* best effort */ }

            console.log(`[Zalo] ${displayName} (${phoneNumber}) — đăng nhập thành công`);
            resolve(true);
        } catch (error) {
            console.error('Lỗi trong quá trình đăng nhập Zalo:', error);
            reject(error);
        }
    });
}
