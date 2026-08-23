// server.js
import http from 'http';
import { WebSocketServer } from 'ws';
import app, { sessionMiddleware } from './app.js';
import { getDataDirectory } from './config/addon.js';
import { createConnectionLimit } from './services/connectionLimit.js';
import {
  broadcastMessage,
  closeAllWebSocketClients,
  getWebSocketClientCount,
  registerWebSocketClient,
} from './services/websocketHub.js';
import { flushAllGroupHistorySync } from './utils/groupHistoryStore.js';

const PORT = process.env.PORT || 3000;
const dataDir = getDataDirectory();

console.log(`=========================================`);
console.log(`Khởi động server với thông số:`);
console.log(`- Port: ${PORT}`);
console.log(`- Thư mục dữ liệu: ${dataDir}`);
console.log(`- Webhook URLs: ${process.env.MESSAGE_WEBHOOK_URL || 'không cấu hình'}`);
console.log(`=========================================`);

// Tạo HTTP server
const server = http.createServer(app);

// WebSocket: KHÔNG gắn thẳng vào server (trước đây `new WebSocketServer({server})`
// nhận MỌI kết nối ở mọi path, KHÔNG qua Express auth, rồi broadcast toàn bộ
// tin nhắn Zalo cho bất kỳ ai — báo cáo bảo mật 07/08). Nay dùng noServer +
// tự xử lý 'upgrade': chỉ path /ws, kiểm Origin same-host, XÁC THỰC session
// (cùng middleware với HTTP), giới hạn số kết nối.
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 }); // trần 1MB/khung
const _WS_MAX = 50;

// Origin allowlist: khai ZALO_WS_ALLOWED_ORIGINS (phẩy) = danh sách origin
// HTTPS cụ thể (khuyến nghị khi chạy sau tunnel). Chưa khai → fallback same-host
// (LAN dev). "Không dựa vào so sánh host đơn thuần" khi đã có allowlist.
const _WS_ORIGINS = String(process.env.ZALO_WS_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// Danh sách client nằm trong services/websocketHub.js — xem ghi chú ở đó về
// vòng import cũ.
const wsConnectionLimit = createConnectionLimit(_WS_MAX, getWebSocketClientCount);

function _originOk(req) {
  const origin = req.headers.origin;
  if (_WS_ORIGINS.length) {
    // Có allowlist → BẮT BUỘC Origin khớp chính xác một origin đã khai.
    return !!origin && _WS_ORIGINS.includes(origin);
  }
  // Chưa khai allowlist: không có Origin (client không phải trình duyệt) cho
  // qua; có thì phải khớp Host (chống cross-site cơ bản). Vẫn cần session admin.
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

server.on('upgrade', (req, socket, head) => {
  const path = (req.url || '').split('?')[0];
  // endsWith thay vì ==: HA addon ingress thêm prefix (<ingress>/ws), client
  // (websocket.js) nối `${INGRESS_PATH}/ws`.
  if (!path.endsWith('/ws')) {
    socket.destroy();
    return;
  }
  if (!_originOk(req)) {
    console.warn('WS upgrade từ chối: Origin lạ');
    socket.destroy();
    return;
  }
  if (!wsConnectionLimit.tryReserve()) {
    console.warn('WS upgrade từ chối: quá số kết nối tối đa');
    socket.destroy();
    return;
  }
  let reservationActive = true;
  const releaseReservation = () => {
    if (!reservationActive) return;
    reservationActive = false;
    wsConnectionLimit.release();
  };
  socket.once('close', releaseReservation);
  // Chạy session middleware để nạp req.session từ cookie, rồi kiểm authenticated.
  // res giả (no-op): middleware chỉ ĐỌC session ở đây; rolling cookie có thể
  // gọi setHeader/end nên phải có stub kẻo ném lỗi.
  const fakeRes = { setHeader() {}, getHeader() {}, removeHeader() {}, end() {}, writeHead() {}, on() {} };
  sessionMiddleware(req, fakeRes, (error) => {
    if (error) {
      releaseReservation();
      socket.destroy();
      return;
    }
    // WS phát TOÀN BỘ tin nhắn Zalo → chỉ ADMIN. User thường (nếu có) không
    // được nghe chung. Muốn cho user xem Zalo phải thiết kế ACL theo
    // tài khoản/thread, không broadcast chung.
    if (!req.session || !req.session.authenticated || req.session.role !== 'admin') {
      releaseReservation();
      console.warn('WS upgrade từ chối: cần đăng nhập admin');
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    try {
      wss.handleUpgrade(req, socket, head, (ws) => {
        socket.off('close', releaseReservation);
        ws._zaloConnectionReserved = true;
        wss.emit('connection', ws, req);
      });
    } catch (upgradeError) {
      releaseReservation();
      console.warn(`[WebSocket] Upgrade failed: ${upgradeError.message}`);
      socket.destroy();
    }
  });
});

// Xử lý kết nối WebSocket (đã xác thực ở bước upgrade)
wss.on('connection', (ws) => {
  if (ws._zaloConnectionReserved) {
    delete ws._zaloConnectionReserved;
    wsConnectionLimit.confirm();
  }
  registerWebSocketClient(ws);
});

// Giữ lại đường xuất cũ để các module khác không phải đổi.
export { broadcastMessage };

// Sử dụng HTTP server thay vì app để hỗ trợ WebSocket
server.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

// Xử lý tín hiệu tắt server một cách an toàn.
//
// Kho lịch sử nhóm gom tin vào bộ đệm rồi mới ghi theo lô có hẹn giờ, nên phải
// ghi nốt phần chưa ghi TRƯỚC khi thoát. Bản cũ export
// flushAllGroupHistorySync nhưng không chỗ nào gọi, nên mỗi lần dừng hay cập
// nhật add-on là mất phần tin nhắn nhóm còn nằm trong bộ đệm.
//
// Hai handler cũ tách riêng và SIGINT còn thiếu cả hẹn giờ ép thoát; gộp làm
// một để hai đường tắt hành xử giống nhau.
let dangTat = false;

function tatServer(tinHieu) {
  if (dangTat) return;
  dangTat = true;
  console.log(`Nhận tín hiệu ${tinHieu}. Đang dọn dẹp...`);

  try {
    flushAllGroupHistorySync();
  } catch (error) {
    console.error('Lỗi khi ghi nốt lịch sử nhóm:', error.message || error);
  }

  closeAllWebSocketClients();

  // Hẹn giờ ép thoát cho CẢ hai tín hiệu: server.close() chờ mọi kết nối đang
  // mở đóng lại, mà WebSocket thì không tự đóng.
  const epThoat = setTimeout(() => {
    console.error('Tắt server bị buộc do quá thời gian chờ.');
    process.exit(1);
  }, 10000);
  epThoat.unref?.();

  server.close(() => {
    clearTimeout(epThoat);
    console.log('Server HTTP đã đóng.');
    process.exit(0);
  });
}

process.once('SIGTERM', () => tatServer('SIGTERM (container đang dừng)'));
process.once('SIGINT', () => tatServer('SIGINT (Ctrl+C)'));
