// server.js
import http from 'http';
import { WebSocketServer } from 'ws';
import app from './app.js';
import { getDataDirectory } from './config/addon.js';

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

// Tạo WebSocket server
const wss = new WebSocketServer({ server });

// Lưu trữ kết nối WebSocket
export const webSocketClients = new Set();

// Xử lý kết nối WebSocket
wss.on('connection', (ws) => {
  console.log('Có một kết nối WebSocket mới');
  webSocketClients.add(ws);
  
  ws.on('close', () => {
    console.log('Kết nối WebSocket đã đóng');
    webSocketClients.delete(ws);
  });
});

// Hàm gửi thông báo đến tất cả client WebSocket
export function broadcastMessage(message) {
  webSocketClients.forEach((client) => {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(message);
    }
  });
}

// Sử dụng HTTP server thay vì app để hỗ trợ WebSocket
server.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});

// Xử lý tín hiệu tắt server một cách an toàn
process.on('SIGTERM', () => {
  console.log('Nhận tín hiệu SIGTERM (container đang dừng). Đang dọn dẹp...');
  
  // Đóng server một cách an toàn
  server.close(() => {
    console.log('Server HTTP đã đóng.');
    process.exit(0);
  });
  
  // Đảm bảo tắt sau 10 giây nếu đóng server bị treo
  setTimeout(() => {
    console.error('Tắt server bị buộc do quá thời gian chờ.');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('Nhận tín hiệu SIGINT (Ctrl+C). Đang dọn dẹp...');
  
  server.close(() => {
    console.log('Server HTTP đã đóng.');
    process.exit(0);
  });
});
