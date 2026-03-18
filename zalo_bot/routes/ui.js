import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { zaloAccounts, loginZaloAccount } from '../api/zalo/zalo.js';
import { proxyService } from '../services/proxyService.js';
import dotenv from 'dotenv';
import { broadcastMessage } from '../server.js';  // Import hàm broadcast tin nhắn

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
router.get('/updateWebhookForm', (req, res) => {
    res.render('updateWebhookForm');
});

// Endpoint hiển thị tài liệu API
router.get('/list', (req, res) => {
    res.render('api-doc');
});

// Lấy danh sách tài khoản đã đăng nhập
router.get('/accounts', (req, res) => {
    if (zaloAccounts.length === 0) {
        return res.json({ success: true, message: 'Chưa có tài khoản nào đăng nhập' });
    }

    const accounts = zaloAccounts.map(account => ({
        ownId: account.ownId,
        proxy: account.proxy,
        phoneNumber: account.phoneNumber || 'N/A',
    }));

    // Tạo bảng HTML cho các yêu cầu từ trình duyệt
    let html = '<table border="1">';
    html += '<thead><tr>';
    const headers = ['Own ID', 'Phone Number', 'Proxy'];
    headers.forEach(header => {
        html += `<th>${header}</th>`;
    });
    html += '</tr></thead><tbody>';
    accounts.forEach((account) => {
        html += '<tr>';
        html += `<td>${account.ownId}</td>`;
        html += `<td>${account.phoneNumber || 'N/A'}</td>`;
        html += `<td>${account.proxy || 'Không có'}</td>`;
        html += '</tr>';
    });
    html += '</tbody></table>';

    // Kiểm tra Accept header để quyết định định dạng trả về
    const acceptHeader = req.headers.accept || '';

    if (acceptHeader.includes('application/json')) {
        // Trả về JSON cho API calls
        return res.json({
            success: true,
            accounts: accounts,
            html: html
        });
    } else {
        // Trả về HTML cho truy cập trực tiếp từ trình duyệt
        res.send(html);
    }
});

// Endpoint cập nhật 3 webhook URL
router.post('/updateWebhook', (req, res) => {
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

  // Function to update or add a key in the .env content
  const updateEnvVar = (content, key, value) => {
    const regex = new RegExp(`^${key}=.*`, 'gm');
    const newLine = `${key}=${value}`;

    if (regex.test(content)) {
      return content.replace(regex, newLine);
    } else {
      return content + (content && !content.endsWith('\n') ? '\n' : '') + newLine + '\n';
    }
  };

  // Update root .env file
  const rootEnvPath = path.join(process.cwd(), '.env');
  let rootEnvContent = '';

  // Read existing .env content if it exists
  if (fs.existsSync(rootEnvPath)) {
    rootEnvContent = fs.readFileSync(rootEnvPath, 'utf8');
  }

  // Update all three webhook URLs
  rootEnvContent = updateEnvVar(rootEnvContent, 'MESSAGE_WEBHOOK_URL', messageWebhookUrl);
  rootEnvContent = updateEnvVar(rootEnvContent, 'GROUP_EVENT_WEBHOOK_URL', groupEventWebhookUrl);
  rootEnvContent = updateEnvVar(rootEnvContent, 'REACTION_WEBHOOK_URL', reactionWebhookUrl);

  // Also update Docker volume .env file
  const dockerEnvPath = path.join(process.cwd(), 'zalo_data', '.env');
  let dockerEnvContent = '';

  // Read existing Docker .env content if it exists
  if (fs.existsSync(dockerEnvPath)) {
    dockerEnvContent = fs.readFileSync(dockerEnvPath, 'utf8');
  }

  // Update all three webhook URLs in Docker .env
  dockerEnvContent = updateEnvVar(dockerEnvContent, 'MESSAGE_WEBHOOK_URL', messageWebhookUrl);
  dockerEnvContent = updateEnvVar(dockerEnvContent, 'GROUP_EVENT_WEBHOOK_URL', groupEventWebhookUrl);
  dockerEnvContent = updateEnvVar(dockerEnvContent, 'REACTION_WEBHOOK_URL', reactionWebhookUrl);

  // Write to both .env files
  try {
    fs.writeFileSync(rootEnvPath, rootEnvContent);
    fs.writeFileSync(dockerEnvPath, dockerEnvContent);
    res.json({ success: true, message: 'Webhook URLs đã được cập nhật' });
  } catch (err) {
    console.error("Lỗi khi ghi file .env:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API quản lý proxy
// Lấy danh sách proxy hiện có
router.get('/proxies', (req, res) => {
  res.json({ success: true, data: proxyService.getPROXIES() });
});

// Thêm một proxy mới
router.post('/proxies', (req, res) => {
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
router.delete('/proxies', (req, res) => {
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

// Route test session
router.get('/session-test', (req, res) => {
    res.render('session-test');
});

// Route quản lý người dùng
router.get('/user-management', (req, res) => {
  // Kiểm tra xem người dùng đã đăng nhập và có quyền admin chưa
  if (!req.session || !req.session.authenticated || req.session.role !== 'admin') {
    return res.redirect('/admin-login');
  }

  res.render('user-management');
});

// Hiển thị trang quản lý webhook theo tài khoản
router.get('/account-webhook-manager', (req, res) => {
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

// Hiển thị trang reset mật khẩu admin
router.get('/reset-password', (req, res) => {
    res.render('reset-password');
});

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