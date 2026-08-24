// auth.js - Quản lý xác thực người dùng
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getDataDirectory } from '../config/addon.js';
import { writeJsonAtomicSync } from '../utils/atomicFile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PBKDF2: bản ghi CŨ dùng 1000 vòng (yếu). Bản ghi MỚI dùng 600000 (OWASP
// khuyến nghị ≥210k cho PBKDF2-SHA512). Lưu số vòng THEO TỪNG bản ghi để bản
// cũ vẫn đăng nhập được (xác minh bằng đúng số vòng của nó), bản mới mạnh hơn.
const PBKDF2_ITERS = 600000;
const PBKDF2_LEGACY = 1000;

// Bản ĐỒNG BỘ chỉ dùng lúc khởi tạo users.json — thời điểm đó chưa phục vụ
// yêu cầu nào nên chặn event loop không hại ai.
function _hash(password, salt, iters) {
  return crypto.pbkdf2Sync(password, salt, iters, 64, 'sha512').toString('hex');
}

// Bản BẤT ĐỒNG BỘ cho mọi đường đi qua HTTP.
//
// pbkdf2Sync chặn toàn bộ event loop của Node trong lúc chạy. Đo trên chính máy
// Home Assistant (Armbian aarch64) ngày 23/08/2026: 600.000 vòng mất 3.410 ms.
// Suốt 3,4 giây đó máy chủ không nhận được tin Zalo nào và không trả lời được
// yêu cầu nào. crypto.pbkdf2 đẩy việc xuống threadpool của libuv nên event loop
// vẫn chạy bình thường.
function _hashAsync(password, salt, iters) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iters, 64, 'sha512', (error, derived) => {
      if (error) reject(error);
      else resolve(derived.toString('hex'));
    });
  });
}

// Mật khẩu admin ban đầu: ưu tiên env. KHÔNG có env → sinh NGẪU NHIÊN và cảnh
// báo (không còn 'admin' cứng đoán được). Trả {password, fromEnv}.
function _initialAdminSecret() {
  const env = String(process.env.ZALO_SERVER_ADMIN_PASSWORD || '').trim();
  if (env) return { password: env, fromEnv: true };
  return { password: crypto.randomBytes(18).toString('base64url'), fromEnv: false };
}

function _adminUsername() {
  return String(process.env.ZALO_SERVER_ADMIN_USERNAME || 'admin').trim() || 'admin';
}

// Đường dẫn đến file lưu thông tin đăng nhập. PHẢI nằm trong THƯ MỤC DỮ LIỆU
// (add-on mặc định /config/zalo_bot) chứ không phải process.cwd() = /app: /app
// nằm trong image, nên mỗi lần cập nhật add-on là container mới, users.json cũ
// biến mất cùng container cũ. Mật khẩu tự sinh thì còn dựng lại được từ
// .admin_password, nhưng mật khẩu người dùng tự đổi ở trang đổi mật khẩu thì
// mất hẳn. DATA_DIRECTORY do entrypoint.sh đọc từ options.json rồi export, nên
// giá trị đã đúng ngay lúc nạp module này.
const userFilePath = path.join(getDataDirectory(), 'cookies', 'users.json');

