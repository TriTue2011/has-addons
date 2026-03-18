// auth.js - Quản lý xác thực người dùng
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đường dẫn đến file lưu thông tin đăng nhập
const userFilePath = path.join(process.cwd(), 'data', 'cookies', 'users.json');
console.log("Path to users.json:", userFilePath); // Log để debug

// Tạo file users.json nếu chưa tồn tại
const initUserFile = () => {
  try {
    console.log("Khởi tạo file người dùng...");

    // Kiểm tra và tạo thư mục cookies nếu chưa tồn tại
    const cookiesDir = path.join(process.cwd(), 'data', 'cookies');
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

      // Tạo mật khẩu mặc định 'admin' cho người dùng 'admin'
      const defaultPassword = 'admin';
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(defaultPassword, salt, 1000, 64, 'sha512').toString('hex');

      const users = [{
        username: 'admin',
        salt,
        hash,
        role: 'admin' // Thêm quyền admin
      }];

      // Tạo file users.json
      const jsonData = JSON.stringify(users, null, 2);
      console.log("Dữ liệu JSON sẽ được ghi:", jsonData);

      fs.writeFileSync(userFilePath, jsonData);
      console.log('Đã tạo file users.json với tài khoản mặc định: admin/admin');
    } else {
      console.log("File users.json đã tồn tại");
      // Kiểm tra nội dung file
      try {
        const content = fs.readFileSync(userFilePath, 'utf8');
        console.log("Nội dung file users.json:", content.slice(0, 100) + "...");
        JSON.parse(content); // Kiểm tra xem có phải JSON hợp lệ
        console.log("users.json là JSON hợp lệ");
      } catch (readError) {
        console.error("Lỗi khi đọc/phân tích file users.json:", readError);
        // Nếu file không đúng định dạng JSON, tạo lại
        const defaultPassword = 'admin';
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(defaultPassword, salt, 1000, 64, 'sha512').toString('hex');

        const users = [{
          username: 'admin',
          salt,
          hash,
          role: 'admin'
        }];

        fs.writeFileSync(userFilePath, JSON.stringify(users, null, 2));
        console.log('Đã tạo lại file users.json với tài khoản mặc định: admin/admin');
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
    console.log(`Read users.json file, size: ${data.length} bytes`);

    try {
      const users = JSON.parse(data);
      console.log(`Parsed ${users.length} users from file`);

      // Log thông tin về mỗi người dùng (chỉ hiển thị thông tin cơ bản)
      users.forEach((user, index) => {
        console.log(`User ${index + 1}: ${user.username}, role: ${user.role}, ` +
                    `salt: ${user.salt ? user.salt.substring(0, 5) + '...' : 'missing'}, ` +
                    `hash: ${user.hash ? user.hash.substring(0, 5) + '...' : 'missing'}`);
      });

      return users;
    } catch (parseError) {
      console.error('Lỗi khi phân tích JSON từ file users.json:', parseError);
      console.log('Nội dung file gây lỗi:', data);
      return [];
    }
  } catch (error) {
    console.error('Lỗi khi đọc file users.json:', error);
    return [];
  }
};

// Thêm người dùng mới
export const addUser = (username, password, role = 'user') => {
  const users = getUsers();

  // Kiểm tra nếu username đã tồn tại
  if (users.some(user => user.username === username)) {
    return false;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

  users.push({
    username,
    salt,
    hash,
    role
  });

  fs.writeFileSync(userFilePath, JSON.stringify(users, null, 2));
  return true;
};

// Xác thực người dùng và trả về thông tin user
export const validateUser = (username, password) => {
  console.log(`Validating user: ${username}, password length: ${password.length}`);

  // Đọc dữ liệu trực tiếp từ file để đảm bảo dữ liệu mới nhất
  let users = [];
  try {
    const data = fs.readFileSync(userFilePath, { encoding: 'utf8', flag: 'r' });
    users = JSON.parse(data);
    console.log(`Read ${users.length} users directly from file`);
  } catch (error) {
    console.error('Error reading users file directly:', error);
    return null;
  }

  const user = users.find(user => user.username === username);
  console.log(`User found: ${user ? 'YES' : 'NO'}`);

  if (!user) {
    console.log(`User ${username} not found in database`);
    return null;
  }

  console.log(`Found user: ${user.username}, role: ${user.role}`);
  console.log(`User's salt: ${user.salt.substring(0, 10)}...`);
  console.log(`User's hash: ${user.hash.substring(0, 10)}...`);

  console.log(`Password: ${password}`);
  console.log(`Salt: ${user.salt}`);

  const hash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
  console.log(`Generated hash from provided password: ${hash.substring(0, 10)}...`);
  console.log(`User's hash from database: ${user.hash.substring(0, 10)}...`);
  console.log(`Full generated hash: ${hash}`);
  console.log(`Full user's hash: ${user.hash}`);
  console.log(`Hash comparison: ${user.hash === hash ? 'MATCH' : 'NO MATCH'}`);
  console.log(`Hash length comparison: Generated=${hash.length}, Stored=${user.hash.length}`);

  if (user.hash === hash) {
    console.log('Authentication successful');
    return {
      username: user.username,
      role: user.role || 'user'
    };
  }

  console.log('Authentication failed - password mismatch');
  return null;
};

// Thay đổi mật khẩu
export const changePassword = (username, oldPassword, newPassword) => {
  console.log(`Attempting to change password for user: ${username}`);
  console.log(`Old password length: ${oldPassword.length}, New password length: ${newPassword.length}`);

  // Đọc dữ liệu trực tiếp từ file để đảm bảo dữ liệu mới nhất
  let users = [];
  try {
    const data = fs.readFileSync(userFilePath, { encoding: 'utf8', flag: 'r' });
    users = JSON.parse(data);
    console.log(`Read ${users.length} users directly from file for password change`);
  } catch (error) {
    console.error('Error reading users file directly for password change:', error);
    return false;
  }

  const userIndex = users.findIndex(user => user.username === username);
  console.log(`User index in array: ${userIndex}`);

  if (userIndex === -1) {
    console.log(`User ${username} not found in database`);
    return false;
  }

  const user = users[userIndex];
  console.log(`Found user: ${user.username}, role: ${user.role}`);
  console.log(`User's current salt: ${user.salt.substring(0, 10)}...`);
  console.log(`User's current hash: ${user.hash.substring(0, 10)}...`);

  const hash = crypto.pbkdf2Sync(oldPassword, user.salt, 1000, 64, 'sha512').toString('hex');
  console.log(`Generated hash from old password: ${hash.substring(0, 10)}...`);
  console.log(`Hash comparison: ${user.hash === hash ? 'MATCH' : 'NO MATCH'}`);

  if (user.hash !== hash) {
    console.log('Old password verification failed');
    return false; // Mật khẩu cũ không chính xác
  }

  // Cập nhật mật khẩu mới
  const salt = crypto.randomBytes(16).toString('hex');
  console.log(`Generated new salt: ${salt.substring(0, 10)}...`);

  const newHash = crypto.pbkdf2Sync(newPassword, salt, 1000, 64, 'sha512').toString('hex');
  console.log(`Generated new hash: ${newHash.substring(0, 10)}...`);
  console.log(`Full new hash: ${newHash}`);
  console.log(`New hash length: ${newHash.length}`);

  // Lưu trực tiếp vào biến users
  users[userIndex].salt = salt;
  users[userIndex].hash = newHash;

  // In ra để kiểm tra
  console.log(`Updated user object: salt=${users[userIndex].salt.substring(0, 10)}..., hash=${users[userIndex].hash.substring(0, 10)}...`);

  try {
    // Tạo đường dẫn tạm thời để ghi file
    const tempFilePath = path.join(process.cwd(), 'data', 'cookies', 'users.json.tmp');
    console.log(`Using temporary file path: ${tempFilePath}`);

    const jsonData = JSON.stringify(users, null, 2);
    console.log(`Writing to temporary file: ${tempFilePath}`);
    console.log(`JSON data to write (first 100 chars): ${jsonData.substring(0, 100)}...`);

    // Ghi vào file tạm thời trước
    fs.writeFileSync(tempFilePath, jsonData, { encoding: 'utf8', flag: 'w' });
    console.log('Temporary file written successfully');

    // Kiểm tra file tạm thời đã được ghi đúng chưa
    const tempFileContent = fs.readFileSync(tempFilePath, 'utf8');
    console.log(`Temporary file content (first 100 chars): ${tempFileContent.substring(0, 100)}...`);

    // Di chuyển file tạm thời thành file chính thức
    fs.renameSync(tempFilePath, userFilePath);
    console.log(`Renamed temporary file to: ${userFilePath}`);

    // Verify the file was written correctly
    const verifyUsers = getUsers();
    const verifyUser = verifyUsers.find(u => u.username === username);

    if (!verifyUser) {
      console.error('Verification failed - user not found after password change');
      return false;
    }

    console.log(`Verification - New salt: ${verifyUser.salt.substring(0, 10)}...`);
    console.log(`Verification - New hash: ${verifyUser.hash.substring(0, 10)}...`);
    console.log(`Verification - Salt matches: ${verifyUser.salt === salt ? 'YES' : 'NO'}`);
    console.log(`Verification - Hash matches: ${verifyUser.hash === newHash ? 'YES' : 'NO'}`);

    if (verifyUser.salt !== salt || verifyUser.hash !== newHash) {
      console.error('Verification failed - salt or hash mismatch after password change');
      return false;
    }

    console.log('Password change successful and verified');
    return true;
  } catch (error) {
    console.error('Error writing password change to file:', error);
    return false;
  }
};

// Middleware xác thực cho các route
export const authMiddleware = (req, res, next) => {
  // Kiểm tra nếu đã đăng nhập (thông qua session)
  if (req.session && req.session.authenticated) {
    return next();
  }

  // Chuyển hướng về trang đăng nhập
  res.redirect('/admin-login');
};

// Middleware kiểm tra quyền admin
export const adminMiddleware = (req, res, next) => {
  if (req.session && req.session.authenticated && req.session.role === 'admin') {
    return next();
  }

  res.status(403).send('Không có quyền truy cập. Chỉ admin mới có thể thực hiện chức năng này.');
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
  '/api/test-json', // API test JSON
  '/api/account-webhook/', // API webhook có tham số
  '/api/debug-users-file', // API debug file users.json
  '/api/reset-admin-password', // API reset mật khẩu admin
  '/reset-password', // Trang reset mật khẩu admin
  '/favicon.ico', // Favicon
  '/ws', // WebSocket

  // Thêm các API Zalo không cần xác thực
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
  '/api/sendImagesToGroup'
];

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