import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { zaloAccounts, loginZaloAccount } from '../api/zalo/zalo.js';
import { proxyService } from '../services/proxyService.js';
import { selfReplyService } from '../services/selfReplyService.js';
import { adminMiddleware } from '../services/authService.js';
import dotenv from 'dotenv';
import { broadcastMessage } from '../services/websocketHub.js';
import { setDefaultWebhookUrl } from '../services/webhookService.js';

const router = express.Router();

// Dành cho ES Module: xác định __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đường dẫn đến thư mục views
const viewsPath = path.join(__dirname, '..', 'views');

// Route đăng nhập quản trị
router.get('/admin-login', (req, res) => {
  console.log("Admin login page requested");
  // Nếu đã đăng nhập, chuyển hướng về trang chủ
  if (req.session && req.session.authenticated) {
    console.log("User already authenticated, redirecting to home page");
    return res.redirect('/');
  }

  // Đường dẫn tuyệt đối đến file admin-login.ejs
  const templatePath = path.join(process.cwd(), 'src', 'views', 'admin-login.ejs');

  // Kiểm tra nếu file tồn tại
  if (fs.existsSync(templatePath)) {
    console.log(`Template file exists at: ${templatePath}`);
  } else {
    console.log(`Template file does NOT exist at: ${templatePath}`);
  }

  try {
    res.render('admin-login');
    console.log("Rendered admin-login template");
  } catch (error) {
    console.error("Error rendering admin-login template:", error);
    res.status(500).send("Lỗi khi hiển thị trang đăng nhập");
  }
});

// Thêm thông tin session vào trang chủ
router.get('/', (req, res) => {
    let authenticated = false;
    let username = '';
    let isAdmin = false;

    if (req.session && req.session.authenticated) {
      authenticated = true;
      username = req.session.username;
      isAdmin = req.session.role === 'admin';
    }

    res.render('index', {
      authenticated: authenticated,
      username: username,
      isAdmin: isAdmin
    });
});

// Hiển thị form đăng nhập
router.get('/zalo-login', (req, res) => {
    res.render('improved-login');
});