// Tạo file users.json nếu chưa tồn tại
const initUserFile = () => {
  try {
    console.log("Khởi tạo file người dùng...");

    // Kiểm tra và tạo thư mục cookies nếu chưa tồn tại
    const cookiesDir = path.join(getDataDirectory(), 'cookies');
    if (!fs.existsSync(cookiesDir)) {
      console.log("Thư mục cookies không tồn tại, đang tạo...");
      fs.mkdirSync(cookiesDir, { recursive: true });
      console.log("Đã tạo thư mục cookies thành công");
    } else {
      console.log("Thư mục cookies đã tồn tại");
    }

    // Đường dẫn đầy đủ đến file users.json
    console.log("Đường dẫn file users.json:", userFilePath);

    // Kiểm tra file users.json
    if (!fs.existsSync(userFilePath)) {
      console.log("File users.json không tồn tại, đang tạo...");

      // Mật khẩu admin ban đầu: env ZALO_SERVER_ADMIN_PASSWORD, hoặc NGẪU NHIÊN.
      // KHÔNG còn mặc định 'admin' đoán được.
      const uname = _adminUsername();
      const { password, fromEnv } = _initialAdminSecret();
      const salt = crypto.randomBytes(16).toString('hex');
      const users = [{
        username: uname,
        salt,
        hash: _hash(password, salt, PBKDF2_ITERS),
        iterations: PBKDF2_ITERS,
        role: 'admin',
      }];
      writeJsonAtomicSync(userFilePath, users);
      if (fromEnv) {
        console.log(`Đã tạo users.json với admin '${uname}' (mật khẩu từ ZALO_SERVER_ADMIN_PASSWORD)`);
      } else {
        // In MỘT LẦN để chủ máy đăng nhập rồi đổi — không có env thì đây là
        // đường duy nhất biết mật khẩu (không còn admin/admin).
        console.warn(`[BẢO MẬT] Chưa đặt ZALO_SERVER_ADMIN_PASSWORD. Đã sinh mật khẩu admin NGẪU NHIÊN cho '${uname}':`);
        console.warn(`[BẢO MẬT]   ${password}`);
        console.warn('[BẢO MẬT] Hãy đăng nhập, ĐỔI mật khẩu, rồi đặt ZALO_SERVER_ADMIN_PASSWORD để lần sau không sinh ngẫu nhiên.');
      }
    } else {
      // Kiểm tra file hợp lệ — KHÔNG log nội dung (chứa salt/hash).
      try {
        const content = fs.readFileSync(userFilePath, 'utf8');
        JSON.parse(content); // Kiểm tra xem có phải JSON hợp lệ
      } catch (readError) {
        console.error("Lỗi khi đọc/phân tích file users.json:", readError);
        // File hỏng → tạo lại, KHÔNG dùng admin/admin (env hoặc ngẫu nhiên).
        const uname = _adminUsername();
        const { password, fromEnv } = _initialAdminSecret();
        const salt = crypto.randomBytes(16).toString('hex');
        const users = [{
          username: uname,
          salt,
          hash: _hash(password, salt, PBKDF2_ITERS),
          iterations: PBKDF2_ITERS,
          role: 'admin',
        }];
        writeJsonAtomicSync(userFilePath, users);
        if (!fromEnv) {
          console.warn(`[BẢO MẬT] users.json hỏng, đã tạo lại admin '${uname}' với mật khẩu NGẪU NHIÊN:`);
          console.warn(`[BẢO MẬT]   ${password}`);
        }
      }
    }
  } catch (error) {
    console.error("Lỗi trong quá trình khởi tạo file người dùng:", error);
  }
};

// Khởi tạo file người dùng
initUserFile();

// Đọc dữ liệu người dùng từ file
const getUsers = () => {
  try {
    // Đảm bảo đọc dữ liệu mới nhất từ file (không sử dụng cache)
    const data = fs.readFileSync(userFilePath, { encoding: 'utf8', flag: 'r' });

    try {
      const users = JSON.parse(data);
      // KHÔNG log username/salt/hash của từng user (rò băm mật khẩu ra log).
      return users;
    } catch (parseError) {
      console.error('Lỗi khi phân tích JSON từ file users.json:', parseError);
      return [];
    }
  } catch (error) {
    console.error('Lỗi khi đọc file users.json:', error);
    return [];
  }
};

