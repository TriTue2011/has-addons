import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
    findUser,
    getUserInfo,
    sendFriendRequest,
    sendMessage,
    createGroup,
    getGroupInfo,
    addUserToGroup,
    removeUserFromGroup,
    sendImageToUser,
    sendImagesToUser,
    sendImageToGroup,
    sendImagesToGroup,
    // New APIs for account management
    getLoggedAccounts,
    getAccountDetails,
    // N8N-friendly wrapper APIs
    findUserByAccount,
    getUserInfoByAccount,
    sendFriendRequestByAccount,
    sendMessageByAccount,
    createGroupByAccount,
    getGroupInfoByAccount,
    addUserToGroupByAccount,
    removeUserFromGroupByAccount,
    sendImageByAccount,
    sendImageToUserByAccount,
    sendImagesToUserByAccount,
    sendImageToGroupByAccount,
    sendImagesToGroupByAccount,
    sendFileByAccount,
    sendFile,
    // Friend Management
    acceptFriendRequestByAccount,
    blockUserByAccount,
    unblockUserByAccount,
    blockViewFeedByAccount,
    changeFriendAliasByAccount,
    removeFriendAliasByAccount,
    getAllFriendsByAccount,
    getAliasListByAccount,
    getFriendRecommendationsByAccount,
    getSentFriendRequestByAccount,
    undoFriendRequestByAccount,
    // Group Management
    addGroupDeputyByAccount,
    removeGroupDeputyByAccount,
    changeGroupAvatarByAccount,
    changeGroupNameByAccount,
    changeGroupOwnerByAccount,
    disperseGroupByAccount,
    enableGroupLinkByAccount,
    disableGroupLinkByAccount,
    getAllGroupsByAccount,
    getGroupLinkInfoByAccount,
    getGroupMembersInfoByAccount,
    getGroupChatHistoryByAccount,
    inviteUserToGroupsByAccount,
    joinGroupByAccount,
    leaveGroupByAccount,
    updateGroupSettingsByAccount,
    // Message Interaction
    addReactionByAccount,
    deleteMessageByAccount,
    forwardMessageByAccount,
    parseLinkByAccount,
    sendCardByAccount,
    sendLinkByAccount,
    sendStickerByAccount,
    sendVideoByAccount,
    sendVoiceByAccount,
    undoByAccount,
    sendDeliveredEventByAccount,
    sendSeenEventByAccount,
    sendTypingEventByAccount,
    // Board & Notes
    createNoteByAccount,
    editNoteByAccount,
    getFriendBoardListByAccount,
    getListBoardByAccount,
    // Polls
    createPollByAccount,
    getPollDetailByAccount,
    lockPollByAccount,
    // Reminders
    createReminderByAccount,
    editReminderByAccount,
    removeReminderByAccount,
    getReminderByAccount,
    getListReminderByAccount,
    getReminderResponsesByAccount,
    // Quick Messages
    addQuickMessageByAccount,
    getQuickMessageListByAccount,
    removeQuickMessageByAccount,
    updateQuickMessageByAccount,
    // Labels
    getLabelsByAccount,
    updateLabelsByAccount,
    // Conversation Management
    addUnreadMarkByAccount,
    removeUnreadMarkByAccount,
    deleteChatByAccount,
    getArchivedChatListByAccount,
    getAutoDeleteChatByAccount,
    updateAutoDeleteChatByAccount,
    getHiddenConversationsByAccount,
    setHiddenConversationsByAccount,
    updateHiddenConversPinByAccount,
    resetHiddenConversPinByAccount,
    getMuteByAccount,
    setMuteByAccount,
    getPinConversationsByAccount,
    setPinnedConversationsByAccount,
    getUnreadMarkByAccount,
    // Account Management
    changeAccountAvatarByAccount,
    deleteAvatarListByAccount,
    getAvatarListByAccount,
    reuseAvatarByAccount,
    updateProfileByAccount,
    updateLangByAccount,
    updateSettingsByAccount,
    // Others
    lastOnlineByAccount,
    sendReportByAccount,
    removeFriendByAccount,
    getStickersByAccount,
    getStickersDetailByAccount
} from '../api/zalo/zalo.js';
import { validateUser, adminMiddleware, addUser, deleteUser, getAllUsers, changePassword } from '../services/authService.js';
import {
    getWebhookUrl,
    setWebhookUrl,
    removeWebhookConfig,
    getAllWebhookConfigs
} from '../services/webhookService.js';

