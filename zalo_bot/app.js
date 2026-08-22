// app.js
import express from 'express';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import cookieParser from 'cookie-parser';
import { authMiddleware, dashboardRoleMiddleware, isPublicRoute, getServerApiKey } from './services/authService.js';
import { loadWebhookConfig } from './services/webhookService.js';
import routes from './routes/index.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { loadHomeAssistantOptions, getDataDirectory } from './config/addon.js';
import { zaloAccounts, loginZaloAccount } from './api/zalo/zalo.js';
import { normalizeZaloIdsInPlace } from './utils/zaloContract.js';

// Dành cho ES Module: xác định __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Home Assistant options if available
const dataDirectory = loadHomeAssistantOptions();
console.log(`Using data directory: ${dataDirectory}`);

// Kiểm tra và đảm bảo thư mục dữ liệu tồn tại và có quyền ghi
if (!fs.existsSync(dataDirectory)) {
  console.log(`Thư mục dữ liệu ${dataDirectory} không tồn tại, đang tạo mới...`);
  try {
    fs.mkdirSync(dataDirectory, { recursive: true });
    console.log(`Đã tạo thư mục dữ liệu ${dataDirectory}`);
  } catch (error) {
    console.error(`Lỗi khi tạo thư mục dữ liệu: ${error.message}`);
  }
}

// Thử ghi file test để kiểm tra quyền
try {
  const testFile = path.join(dataDirectory, '.test_write.txt');
  fs.writeFileSync(testFile, 'test write permission', 'utf8');
  console.log(`Đã ghi thành công file test tại ${testFile}`);
  fs.unlinkSync(testFile);
} catch (error) {
  console.error(`Không thể ghi vào thư mục dữ liệu: ${error.message}`);
}

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, 'config', '.env') });

// P0#4: cảnh báo nếu không có API key — route gửi tin có thể public (legacy)
const _zaloApiKey = getServerApiKey();
if (!_zaloApiKey) {
  console.warn(
    '[SECURITY] ZALO_SERVER_API_KEY / CHATGPT2API_AUTH_KEY chưa set — ' +
    'một số API gửi tin vẫn public (legacy). Đặt key + gửi Authorization: Bearer …'
  );
} else {
  console.log('[SECURITY] zalo-server API key auth ENABLED for sensitive routes');
}

const app = express();

// Cấu hình EJS
app.set('view engine', 'ejs');
const viewsPath = path.join(__dirname, 'views');
console.log('Views path:', viewsPath);
app.set('views', viewsPath);

// Kiểm tra thư mục views
if (fs.existsSync(viewsPath)) {
  const files = fs.readdirSync(viewsPath);
  console.log('Views directory exists. Files:', files);
} else {
  console.error('Views directory does not exist at', viewsPath);
  // Nếu không tồn tại, thử tạo thư mục
  try {
    fs.mkdirSync(viewsPath, { recursive: true });
    console.log('Created views directory at', viewsPath);
  } catch (error) {
    console.error('Failed to create views directory:', error);
  }
}

// Tải cấu hình webhook từ file
loadWebhookConfig();
console.log("Đã tải cấu hình webhook");

// Thiết lập middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true })); // Dùng để parse dữ liệu form
app.use(cookieParser());