// Thêm người dùng mới
// Bọc trong withUserLock như deleteUser: hai thao tác cùng lúc trên users.json
// mà không có khoá thì thao tác sau ghi đè kết quả của thao tác trước.
// Băm NGOÀI khoá — việc đó tốn hàng trăm mili-giây tới vài giây và không đụng
// trạng thái chung — rồi mới vào khoá để đọc–sửa–ghi users.json.
//
// Bọc trong withUserLock như deleteUser: bản cũ không khoá, nên thêm hai người
// dùng cùng lúc thì người sau ghi đè kết quả của người trước.
export const addUser = async (username, password, role = 'user') => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await _hashAsync(password, salt, PBKDF2_ITERS);

  return withUserLock(() => {
    const users = getUsers();

    // Kiểm tra nếu username đã tồn tại
    if (users.some((user) => user.username === username)) {
      return false;
    }

    users.push({ username, salt, hash, iterations: PBKDF2_ITERS, role });
    writeJsonAtomicSync(userFilePath, users);
    return true;
  });
};

const lockFilePath = path.join(getDataDirectory(), 'cookies', 'users.lock');

async function withUserLock(fn) {
  const maxWaitMs = 30000;
  const startTime = Date.now();

  while (true) {
    try {
      // 'wx' flag: atomic check-and-create, fails nếu file đã tồn tại
      fs.writeFileSync(lockFilePath, String(Date.now()), { flag: 'wx' });
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        // Lỗi thật sự (permission, disk,...) — throw ra ngoài
        throw new Error(`Không thể tạo lock file: ${err.message}`);
      }

      // Lock đang được giữ bởi process khác, kiểm tra timeout
      if (Date.now() - startTime > maxWaitMs) {
        throw new Error('Không thể acquire lock sau 30s — lock có thể bị orphaned');
      }

      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  try {
    return await fn();
  } finally {
    try { fs.unlinkSync(lockFilePath); } catch (e) { /* ignore */ }
  }
}

export const deleteUser = (username) => {
  return withUserLock(() => {
    const users = getUsers();
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) return { success: false, message: 'Không tìm thấy người dùng' };

    // Không cho xóa admin cuối cùng
    const adminCount = users.filter(u => u.role === 'admin').length;
    if (users[idx].role === 'admin' && adminCount <= 1) {
      return { success: false, message: 'Không thể xóa admin cuối cùng' };
    }

    users.splice(idx, 1);
    writeJsonAtomicSync(userFilePath, users);
    return { success: true };
  });
};

// Xác thực người dùng và trả về thông tin user
export const validateUser = async (username, password) => {
  // Đọc dữ liệu trực tiếp từ file để đảm bảo dữ liệu mới nhất
  let users = [];
  try {
    const data = fs.readFileSync(userFilePath, { encoding: 'utf8', flag: 'r' });
    users = JSON.parse(data);
  } catch (error) {
    console.error('Error reading users file directly:', error);
    return null;
  }

  const user = users.find(user => user.username === username);
  if (!user) {
    return null;
  }

  // TUYỆT ĐỐI không log password/salt/hash — trước đây in mật khẩu thô + full
  // hash + salt mỗi lượt login, mà bot tự đăng nhập mỗi phút nên credential
  // rò liên tục ra docker logs (báo cáo bảo mật 07/08 xác nhận trên máy chủ).
  // Xác minh bằng ĐÚNG số vòng của bản ghi (bản cũ 1000, bản mới 600000).
  const iters = Number(user.iterations) || PBKDF2_LEGACY;
  const hash = await _hashAsync(password, user.salt, iters);
  const stored = Buffer.from(String(user.hash), 'hex');
  const computed = Buffer.from(hash, 'hex');
  const ok = stored.length === computed.length && crypto.timingSafeEqual(stored, computed);
  if (ok) {
    return {
      username: user.username,
      role: user.role || 'user'
    };
  }
  return null;
};