const router = express.Router();

// Endpoint dev/debug (test-login, test-json, debug-users-file) chỉ bật khi
// đặt ZALO_DEV_ENDPOINTS=1. Production KHÔNG bật → chúng trả 404, không lộ
// thông tin user và không còn là bề mặt tấn công.
const DEV_ENDPOINTS = process.env.ZALO_DEV_ENDPOINTS === '1';

// Rate-limit đăng nhập theo IP (in-memory): chặn brute-force mật khẩu. Trước
// đây không có giới hạn nào → dò mật khẩu không tốn kém gì.
const _LOGIN_MAX_FAILS = 10;
const _LOGIN_WINDOW_MS = 15 * 60 * 1000;
const _LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const _loginFails = new Map();   // ip -> {count, first, lockUntil}

function _loginClientIp(req) {
  // req.ip tôn trọng trust proxy của app; fallback socket. KHÔNG tin thẳng
  // X-Forwarded-For thô (giả được) — express đã xử qua trust proxy.
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function _loginRateLimit(req, res) {
  const ip = _loginClientIp(req);
  const now = Date.now();
  const rec = _loginFails.get(ip);
  if (rec && rec.lockUntil && rec.lockUntil > now) {
    const remain = Math.ceil((rec.lockUntil - now) / 1000);
    res.status(429).json({ success: false, message: `Quá nhiều lần sai. Thử lại sau ${remain}s.` });
    return false;
  }
  return true;
}

function _loginRecordFail(req) {
  const ip = _loginClientIp(req);
  const now = Date.now();
  let rec = _loginFails.get(ip);
  if (!rec || now - rec.first > _LOGIN_WINDOW_MS) rec = { count: 0, first: now, lockUntil: 0 };
  rec.count += 1;
  if (rec.count >= _LOGIN_MAX_FAILS) { rec.lockUntil = now + _LOGIN_LOCKOUT_MS; rec.count = 0; }
  _loginFails.set(ip, rec);
}

function _loginRecordSuccess(req) {
  _loginFails.delete(_loginClientIp(req));
}

// Dành cho ES Module: xác định __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API xác thực
// Đăng nhập
router.post('/login', (req, res) => {
  try {
    if (!_loginRateLimit(req, res)) return;
    // KHÔNG log req.body (chứa mật khẩu thô) hay kết quả validateUser.
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tài khoản và mật khẩu' });
    }

    const user = validateUser(username, password);

    if (!user) {
      _loginRecordFail(req);
      return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác' });
    }
    _loginRecordSuccess(req);

    // Kiểm tra req.session tồn tại
    if (!req.session) {
      console.error('Session object is not available!');
      return res.status(500).json({
        success: false,
        message: 'Lỗi server: session không khả dụng',
      });
    }

    // Thiết lập session
    req.session.authenticated = true;
    req.session.username = user.username;
    req.session.role = user.role;

    res.json({ success: true, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xử lý đăng nhập',
      error: error.message
    });
  }
});

// Đăng xuất (hỗ trợ cả GET và POST)
router.all('/logout', (req, res) => {
  console.log('Logout requested');
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ success: false, message: 'Lỗi khi đăng xuất' });
      }
      console.log('Session destroyed successfully');
      res.json({ success: true, message: 'Đã đăng xuất thành công' });
    });
  } else {
    console.log('No session to destroy');
    res.json({ success: true, message: 'Đã đăng xuất thành công' });
  }
});