// Xử lý đăng nhập: sử dụng proxy do người dùng nhập nếu hợp lệ, nếu không sẽ sử dụng proxy mặc định
router.post('/zalo-login', async (req, res) => {
    try {
        console.log('Nhận yêu cầu tạo mã QR với dữ liệu:', req.body);
        const { proxy } = req.body;
        console.log('Đang tạo mã QR với proxy:', proxy || 'không có proxy');

        const qrCodeImage = await loginZaloAccount(proxy, null);
        console.log('Đã tạo mã QR thành công, độ dài:', qrCodeImage ? qrCodeImage.length : 0);

        res.json({ success: true, qrCodeImage });
    } catch (error) {
        console.error('Lỗi khi tạo mã QR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Hiển thị form cập nhật webhook URL
router.get('/updateWebhookForm', adminMiddleware, (req, res) => {
    res.render('updateWebhookForm');
});

// Endpoint hiển thị tài liệu API
router.get('/list', (req, res) => {
    res.render('api-doc');
});

// Lấy danh sách tài khoản đã đăng nhập
router.get('/accounts', (req, res) => {
    const acceptHeader = req.headers.accept || '';

    const accounts = zaloAccounts.map(account => ({
        ownId: account.ownId,
        proxy: account.proxy,
        phoneNumber: account.phoneNumber || 'N/A',
    }));

    if (acceptHeader.includes('application/json')) {
        return res.json({
            success: true,
            accounts: accounts
        });
    }

    // Add-on KHÔNG có views/accounts.ejs: view đó thuộc giao diện chat của
    // chatgpt2api và cần /chat/css, /chat/icons. Dựng bảng ngay tại đây như bản
    // cũ của add-on, nhưng ESCAPE giá trị — `proxy` do người dùng nhập ở trang
    // Proxies nên nối thẳng vào HTML là một đường XSS lưu trữ.
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const hang = accounts.map((a) => (
        `<tr><td>${esc(a.ownId)}</td><td>${esc(a.phoneNumber || 'N/A')}</td>`
        + `<td>${esc(a.proxy || 'Không có')}</td></tr>`
    )).join('');
    res.send(
        '<table border="1"><thead><tr><th>Own ID</th><th>Phone Number</th>'
        + `<th>Proxy</th></tr></thead><tbody>${hang}</tbody></table>`
    );
});

// Endpoint cập nhật 3 webhook URL
router.post('/updateWebhook', adminMiddleware, (req, res) => {
  const { messageWebhookUrl, groupEventWebhookUrl, reactionWebhookUrl } = req.body;
  // Kiểm tra tính hợp lệ của từng URL
  if (!messageWebhookUrl || !messageWebhookUrl.startsWith("http")) {
      return res.status(400).json({ success: false, error: 'messageWebhookUrl không hợp lệ' });
  }
  if (!groupEventWebhookUrl || !groupEventWebhookUrl.startsWith("http")) {
      return res.status(400).json({ success: false, error: 'groupEventWebhookUrl không hợp lệ' });
  }
  if (!reactionWebhookUrl || !reactionWebhookUrl.startsWith("http")) {
      return res.status(400).json({ success: false, error: 'reactionWebhookUrl không hợp lệ' });
  }

  // Update process.env variables
  process.env.MESSAGE_WEBHOOK_URL = messageWebhookUrl;
  process.env.GROUP_EVENT_WEBHOOK_URL = groupEventWebhookUrl;
  process.env.REACTION_WEBHOOK_URL = reactionWebhookUrl;

  // Lưu vào file cấu hình webhook trong THƯ MỤC DỮ LIỆU, không ghi .env nữa.
  // Đường cũ ghi hai tệp: /app/.env và /app/zalo_data/.env. Tệp thứ hai nằm
  // trong thư mục mà Dockerfile không hề tạo, nên lệnh ghi luôn ném lỗi và
  // route này luôn trả 500 — cập nhật webhook từ trang quản trị chưa bao giờ
  // thành công. Cả hai tệp cũng nằm trong image, tức mất sạch mỗi lần cập nhật
  // add-on. File cấu hình webhook thì nằm cùng chỗ với dữ liệu người dùng.
  const luu = [
    setDefaultWebhookUrl('messageWebhookUrl', messageWebhookUrl),
    setDefaultWebhookUrl('groupEventWebhookUrl', groupEventWebhookUrl),
    setDefaultWebhookUrl('reactionWebhookUrl', reactionWebhookUrl),
  ];
  if (luu.every(Boolean)) {
    return res.json({ success: true, message: 'Webhook URLs đã được cập nhật' });
  }
  return res.status(500).json({ success: false, error: 'Không ghi được cấu hình webhook' });
});

// API quản lý proxy
// Lấy danh sách proxy hiện có
router.get('/proxies', adminMiddleware, (req, res) => {
  const acceptHeader = req.headers.accept || '';
  if (acceptHeader.includes('application/json')) {
    return res.json({ success: true, data: proxyService.getPROXIES() });
  }
  res.render('proxies', { proxies: proxyService.getPROXIES() });
});

// Thêm một proxy mới
router.post('/proxies', adminMiddleware, (req, res) => {
  const { proxyUrl } = req.body;
  if (!proxyUrl) {
      return res.status(400).json({ success: false, error: 'proxyUrl không hợp lệ' });
  }
  try {
      const newProxy = proxyService.addProxy(proxyUrl);
      res.json({ success: true, data: newProxy });
  } catch (error) {
      res.status(500).json({ success: false, error: error.message });
  }
});

// Xóa một proxy
router.delete('/proxies', adminMiddleware, (req, res) => {
  const { proxyUrl } = req.body;
  if (!proxyUrl) {
      return res.status(400).json({ success: false, error: 'proxyUrl không hợp lệ' });
  }
  try {
      proxyService.removeProxy(proxyUrl);
      res.json({ success: true, message: 'Xóa proxy thành công' });
  } catch (error) {
      res.status(500).json({ success: false, error: error.message });
  }
});

// ── "Tra loi ca tin cua chinh toi" theo tung thread ─────────────────────────
// Bat/tat + tu khoa RIENG cho moi threadId, mac dinh tat. Chong lap: chi tin
// isSelf chua tu khoa cua thread moi duoc day kem co self_reply.
router.get('/self-reply', adminMiddleware, (req, res) => {
  const acceptHeader = req.headers.accept || '';
  if (acceptHeader.includes('application/json')) {
    return res.json({ success: true, data: selfReplyService.getAll() });
  }
  res.render('self-reply');
});

router.post('/self-reply', adminMiddleware, (req, res) => {
  const { threadId, enabled, keyword } = req.body || {};
  if (!threadId || !String(threadId).trim()) {
    return res.status(400).json({ success: false, error: 'threadId khong hop le' });
  }
  const on = enabled === true || enabled === 'true' || enabled === 1 || enabled === '1';
  const kw = String(keyword || '').trim();
  if (on && !kw) {
    return res.status(400).json({ success: false, error: 'Bat thi PHAI co tu khoa (chong lap). Vd @bot, //, #me.' });
  }
  try {
    const saved = selfReplyService.set(String(threadId).trim(), on, kw);
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/self-reply', adminMiddleware, (req, res) => {
  const { threadId } = req.body || {};
  if (!threadId || !String(threadId).trim()) {
    return res.status(400).json({ success: false, error: 'threadId khong hop le' });
  }
  try {
    selfReplyService.remove(String(threadId).trim());
    res.json({ success: true, message: 'Da xoa' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route test session
router.get('/session-test', (req, res) => {
    res.render('session-test');
});

// Route quản lý người dùng
router.get('/user-management', adminMiddleware, (req, res) => {
  res.render('user-management');
});

// Hiển thị trang quản lý webhook theo tài khoản
router.get('/account-webhook-manager', adminMiddleware, (req, res) => {
    res.render('account-webhook-manager');
});

// Hiển thị trang đổi mật khẩu
router.get('/change-password', (req, res) => {
    // Kiểm tra xem người dùng đã đăng nhập chưa
    if (!req.session || !req.session.authenticated) {
        return res.redirect('/admin-login');
    }

    res.render('change-password');
});

// Đã gỡ trang /reset-password. Trang này mở công khai nhưng nút bấm gọi
// /api/reset-admin-password — đường đó nay chỉ bật ở chế độ gỡ lỗi nên luôn trả
// 404, thành ra trang mở được mà không làm được gì. Admin đổi mật khẩu tại
// /change-password.

// Route hiển thị tin nhắn và thread_id
router.get('/messages', (req, res) => {
  console.log("Messages tracking page requested");
  try {
    res.render('messages');
    console.log("Rendered messages tracking page");
  } catch (error) {
    console.error("Error rendering messages page:", error);
    res.status(500).send("Lỗi khi hiển thị trang theo dõi tin nhắn");
  }
});

export default router;