// Thay đổi mật khẩu
// Đọc–kiểm–ghi users.json nằm TRỌN trong withUserLock: không có khoá thì đổi
// mật khẩu song song với thêm/xoá người dùng sẽ ghi đè lẫn nhau.
//
// Hai lần băm (kiểm mật khẩu cũ, sinh mật khẩu mới) đều nằm trong khoá vì lần
// băm sau phụ thuộc kết quả lần trước — đây là đường hiếm khi đi, không phải
// đường nóng như đăng nhập.
export const changePassword = async (username, oldPassword, newPassword) => {
  // KHÔNG log password/độ dài/salt/hash (rò băm + độ dài mật khẩu ra log).
  return withUserLock(async () => {
    const users = getUsers();

    const userIndex = users.findIndex((user) => user.username === username);
    if (userIndex === -1) {
      return false;
    }

    const user = users[userIndex];
    const iters = Number(user.iterations) || PBKDF2_LEGACY;
    const hash = await _hashAsync(oldPassword, user.salt, iters);
    const stored = Buffer.from(String(user.hash), 'hex');
    const computed = Buffer.from(hash, 'hex');
    const ok = stored.length === computed.length && crypto.timingSafeEqual(stored, computed);
    if (!ok) {
      return false; // Mật khẩu cũ không chính xác
    }

    // Cập nhật mật khẩu mới — nâng lên số vòng MẠNH (600000).
    const salt = crypto.randomBytes(16).toString('hex');
    const newHash = await _hashAsync(newPassword, salt, PBKDF2_ITERS);
    users[userIndex].salt = salt;
    users[userIndex].hash = newHash;
    users[userIndex].iterations = PBKDF2_ITERS;

    try {
      writeJsonAtomicSync(userFilePath, users);
      return true;
    } catch (error) {
      console.error('Error writing password change to file:', error);
      return false;
    }
  });
};

/** API key cho HA / gateway (env ZALO_SERVER_API_KEY hoặc CHATGPT2API_AUTH_KEY). */
export const getServerApiKey = () =>
  String(process.env.ZALO_SERVER_API_KEY || process.env.CHATGPT2API_AUTH_KEY || '').trim();

function timingSafeEqualStr(a, b) {
  try {
    const ba = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// CHỈ nhận khoá qua header.
//
// Bản cũ nhận thêm ?api_key=… trên URL. Query string đi vào access log của mọi
// reverse proxy trên đường, vào lịch sử trình duyệt, và vào header Referer khi
// trang tải tài nguyên bên ngoài — tức khoá rò ra ba chỗ mà chủ máy không kiểm
// soát được. Header thì không nằm trong log mặc định của proxy nào.
function extractApiToken(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const x = req.headers['x-api-key'];
  if (x) return String(x).trim();
  return '';
}

// Middleware xác thực cho các route
export const authMiddleware = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    return next();
  }

  // P0#4: Bearer / X-Api-Key khớp env (HA integration không dùng session cookie).
  // API key chỉ có nghĩa cho các route TÍCH HỢP gửi tin. Trước đây nó đi qua
  // middleware chung nên một key cấp cho Home Assistant mở được cả dashboard,
  // lịch sử chat và trang quản lý người dùng — quyền rộng hơn mục đích rất nhiều.
  const expected = getServerApiKey();
  const token = extractApiToken(req);
  if (expected && token && timingSafeEqualStr(token, expected)) {
    if (isApiKeyRoute(req.path)) {
      req.apiKeyAuth = true;
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'ZALO_SERVER_API_KEY chỉ dùng được cho các route GỬI nội dung (tin, ảnh, tệp, video, sticker). '
        + 'Đọc lịch sử chat, tra người dùng, tạo/sửa nhóm, kết bạn và dashboard đều cần đăng nhập tài khoản admin.',
      code: 'API_KEY_OUT_OF_SCOPE',
    });
  }

  // API request: return 401 JSON instead of HTML redirect
  if (req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({
      success: false,
      message: expected
        ? 'Thiếu hoặc sai API key (Authorization: Bearer … / X-Api-Key)'
        : 'Chưa đăng nhập',
      code: 'UNAUTHORIZED',
    });
  }

  // Đòi một TỆP (đường dẫn có phần mở rộng) mà chưa đăng nhập: trả 401, đừng
  // trả trang đăng nhập.
  //
  // Vì sao: trang HTML kèm mã 200 là thứ mọi bộ tải về đều nuốt. Sự cố
  // 24/08/2026: tích hợp HA xin /san_snapshot1.jpg, chỗ này redirect sang
  // /admin-login, add-on lưu 3.918 byte HTML đó thành .jpg rồi đẩy lên Zalo —
  // người nhận thấy một ô đen và không ai thấy lỗi ở đâu cả. Route UI không có
  // phần mở rộng nên luồng đăng nhập bằng trình duyệt không đổi.
  if (/\.[a-z0-9]{2,5}$/i.test(req.path)) {
    return res.status(401).json({
      success: false,
      message: `Tệp ${req.path} cần đăng nhập, hoặc không nằm trong thư mục dùng chung /zalo_bot.`,
      code: 'UNAUTHORIZED',
    });
  }

  // Browser request: redirect.
  //
  // Không cộng tiền tố ingress: config.yaml KHÔNG khai `ingress`, add-on chạy
  // host_network và mở thẳng cổng 3000. Bản cũ có một middleware đọc
  // x-ingress-path kèm ghi chú "tất cả link phải có prefix này", nhưng không
  // view nào dùng tới nó — mọi link và mọi fetch() trong views/ đều là đường
  // tuyệt đối. Giữ lại nửa cơ chế cùng một ghi chú sai chỉ làm người đọc sau
  // này tưởng ingress đã chạy được.
  res.redirect('/admin-login');
};