// Lấy thông tin người dùng hiện tại
router.get('/user', (req, res) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
  }

  res.json({
    success: true,
    user: {
      username: req.session.username,
      role: req.session.role
    }
  });
});

// API quản lý người dùng (chỉ admin)
// Lấy danh sách người dùng
router.get('/users', adminMiddleware, (req, res) => {
  const users = getAllUsers();
  res.json({ success: true, users });
});

// Thêm người dùng mới
router.post('/users', adminMiddleware, (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tài khoản và mật khẩu' });
  }

  const success = addUser(username, password, role || 'user');
  if (!success) {
    return res.status(400).json({ success: false, message: 'Tài khoản đã tồn tại' });
  }

  res.json({ success: true, message: 'Đã thêm người dùng thành công' });
});

// Xóa người dùng
router.delete('/users', adminMiddleware, async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp username' });
  }

  // Không cho xóa chính mình
  if (req.session.username === username) {
    return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản đang đăng nhập' });
  }

  const result = await deleteUser(username);
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json({ success: true, message: 'Đã xóa người dùng thành công' });
});

// Đổi mật khẩu
router.post('/change-password', (req, res) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
  }

  // KHÔNG log req.body (chứa mật khẩu cũ + mới).
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ mật khẩu cũ và mới' });
  }

  const success = changePassword(req.session.username, oldPassword, newPassword);

  if (!success) {
    return res.status(400).json({ success: false, message: 'Mật khẩu cũ không chính xác' });
  }

  res.json({ success: true, message: 'Đã đổi mật khẩu thành công' });
});

// Kiểm tra phiên đăng nhập
router.get('/check-auth', (req, res) => {
  if (req.session.authenticated) {
    return res.json({
      authenticated: true,
      username: req.session.username,
      role: req.session.role
    });
  }

  res.json({ authenticated: false });
});