// Zalo user/group/message IDs co the vuot Number.MAX_SAFE_INTEGER nen phai giu
// chuoi. Rieng poll/quick-message/sticker la API zca-js dung so: contract
// chuyen va kiem tra dung kieu truoc khi route goi SDK.
app.use((req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') normalizeZaloIdsInPlace(req.body);
    next();
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Middleware phát hiện HA ingress proxy — tất cả link phải có prefix này
app.use((req, res, next) => {
  const ingressPath = req.headers['x-ingress-path'] || '';
  req.ingressPath = ingressPath;
  res.locals.ingressPath = ingressPath;
  next();
});

// ── Generate PWA icons & screenshots ────────────────────────────────────
(function generateIcons() {
    const iconsDir = path.join(__dirname, 'public', 'chat', 'icons');
    if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
    const srcIcon = path.join(iconsDir, 'zalo.png');
    if (!fs.existsSync(srcIcon)) return;

    // Icons from zalo.png
    [192, 512].forEach(size => {
        const pngPath = path.join(iconsDir, `icon-${size}.png`);
        // Luôn regenerate để cập nhật icon mới
        sharp(srcIcon).resize(size, size).png().toFile(pngPath)
            .then(() => console.log(`[PWA] Icon ${size}x${size} generated`))
            .catch(e => console.warn(`[PWA] Icon ${size} failed:`, e.message));
    });
    // Screenshots
    const screenshots = [
        { name: 'screenshot-wide', w: 1280, h: 720, text: 'Zalo Chat' },
        { name: 'screenshot-narrow', w: 720, h: 1280, text: 'Zalo Chat' }
    ];
    screenshots.forEach(({ name, w, h, text }) => {
        const pngPath = path.join(iconsDir, `${name}.png`);
        if (fs.existsSync(pngPath)) return;
        const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
            <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#0068ff"/>
                <stop offset="100%" style="stop-color:#4d9fff"/>
            </linearGradient></defs>
            <rect width="${w}" height="${h}" fill="url(#g)"/>
            <text x="${w/2}" y="${h/2}" font-family="Inter,sans-serif" font-size="36" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">${text}</text>
        </svg>`;
        sharp(Buffer.from(overlay)).resize(w, h).png().toFile(pngPath)
            .then(() => console.log(`[PWA] Screenshot ${name} generated`))
            .catch(e => console.warn(`[PWA] Screenshot ${name} failed:`, e.message));
    });
})();

// SESSION_SECRET: KHÔNG dùng default cứng ('zalo-server-secret-key' đoán được
// → giả mạo session ký khi service lộ ra mạng). Ưu tiên env; thiếu env thì
// sinh NGẪU NHIÊN mỗi lần chạy (session không sống qua restart — người dùng
// đăng nhập lại — nhưng không còn secret đoán được). Đặt SESSION_SECRET để
// session bền qua restart.
const sessionSecret = (process.env.SESSION_SECRET || '').trim()
  || crypto.randomBytes(32).toString('hex');
if (!(process.env.SESSION_SECRET || '').trim()) {
  console.warn('[BẢO MẬT] Chưa đặt SESSION_SECRET — dùng secret NGẪU NHIÊN phiên này (session không sống qua restart). Hãy đặt SESSION_SECRET.');
}

// ZALO_COOKIE_SECURE chỉ nhận "0" hoặc "1". Mọi giá trị khác ("true", "yes",
// "on"…) rơi vào nhánh false một cách IM LẶNG — người triển khai tưởng đã bật
// cookie Secure trong khi thực tế chưa. Nói to ra thay vì để họ tự đoán.
const cookieSecureRaw = (process.env.ZALO_COOKIE_SECURE ?? '').trim();
if (cookieSecureRaw !== '' && cookieSecureRaw !== '0' && cookieSecureRaw !== '1') {
  console.warn(
    `[BẢO MẬT] ZALO_COOKIE_SECURE="${cookieSecureRaw}" không hợp lệ — chỉ chấp nhận "0" hoặc "1". ` +
    'Đang hiểu là "0" (cookie KHÔNG có cờ Secure). Muốn bật thì đặt đúng ZALO_COOKIE_SECURE=1.'
  );
}
const cookieSecure = cookieSecureRaw === '1';
if (cookieSecure) {
  console.warn(
    '[BẢO MẬT] ZALO_COOKIE_SECURE=1 — cookie session chỉ gửi qua HTTPS. ' +
    'Bot Python gọi http://127.0.0.1:3001 sẽ MẤT phiên; chỉ dùng khi zalo-server đứng sau HTTPS hoàn toàn.'
  );
}

const FileStore = sessionFileStore(session);

// Export session middleware để dùng lại khi xác thực WebSocket upgrade
// (server.js) — WS trước đây nhận MỌI kết nối, broadcast toàn bộ tin nhắn cho
// bất kỳ ai (báo cáo bảo mật 07/08). Cùng một session middleware nên cùng cách
// xác thực với HTTP.
export const sessionMiddleware = session({
  store: new FileStore({
    path: path.join(getDataDirectory(), 'sessions'),
    ttl: 30 * 24 * 60 * 60, // 30 ngày (tính bằng giây)
    retries: 0
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: 'zalo-server.sid',
  cookie: {
    // secure BẬT khi ZALO_COOKIE_SECURE=1 (triển khai chỉ-HTTPS qua tunnel).
    // Mặc định false để không phá đăng nhập LAN qua HTTP (chủ máy dùng cả hai).
    secure: cookieSecure,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 ngày
    path: '/',
    sameSite: 'lax'
  },
  rolling: true // Gia hạn session mỗi lần request
});
app.use(sessionMiddleware);

// Log để debug session
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Session exists:', !!req.session);
  next();
});

// Middleware xác thực cho tất cả các route trừ những route công khai
app.use((req, res, next) => {
  // Bỏ qua xác thực cho các API route và các route công khai
  if (isPublicRoute(req.path)) {
    console.log(`Skipping auth for public route: ${req.path}`);
    return next();
  }

  // Áp dụng middleware xác thực cho các route khác
  console.log(`Applying auth middleware for protected route: ${req.path}`);
  authMiddleware(req, res, () => dashboardRoleMiddleware(req, res, next));
});

// Thiết lập route
app.use('/', routes);

// ── Static file middleware — để sau routes ───────────────────────────────
// Phải sau routes để ko bị redirect /chat → /chat/
const publicDir = '/config/www/zalo_bot';
if (!fs.existsSync(publicDir)) {
  try { fs.mkdirSync(publicDir, { recursive: true }); } catch (error) { console.error(`Lỗi tạo public dir:`, error.message); }
}
app.use(express.static(publicDir));
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders(res, filePath) {
        if (filePath.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
    }
}));
app.use('/zalo_bot', express.static(publicDir));
console.log('Static files path:', publicDir, 'và', path.join(__dirname, 'public'));

// Login từ cookie đã lưu
// Login từ cookie đã lưu
import { getCookiesDir } from './utils/helpers.js';

const cookiesDir = getCookiesDir();
console.log(`Thư mục cookies được cấu hình: ${cookiesDir}`);

if (fs.existsSync(cookiesDir)) {
    try {
        const cookieFiles = fs.readdirSync(cookiesDir);
        console.log(`Tìm thấy ${cookieFiles.length} file cookie trong thư mục ${cookiesDir}`);

        // Sử dụng IIFE để tránh top-level await
        (async function() {
            for (const file of cookieFiles) {
                if (file.startsWith('cred_') && file.endsWith('.json')) {
                    const ownId = file.substring(5, file.length - 5);
                    try {
                        // Bỏ qua nếu tài khoản đã đăng nhập
                        if (zaloAccounts.some(a => a.ownId === ownId)) {
                            console.log(`Tài khoản ${ownId} đã đăng nhập, bỏ qua.`);
                            continue;
                        }

                        const cookiePath = path.join(cookiesDir, file);
                        if (fs.existsSync(cookiePath)) {
                            const cookie = JSON.parse(fs.readFileSync(cookiePath, "utf-8"));
                            // Thử lại nhiều lần TRƯỚC KHI kết luận, và CHỈ xoá
                            // cookie khi chắc chắn nó không còn hợp lệ.
                            //
                            // Vì sao phải sửa: bản cũ xoá file cookie ngay khi
                            // đăng nhập lại thất bại vì BẤT KỲ lý do gì — kể cả
                            // mạng chưa sẵn sàng. Mà container khởi động thì
                            // mạng Docker dựng SAU tiến trình, nên cứ deploy là
                            // dễ mất phiên Zalo cá nhân, phải quét QR lại. Đo
                            // thật trên máy chủ 2026-07-30 07:54: container khởi
                            // động đúng lúc luật NAT vừa dựng lại, log ghi "Tìm
                            // thấy 0 file cookie" — cookie đã bị chính đoạn này
                            // xoá ở lần khởi động trước, dù tài khoản vẫn còn
                            // hiệu lực (thư mục messages/ vẫn nguyên từ 25/7).
                            //
                            // Mất mạng là chuyện TẠM THỜI; xoá cookie là mất
                            // VĨNH VIỄN. Không được đổi cái tạm thời thành cái
                            // vĩnh viễn.
                            const LOI_MANG = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|socket hang up|network|timeout|fetch failed/i;
                            let thanhCong = false;
                            let loiCuoi = null;
                            let loiMang = false;
                            for (let lan = 1; lan <= 3; lan++) {
                                try {
                                    await loginZaloAccount(null, cookie);
                                    if (zaloAccounts.some(a => a.ownId === ownId)) {
                                        thanhCong = true;
                                        break;
                                    }
                                    loiCuoi = new Error("đăng nhập không báo lỗi nhưng tài khoản không vào danh sách");
                                } catch (loginError) {
                                    loiCuoi = loginError;
                                    if (LOI_MANG.test(String(loginError && loginError.message))) {
                                        loiMang = true;
                                    }
                                }
                                if (lan < 3) {
                                    console.log(`[Restore] ${ownId} — thử lại lần ${lan + 1} sau ${lan * 5}s (${loiCuoi && loiCuoi.message})`);
                                    await new Promise(r => setTimeout(r, lan * 5000));
                                }
                            }
                            if (thanhCong) {
                                console.log(`[Restore] ${ownId} — OK`);
                            } else if (loiMang) {
                                // GIỮ cookie: lỗi mạng thì lần khởi động sau còn
                                // cơ hội, xoá đi là bắt người dùng quét QR lại
                                // chỉ vì mạng chậm mấy giây.
                                console.error(`[Restore] ${ownId} — LỖI MẠNG, GIỮ cookie để thử lại lần sau: ${loiCuoi && loiCuoi.message}`);
                            } else {
                                console.log(`[Restore] ${ownId} — cookie không còn hợp lệ, đã xóa: ${loiCuoi && loiCuoi.message}`);
                                try { fs.unlinkSync(cookiePath); } catch (e) { /* ignore */ }
                            }
                        } else {
                            console.log(`Không tìm thấy file cookie: ${cookiePath}`);
                        }
                    } catch (error) {
                        console.error(`Lỗi khi đọc/xử lý cookie cho tài khoản ${ownId}:`, error.message);
                    }
                }
            }
        })().catch(err => {
            console.error('Lỗi khi xử lý đăng nhập từ cookie:', err);
        });
    } catch (dirError) {
        console.error(`Lỗi khi đọc thư mục cookies:`, dirError);
    }
} else {
    console.log(`Thư mục cookies không tồn tại: ${cookiesDir}. Đang tạo mới...`);
    fs.mkdirSync(cookiesDir, { recursive: true });
}

// In ra thông tin về biến môi trường dữ liệu
console.log('DATA_DIRECTORY from process.env:', process.env.DATA_DIRECTORY);

export default app;