// Middleware kiểm tra quyền admin
export const adminMiddleware = (req, res, next) => {
  if (req.session && req.session.authenticated && req.session.role === 'admin') {
    return next();
  }

  res.status(403).send('Không có quyền truy cập. Chỉ admin mới có thể thực hiện chức năng này.');
};

/** Route mọi tài khoản đã đăng nhập đều dùng được, không cần vai admin. */
const SELF_SERVICE_ROUTES = [
  '/change-password',
  '/api/change-password',
  '/api/logout',
  '/api/check-auth',
];

/**
 * Cổng vai cho phần dashboard/chat: đã qua authMiddleware rồi, giờ đòi thêm
 * vai 'admin'.
 *
 * Vì sao chặn hẳn thay vì lọc dữ liệu: hệ thống KHÔNG có ACL theo tài khoản
 * Zalo hay theo cuộc trò chuyện. Trước bản này, một tài khoản vai 'user' đăng
 * nhập được là đọc toàn bộ lịch sử chat của mọi tài khoản và gửi tin thay
 * chúng — quyền ngang admin. Khi chưa có ACL thì đóng là lựa chọn đúng; muốn
 * cho 'user' vào chat thì phải làm ACL theo account/conversation trước (và lọc
 * cả dữ liệu broadcast qua WebSocket).
 */
export const dashboardRoleMiddleware = (req, res, next) => {
  if (req.apiKeyAuth) return next();  // route tích hợp, đã kiểm ở authMiddleware
  const p = req.path || '';
  if (SELF_SERVICE_ROUTES.some((r) => p === r)) return next();
  if (req.session && req.session.authenticated && req.session.role === 'admin') {
    return next();
  }
  if (p.startsWith('/api/') || (req.headers.accept || '').includes('application/json')) {
    return res.status(403).json({
      success: false,
      message: 'Tài khoản này không có quyền quản trị.',
      code: 'FORBIDDEN_ROLE',
    });
  }
  return res.status(403).send('Không có quyền truy cập. Chỉ admin mới vào được trang này.');
};

// Lấy toàn bộ danh sách người dùng (chỉ admin mới có quyền)
export const getAllUsers = () => {
  const users = getUsers();
  return users.map(user => ({
    username: user.username,
    role: user.role || 'user'
  }));
};