// API đăng nhập đơn giản (không dùng file users.json)
router.post('/simple-login', (req, res) => {
  try {
    if (!_loginRateLimit(req, res)) return;
    // KHÔNG log req.body (chứa mật khẩu).
    if (!req.body || typeof req.body !== 'object') {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }

    const { username, password } = req.body;

    if (!username || !password) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ tài khoản và mật khẩu' });
    }

    const user = validateUser(username, password);

    if (user) {
      // Xử lý trường hợp không có req.session
      if (!req.session) {
        console.error('Session object is not available - missing session middleware?');
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ success: false, message: 'Lỗi server: session không khả dụng' });
      }

      // Thiết lập session với thông tin người dùng đã xác thực
      req.session.authenticated = true;
      req.session.username = user.username;
      req.session.role = user.role;
      _loginRecordSuccess(req);

      // Trả về user THẬT (username/role đã xác thực), không hardcode admin/admin
      // — frontend không được hiển thị/quyết định quyền dựa trên vai giả.
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: true,
        user: { username: user.username, role: user.role },
        sessionID: req.sessionID || 'unknown'
      });
    } else {
      _loginRecordFail(req);
      res.setHeader('Content-Type', 'application/json');
      return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác' });
    }
  } catch (error) {
    console.error('Simple login error:', error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Giữ nguyên API cũ
router.post('/findUser', findUser);
router.post('/getUserInfo', getUserInfo);
router.post('/sendFriendRequest', sendFriendRequest);
router.post('/sendmessage', sendMessage);
router.post('/createGroup', createGroup);
router.post('/getGroupInfo', getGroupInfo);
router.post('/addUserToGroup', addUserToGroup);
router.post('/removeUserFromGroup', removeUserFromGroup);
router.post('/sendImageToUser', sendImageToUser);
router.post('/sendImagesToUser', sendImagesToUser);
router.post('/sendImageToGroup', sendImageToGroup);
router.post('/sendImagesToGroup', sendImagesToGroup);
router.post('/sendFile', sendFile);

// ===== NEW ACCOUNT MANAGEMENT APIs =====
// API để lấy danh sách tài khoản đã đăng nhập
router.get('/accounts', getLoggedAccounts);

// API để lấy thông tin chi tiết một tài khoản
router.get('/accounts/:ownId', getAccountDetails);

// ===== N8N-FRIENDLY WRAPPER APIs =====
// API tìm user với account selection (thay vì ownId)
router.post('/findUserByAccount', findUserByAccount);

// API gửi tin nhắn với account selection
router.post('/sendMessageByAccount', sendMessageByAccount);

// API gửi hình ảnh với account selection
router.post('/sendImageByAccount', sendImageByAccount);

// API lấy thông tin user với account selection
router.post('/getUserInfoByAccount', getUserInfoByAccount);

// API gửi lời mời kết bạn với account selection
router.post('/sendFriendRequestByAccount', sendFriendRequestByAccount);

// API tạo nhóm với account selection
router.post('/createGroupByAccount', createGroupByAccount);

// API lấy thông tin nhóm với account selection
router.post('/getGroupInfoByAccount', getGroupInfoByAccount);

// API thêm thành viên vào nhóm với account selection
router.post('/addUserToGroupByAccount', addUserToGroupByAccount);

// API xóa thành viên khỏi nhóm với account selection
router.post('/removeUserFromGroupByAccount', removeUserFromGroupByAccount);

// API gửi hình ảnh đến user với account selection
router.post('/sendImageToUserByAccount', sendImageToUserByAccount);

// API gửi nhiều hình ảnh đến user với account selection
router.post('/sendImagesToUserByAccount', sendImagesToUserByAccount);

// API gửi hình ảnh đến nhóm với account selection
router.post('/sendImageToGroupByAccount', sendImageToGroupByAccount);

// API gửi nhiều hình ảnh đến nhóm với account selection
router.post('/sendImagesToGroupByAccount', sendImagesToGroupByAccount);

// API gửi file với account selection
router.post('/sendFileByAccount', sendFileByAccount);

// ===== NEW FRIEND MANAGEMENT APIs =====
router.post('/acceptFriendRequestByAccount', acceptFriendRequestByAccount);
router.post('/blockUserByAccount', blockUserByAccount);
router.post('/unblockUserByAccount', unblockUserByAccount);
router.post('/blockViewFeedByAccount', blockViewFeedByAccount);
router.post('/changeFriendAliasByAccount', changeFriendAliasByAccount);
router.post('/removeFriendAliasByAccount', removeFriendAliasByAccount);
router.post('/getAllFriendsByAccount', getAllFriendsByAccount);
router.post('/getAliasListByAccount', getAliasListByAccount);
router.post('/getFriendRecommendationsByAccount', getFriendRecommendationsByAccount);
router.post('/getSentFriendRequestByAccount', getSentFriendRequestByAccount);
router.post('/undoFriendRequestByAccount', undoFriendRequestByAccount);
router.post('/removeFriendByAccount', removeFriendByAccount);

// ===== NEW GROUP MANAGEMENT APIs =====
router.post('/addGroupDeputyByAccount', addGroupDeputyByAccount);
router.post('/removeGroupDeputyByAccount', removeGroupDeputyByAccount);
router.post('/changeGroupAvatarByAccount', changeGroupAvatarByAccount);
router.post('/changeGroupNameByAccount', changeGroupNameByAccount);
router.post('/changeGroupOwnerByAccount', changeGroupOwnerByAccount);
router.post('/disperseGroupByAccount', disperseGroupByAccount);
router.post('/enableGroupLinkByAccount', enableGroupLinkByAccount);
router.post('/disableGroupLinkByAccount', disableGroupLinkByAccount);
router.post('/getAllGroupsByAccount', getAllGroupsByAccount);
router.post('/getGroupChatHistoryByAccount', getGroupChatHistoryByAccount);
router.post('/getGroupLinkInfoByAccount', getGroupLinkInfoByAccount);
router.post('/getGroupMembersInfoByAccount', getGroupMembersInfoByAccount);
router.post('/inviteUserToGroupsByAccount', inviteUserToGroupsByAccount);
router.post('/joinGroupByAccount', joinGroupByAccount);
router.post('/leaveGroupByAccount', leaveGroupByAccount);
router.post('/updateGroupSettingsByAccount', updateGroupSettingsByAccount);

// ===== NEW MESSAGE INTERACTION APIs =====
router.post('/addReactionByAccount', addReactionByAccount);
router.post('/deleteMessageByAccount', deleteMessageByAccount);
router.post('/forwardMessageByAccount', forwardMessageByAccount);
router.post('/parseLinkByAccount', parseLinkByAccount);
router.post('/sendCardByAccount', sendCardByAccount);
router.post('/sendLinkByAccount', sendLinkByAccount);
router.post('/sendStickerByAccount', sendStickerByAccount);
router.post('/getStickersByAccount', getStickersByAccount);
router.post('/getStickersDetailByAccount', getStickersDetailByAccount);
router.post('/sendVideoByAccount', sendVideoByAccount);
router.post('/sendVoiceByAccount', sendVoiceByAccount);
router.post('/undoByAccount', undoByAccount);
router.post('/sendDeliveredEventByAccount', sendDeliveredEventByAccount);
router.post('/sendSeenEventByAccount', sendSeenEventByAccount);
router.post('/sendTypingEventByAccount', sendTypingEventByAccount);

// ===== NEW BOARD & NOTES APIs =====
router.post('/createNoteByAccount', createNoteByAccount);
router.post('/editNoteByAccount', editNoteByAccount);
router.post('/getFriendBoardListByAccount', getFriendBoardListByAccount);
router.post('/getListBoardByAccount', getListBoardByAccount);

// ===== NEW POLLS APIs =====
router.post('/createPollByAccount', createPollByAccount);
router.post('/getPollDetailByAccount', getPollDetailByAccount);
router.post('/lockPollByAccount', lockPollByAccount);

// ===== NEW REMINDERS APIs =====
router.post('/createReminderByAccount', createReminderByAccount);
router.post('/editReminderByAccount', editReminderByAccount);
router.post('/removeReminderByAccount', removeReminderByAccount);
router.post('/getReminderByAccount', getReminderByAccount);
router.post('/getListReminderByAccount', getListReminderByAccount);
router.post('/getReminderResponsesByAccount', getReminderResponsesByAccount);

// ===== NEW QUICK MESSAGES APIs =====
router.post('/addQuickMessageByAccount', addQuickMessageByAccount);
router.post('/getQuickMessageListByAccount', getQuickMessageListByAccount);
router.post('/removeQuickMessageByAccount', removeQuickMessageByAccount);
router.post('/updateQuickMessageByAccount', updateQuickMessageByAccount);

// ===== NEW LABELS APIs =====
router.post('/getLabelsByAccount', getLabelsByAccount);
router.post('/updateLabelsByAccount', updateLabelsByAccount);

// ===== NEW CONVERSATION MANAGEMENT APIs =====
router.post('/addUnreadMarkByAccount', addUnreadMarkByAccount);
router.post('/removeUnreadMarkByAccount', removeUnreadMarkByAccount);
router.post('/deleteChatByAccount', deleteChatByAccount);
router.post('/getArchivedChatListByAccount', getArchivedChatListByAccount);
router.post('/getAutoDeleteChatByAccount', getAutoDeleteChatByAccount);
router.post('/updateAutoDeleteChatByAccount', updateAutoDeleteChatByAccount);
router.post('/getHiddenConversationsByAccount', getHiddenConversationsByAccount);
router.post('/setHiddenConversationsByAccount', setHiddenConversationsByAccount);
router.post('/updateHiddenConversPinByAccount', updateHiddenConversPinByAccount);
router.post('/resetHiddenConversPinByAccount', resetHiddenConversPinByAccount);
router.post('/getMuteByAccount', getMuteByAccount);
router.post('/setMuteByAccount', setMuteByAccount);
router.post('/getPinConversationsByAccount', getPinConversationsByAccount);
router.post('/setPinnedConversationsByAccount', setPinnedConversationsByAccount);
router.post('/getUnreadMarkByAccount', getUnreadMarkByAccount);

// ===== NEW ACCOUNT PROFILE MANAGEMENT APIs =====
router.post('/changeAccountAvatarByAccount', changeAccountAvatarByAccount);
router.post('/deleteAvatarListByAccount', deleteAvatarListByAccount);
router.post('/getAvatarListByAccount', getAvatarListByAccount);
router.post('/reuseAvatarByAccount', reuseAvatarByAccount);
router.post('/updateProfileByAccount', updateProfileByAccount);
router.post('/updateLangByAccount', updateLangByAccount);
router.post('/updateSettingsByAccount', updateSettingsByAccount);

// ===== OTHER APIs =====
router.post('/lastOnlineByAccount', lastOnlineByAccount);
router.post('/sendReportByAccount', sendReportByAccount);

// API kiểm tra trạng thái session
router.get('/session-test', (req, res) => {
  try {
    // Kiểm tra session object có tồn tại không
    const hasSession = !!req.session;

    // Lấy thông tin session hiện tại
    const sessionInfo = {
      exists: hasSession,
      id: req.sessionID || 'no-session-id',
      isAuthenticated: hasSession && req.session.authenticated === true,
      username: hasSession ? (req.session.username || 'none') : 'no-session',
      role: hasSession ? (req.session.role || 'none') : 'no-session',
      cookieSettings: hasSession ? {
        maxAge: req.session.cookie.maxAge,
        httpOnly: req.session.cookie.httpOnly,
        secure: req.session.cookie.secure,
        path: req.session.cookie.path
      } : 'no-cookie'
    };

    // Trả về thông tin
    return res.json({
      success: true,
      message: 'Session test',
      sessionInfo
    });
  } catch (error) {
    console.error('Session test error:', error);
    return res.json({
      success: false,
      message: 'Lỗi khi kiểm tra session',
      error: error.message || 'Unknown error'
    });
  }
});

// Thêm một API đăng nhập đơn giản mới để test - simplified
router.post('/test-login', (req, res) => {
  // Endpoint dev — chỉ bật khi ZALO_DEV_ENDPOINTS=1; production trả 404.
  if (!DEV_ENDPOINTS) return res.status(404).json({ success: false, message: 'Not found' });

  try {
    // KHÔNG log req.body (chứa mật khẩu).
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Tài khoản và mật khẩu không được để trống' });
    }

    const user = validateUser(username, password);

    if (user) {
      if (req.session) {
        req.session.authenticated = true;
        req.session.username = user.username;
        req.session.role = user.role;
        req.session.save(err => {
          if (err) console.error('Session save error:', err);
          // Trả user THẬT, không hardcode admin/admin.
          return res.json({
            success: true,
            user: { username: user.username, role: user.role },
            sessionID: req.sessionID,
            message: 'Đăng nhập thành công'
          });
        });
      } else {
        console.error('No session object available');
        return res.json({
          success: true,
          user: { username: user.username, role: user.role },
          sessionAvailable: false,
          message: 'Đăng nhập thành công, nhưng session không khả dụng'
        });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác' });
    }
  } catch (error) {
    console.error('Error in test-login:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// API test JSON đơn giản — dev only (echo lại body, không dùng ở production).
router.post('/test-json', (req, res) => {
  if (!DEV_ENDPOINTS) return res.status(404).json({ success: false, message: 'Not found' });
  res.setHeader('Content-Type', 'application/json');
  return res.json({
    success: true,
    message: 'Test JSON thành công',
    receivedData: req.body || null
  });
});

// API quản lý webhook URLs theo số điện thoại

// Endpoint để lấy tất cả cấu hình webhook
router.get('/account-webhooks', adminMiddleware, (req, res) => {
    try {
        const webhookConfigs = getAllWebhookConfigs();
        res.json({ success: true, data: webhookConfigs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint để lấy cấu hình webhook của một tài khoản
router.get('/account-webhook/:ownId', adminMiddleware, (req, res) => {
    try {
        const { ownId } = req.params;

        if (!ownId) {
            return res.status(400).json({ success: false, error: 'ownId là bắt buộc' });
        }

        const messageWebhookUrl = getWebhookUrl('messageWebhookUrl', ownId);
        const groupEventWebhookUrl = getWebhookUrl('groupEventWebhookUrl', ownId);
        const reactionWebhookUrl = getWebhookUrl('reactionWebhookUrl', ownId);

        res.json({
            success: true,
            data: {
                ownId,
                messageWebhookUrl,
                groupEventWebhookUrl,
                reactionWebhookUrl
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint để thiết lập webhook URL cho một tài khoản cụ thể
router.post('/account-webhook', adminMiddleware, (req, res) => {
    try {
        const { ownId, messageWebhookUrl, groupEventWebhookUrl, reactionWebhookUrl } = req.body;

        if (!ownId) {
            return res.status(400).json({ success: false, error: 'ownId là bắt buộc' });
        }

        let success = true;

        // Thiết lập từng loại webhook URL nếu được cung cấp
        if (messageWebhookUrl !== undefined) {
            success = success && setWebhookUrl(ownId, 'messageWebhookUrl', messageWebhookUrl);
        }

        if (groupEventWebhookUrl !== undefined) {
            success = success && setWebhookUrl(ownId, 'groupEventWebhookUrl', groupEventWebhookUrl);
        }

        if (reactionWebhookUrl !== undefined) {
            success = success && setWebhookUrl(ownId, 'reactionWebhookUrl', reactionWebhookUrl);
        }

        if (success) {
            res.json({ success: true, message: 'Đã cập nhật webhook URLs cho tài khoản' });
        } else {
            res.status(500).json({ success: false, error: 'Lỗi khi cập nhật webhook URLs' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint để xóa cấu hình webhook của một tài khoản
router.delete('/account-webhook/:ownId', adminMiddleware, (req, res) => {
    try {
        const { ownId } = req.params;

        if (!ownId) {
            return res.status(400).json({ success: false, error: 'ownId là bắt buộc' });
        }

        if (removeWebhookConfig(ownId)) {
            res.json({ success: true, message: 'Đã xóa cấu hình webhook cho tài khoản' });
        } else {
            res.status(500).json({ success: false, error: 'Lỗi khi xóa cấu hình webhook' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint debug để kiểm tra trạng thái webhookConfig
router.get('/debug-webhook-config', adminMiddleware, (req, res) => {
    // Endpoint debug — lộ cấu hình webhook (URL). Bịt ở production (chỉ bật
    // ZALO_DEV_ENDPOINTS=1) và bắt buộc admin.
    if (!DEV_ENDPOINTS) return res.status(404).json({ success: false, message: 'Not found' });
    try {
        const webhookConfigs = getAllWebhookConfigs();
        const fileExists = fs.existsSync(path.join(__dirname, 'webhookConfig.json'));

        res.json({
            success: true,
            configExists: !!webhookConfigs,
            fileExists: fileExists,
            data: webhookConfigs,
            dirname: __dirname,
            configPath: path.join(__dirname, 'webhookConfig.json')
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// Endpoint debug để kiểm tra file users.json
router.get('/debug-users-file', (req, res) => {
    // Endpoint dev — trước đây PUBLIC, lộ username/role/độ dài+prefix salt-hash
    // cho bất kỳ ai. Chỉ bật khi ZALO_DEV_ENDPOINTS=1; production trả 404.
    if (!DEV_ENDPOINTS) return res.status(404).json({ success: false, message: 'Not found' });
    try {
        const userFilePath = path.join(process.cwd(), 'data', 'cookies', 'users.json');
        const fileExists = fs.existsSync(userFilePath);
        let fileContent = null;
        let users = [];

        if (fileExists) {
            fileContent = fs.readFileSync(userFilePath, 'utf8');
            try {
                users = JSON.parse(fileContent);
                // Che giấu thông tin nhạy cảm
                users = users.map(user => ({
                    username: user.username,
                    role: user.role,
                    saltLength: user.salt ? user.salt.length : 0,
                    hashLength: user.hash ? user.hash.length : 0,
                    saltPrefix: user.salt ? user.salt.substring(0, 5) + '...' : null,
                    hashPrefix: user.hash ? user.hash.substring(0, 5) + '...' : null
                }));
            } catch (parseError) {
                return res.status(500).json({
                    success: false,
                    error: 'Invalid JSON in users file',
                    parseError: parseError.message
                });
            }
        }

        res.json({
            success: true,
            fileExists: fileExists,
            filePath: userFilePath,
            fileSize: fileContent ? fileContent.length : 0,
            users: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

// Endpoint reset mật khẩu admin — TRƯỚC đây reset về 'admin' cứng (PBKDF2 1000
// vòng) → backdoor: một admin (hoặc session giả nhờ SESSION_SECRET cũ) đặt lại
// về mật khẩu đoán được. Nay: bịt ở production (chỉ bật khi ZALO_DEV_ENDPOINTS=1),
// và khi chạy thì đặt mật khẩu NGẪU NHIÊN 600.000 vòng, trả về một lần.
router.post('/reset-admin-password', adminMiddleware, (req, res) => {
    if (!DEV_ENDPOINTS) return res.status(404).json({ success: false, message: 'Not found' });
    try {
        const userFilePath = path.join(process.cwd(), 'data', 'cookies', 'users.json');
        const fileExists = fs.existsSync(userFilePath);

        if (!fileExists) {
            return res.status(404).json({
                success: false,
                error: 'File users.json không tồn tại'
            });
        }

        // Đọc file hiện tại
        let users = [];
        try {
            const fileContent = fs.readFileSync(userFilePath, 'utf8');
            users = JSON.parse(fileContent);
        } catch (parseError) {
            return res.status(500).json({
                success: false,
                error: 'Lỗi khi đọc file users.json',
                parseError: parseError.message
            });
        }

        // Tìm user admin
        const adminIndex = users.findIndex(user => user.username === 'admin');
        if (adminIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy tài khoản admin'
            });
        }

        // Mật khẩu NGẪU NHIÊN (không còn 'admin' đoán được) + 600.000 vòng.
        const newPassword = crypto.randomBytes(18).toString('base64url');
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(newPassword, salt, 600000, 64, 'sha512').toString('hex');

        // Cập nhật user admin
        users[adminIndex].salt = salt;
        users[adminIndex].hash = hash;
        users[adminIndex].iterations = 600000;

        // Ghi lại file
        try {
            // Tạo file tạm thời
            const tempFilePath = path.join(process.cwd(), 'data', 'cookies', 'users.json.tmp');
            fs.writeFileSync(tempFilePath, JSON.stringify(users, null, 2), { encoding: 'utf8', flag: 'w' });

            // Di chuyển file tạm thời thành file chính thức
            fs.renameSync(tempFilePath, userFilePath);

            return res.json({
                success: true,
                message: 'Đã reset mật khẩu admin (ngẫu nhiên) — lưu lại ngay, chỉ hiện MỘT lần',
                password: newPassword
            });
        } catch (writeError) {
            return res.status(500).json({
                success: false,
                error: 'Lỗi khi ghi file users.json',
                writeError: writeError.message
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});

export default router;