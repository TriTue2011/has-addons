// Nơi giữ danh sách client WebSocket và phát tin cho chúng.
//
// Tách khỏi server.js để cắt vòng import: webhookService.js, eventListeners.js
// và routes/ui.js đều cần broadcastMessage, mà trước đây phải lấy từ
// server.js — trong khi chính server.js lại import app.js, và app.js import
// ngược lại webhookService.js. Vòng đó khiến app.js không thể nạp trước
// server.js: thử `import('./app.js')` sẽ ném
// "Cannot access 'app' before initialization", nên không viết được test nào
// dựng app lên rồi gọi thẳng vào route.
//
// Module này không import gì từ server.js hay app.js nên vòng biến mất.

const clients = new Set();

/** Đăng ký một client mới; tự gỡ khi đóng hoặc lỗi. */
export function registerWebSocketClient(ws) {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
}

/** Phát một chuỗi tới mọi client đang mở. */
export function broadcastMessage(message) {
  for (const client of clients) {
    if (client.readyState !== 1) continue; // 1 = OPEN
    try {
      client.send(message);
    } catch (error) {
      console.warn('[WebSocket] Không gửi được tới client:', error.message || error);
      try { client.terminate(); } catch { /* best effort */ }
      clients.delete(client);
    }
  }
}

/** Đóng mọi client — dùng lúc tắt server. */
export function closeAllWebSocketClients() {
  for (const client of clients) {
    try { client.close(1001, 'Server đang tắt'); } catch { /* best effort */ }
  }
  clients.clear();
}

/** Số client đang mở — dùng cho hạn mức kết nối. */
export function getWebSocketClientCount() {
  return clients.size;
}