// Danh sách các route công khai (không cần xác thực)
export const publicRoutes = [
  '/', // Trang chủ hiển thị nút đăng nhập
  '/admin-login', // Trang đăng nhập
  '/session-test', // Trang kiểm tra session
  '/api/login', // API đăng nhập
  '/api/simple-login', // API đăng nhập đơn giản
  '/api/test-login', // API đăng nhập test
  '/api/logout', // API đăng xuất
  '/api/check-auth', // API kiểm tra trạng thái xác thực
  '/api/session-test', // API kiểm tra session
  '/api/health', // Kiểm tra sức khoẻ cho Docker HEALTHCHECK / watchdog
  '/api/account-webhook/', // API webhook có tham số
  '/favicon.ico', // Favicon
  '/ws', // WebSocket
  '/pwa-manifest', // PWA manifest
  '/chat/sw.js', // PWA service worker
  '/chat/icons/*', // PWA icons
  '/chat/css/*', // Chat CSS
  '/chat/js/*', // Chat JS
  // Ảnh dùng chung với Home Assistant: /config/www/zalo_bot, được phơi ở
  // cuối app.js bằng express.static('/zalo_bot'). Tích hợp HA chép ảnh
  // camera vào đây rồi đưa URL cho add-on tự tải về trước khi gửi Zalo,
  // nên đường này PHẢI qua được mà không cần đăng nhập. Thiếu dòng này thì
  // add-on trả HTML trang admin-login thay cho tấm ảnh, và Zalo hiện ô đen.
  // Không lộ thêm gì: chính Home Assistant đã phơi thư mục đó ở /local/zalo_bot.
  '/zalo_bot/*',

  // Legacy: các API Zalo từng public. Khi ZALO_SERVER_API_KEY /
  // CHATGPT2API_AUTH_KEY được set, isPublicRoute sẽ KHÔNG coi chúng public
  // (bắt buộc Bearer/session) — xem SENSITIVE_API_PREFIXES bên dưới.
  '/api/findUser',
  '/api/getUserInfo',
  '/api/sendFriendRequest',
  '/api/sendmessage',
  '/api/createGroup',
  '/api/getGroupInfo',
  '/api/addUserToGroup',
  '/api/removeUserFromGroup',
  '/api/sendImageToUser',
  '/api/sendImagesToUser',
  '/api/sendImageToGroup',
  '/api/sendImagesToGroup',
  '/api/getGroupChatHistoryByAccount'
];

/** API gửi tin / điều khiển — không public khi đã cấu hình API key. */
const SENSITIVE_API_PREFIXES = [
  '/api/findUser',
  '/api/getUserInfo',
  '/api/sendFriendRequest',
  '/api/sendmessage',
  '/api/createGroup',
  '/api/getGroupInfo',
  '/api/addUserToGroup',
  '/api/removeUserFromGroup',
  '/api/sendImageToUser',
  '/api/sendImagesToUser',
  '/api/sendImageToGroup',
  '/api/sendImagesToGroup',
  '/api/getGroupChatHistoryByAccount',
];

/**
 * Route được phép xác thực bằng ZALO_SERVER_API_KEY: **CHỈ GỬI NỘI DUNG**.
 *
 * Chính sách (chủ máy chốt 08/08/2026): key này cấp cho tích hợp gửi thông báo
 * (Home Assistant, script), nên nó chỉ được gửi tin/ảnh/tệp/video/sticker.
 * Mọi thứ khác — đọc lịch sử chat, tra số điện thoại ra người dùng, tạo và sửa
 * nhóm, kết bạn — phải đăng nhập bằng tài khoản admin.
 *
 * Vì sao không dùng lại SENSITIVE_API_PREFIXES như bản trước: danh sách đó trả
 * lời câu hỏi KHÁC — "route nào từng public và nay phải xác thực". Dùng chung
 * khiến key gửi thông báo đọc được `getGroupChatHistoryByAccount` (toàn bộ lịch
 * sử nhóm) và `findUser` (tra số điện thoại), rộng hơn mục đích rất nhiều. Hai
 * danh sách từ đây độc lập.
 *
 * Liệt kê ĐỦ TÊN từng route, gồm cả biến thể `…ByAccount`: tài liệu
 * docs/ZALO_ANH_VA_HOME_ASSISTANT.md hướng dẫn gửi album qua
 * `sendImagesToUserByAccount`, mà khớp theo tiền tố `/api/sendImagesToUser`
 * KHÔNG bắt được tên đó (không phải `/` hay `?` đứng sau).
 *
 * KHÔNG có ở đây, có chủ đích: sendFriendRequest (kết bạn — đổi quan hệ tài
 * khoản), sendReportByAccount (báo cáo vi phạm lên Zalo), và các sự kiện trạng
 * thái sendSeen/sendDelivered/sendTyping (đổi trạng thái đã-đọc của tài khoản
 * thật, không phải gửi nội dung).
 */
const API_KEY_ROUTES = [
  // Tin nhắn chữ
  '/api/sendmessage',
  '/api/sendMessageByAccount',
  // Ảnh đơn
  '/api/sendImageToUser',
  '/api/sendImageToUserByAccount',
  '/api/sendImageToGroup',
  '/api/sendImageToGroupByAccount',
  '/api/sendImageByAccount',
  // Album nhiều ảnh
  '/api/sendImagesToUser',
  '/api/sendImagesToUserByAccount',
  '/api/sendImagesToGroup',
  '/api/sendImagesToGroupByAccount',
  // Tệp / phương tiện khác
  '/api/sendFile',
  '/api/sendFileByAccount',
  '/api/sendVideoByAccount',
  '/api/sendVoiceByAccount',
  '/api/sendStickerByAccount',
  '/api/sendLinkByAccount',
  '/api/sendCardByAccount',
];

/** True nếu path nằm trong phạm vi API key. */
export const isApiKeyRoute = (path) => {
  const p = String(path || '');
  return API_KEY_ROUTES.some(
    (pref) => p === pref || p.startsWith(pref + '/') || p.startsWith(pref + '?')
  );
};

// Kiểm tra xem route có phải là public hay không
export const isPublicRoute = (path) => {
  console.log('Checking if route is public:', path);

  // Kiểm tra các route API công khai
  if (path.startsWith('/api/')) {
    // Xử lý các route có tham số động
    if (path.startsWith('/api/account-webhook/')) {
      console.log('Is account webhook API with parameters:', true);
      return true;
    }

    // P0#4: khi có API key, các route gửi tin không còn public
    const apiKey = getServerApiKey();
    if (apiKey) {
      for (const pref of SENSITIVE_API_PREFIXES) {
        if (path === pref || path.startsWith(pref + '/') || path.startsWith(pref + '?')) {
          console.log('Sensitive API requires key/session:', path);
          return false;
        }
      }
    }

    // Kiểm tra các route cụ thể trong danh sách publicRoutes
    for (const route of publicRoutes) {
      if (route.startsWith('/api/') && (
        path === route || // Trùng khớp chính xác
        (route.endsWith('/') && path.startsWith(route)) // Route kết thúc bằng / và path bắt đầu bằng route
      )) {
        console.log('Is public API route:', true);
        return true;
      }
    }

    console.log('Is public API route:', false);
    return false;
  }

  // Kiểm tra các route UI công khai
  for (const route of publicRoutes) {
    // Bỏ qua các route API
    if (route.startsWith('/api/')) continue;

    // Kiểm tra exact match
    if (path === route) {
      console.log('Is public UI route (exact match):', true);
      return true;
    }

    // Kiểm tra prefix match cho routes như /route/*
    if (route.endsWith('*') && path.startsWith(route.slice(0, -1))) {
      console.log('Is public UI route (prefix match):', true);
      return true;
    }
  }

  console.log('Is public route:', false);
  return false;
};