// Tự thu hồi tin nhắn sau một khoảng thời gian ngắn.
//
// VÌ SAO PHẢI TỰ LÀM
//
// Zalo có hai cơ chế tự xoá, và không cơ chế nào cho khoảng ngắn:
//
//   1. `ttl` theo TỪNG TIN — zca-js có gửi lên (sendMessage.js dòng 197/204)
//      nhưng Zalo BỎ QUA. Đo thật ngày 23/08/2026 trên tài khoản đang chạy:
//      gửi năm mốc (1 phút, 5 phút, 1 giờ, 1 ngày, 7 ngày) qua cả đường chữ lẫn
//      đường ảnh — không tin nào tự xoá, không tin nào hiện biểu tượng đồng hồ.
//   2. Auto-delete cho CẢ cuộc trò chuyện (`updateAutoDeleteChat`) — có hiệu
//      lực thật, nhưng enum `ChatTTL` của Zalo chỉ có 0 / 1 ngày / 7 ngày /
//      14 ngày. Không có gì dưới một ngày.
//
// Nên muốn "tin tự mất sau 5 phút" thì chỉ còn đường: bot tự gọi `api.undo`.
//
// ĐÁNH ĐỔI ĐÃ ĐƯỢC CHẤP NHẬN
//
// Thu hồi KHÔNG giống tin tự huỷ: Zalo để lại dòng "Tin nhắn đã được thu hồi".
// Nội dung mất, nhưng người nhận biết có một tin đã bị rút. Chủ máy đã chấp
// nhận điều này.
//
// VÌ SAO CẦN `cliMsgId` VÀ VÌ SAO PHẢI CHỜ
//
// `api.undo` đòi cả `msgId` lẫn `cliMsgId`, mà phản hồi lúc gửi chỉ trả `msgId`
// (kiểu `SendMessageResult` của zca-js chỉ có đúng trường đó). `cliMsgId` do
// zca-js sinh trong lòng nó bằng `Date.now()` rồi không trả ra. Đường duy nhất
// lấy được là bản dội về qua listener khi `selfListen` bật — thường tới sau vài
// giây. Vì thế TTL dưới khoảng 10 giây sẽ không kịp; module ghi log rõ khi gặp.
//
// VÌ SAO GHI XUỐNG ĐĨA
//
// Hẹn giờ nằm trong RAM. Container restart giữa chừng — mất điện, cập nhật
// add-on — thì tin lẽ ra phải mất sẽ nằm lại VĨNH VIỄN, và không ai biết. Ghi
// danh sách chờ xuống đĩa rồi nạp lại lúc khởi động là phần bắt buộc, không
// phải phần tối ưu.

import fs from 'node:fs';
import path from 'node:path';

import { getDataFilePath } from '../config/addon.js';
import { writeJsonAtomicSync } from '../utils/atomicFile.js';

// TTL ngắn hơn mức này gần như chắc chắn không kịp nhận `cliMsgId`.
const TTL_TOI_THIEU_MS = 5_000;

// Quét lại định kỳ để bắt các mục quá hạn mà hẹn giờ đã mất (sau restart).
const CHU_KY_QUET_MS = 60_000;

// Không giữ mục treo mãi: quá hạn lâu mà vẫn chưa lấy được `cliMsgId` thì bỏ.
const HAN_TREO_MS = 24 * 60 * 60 * 1000;

/** ownId -> api. Đăng ký từ zalo.js để module này không phải import ngược. */
let timApi = null;

/** msgId -> { ownId, msgId, cliMsgId, threadId, type, hetHan } */
const dangCho = new Map();
const henGio = new Map();

let daNap = false;
let timerQuet = null;

function duongDan() {
  return getDataFilePath('message-expiry.json');
}

function ghiXuongDia() {
  try {
    writeJsonAtomicSync(duongDan(), [...dangCho.values()]);
  } catch (error) {
    console.warn('[TTL] Không ghi được danh sách chờ thu hồi:', error.message || error);
  }
}

/**
 * Đăng ký cách tra `api` theo ownId.
 *
 * Tách ra thay vì import thẳng zaloAccounts để không tạo vòng import
 * zalo.js -> messageExpiry.js -> zalo.js.
 */
export function configureExpiryDependencies({ layApi }) {
  if (typeof layApi !== 'function') {
    throw new Error('configureExpiryDependencies can mot ham layApi');
  }
  timApi = layApi;
}

function huyHenGio(msgId) {
  const t = henGio.get(msgId);
  if (t) clearTimeout(t);
  henGio.delete(msgId);
}

function xoaMuc(msgId) {
  huyHenGio(msgId);
  dangCho.delete(msgId);
  ghiXuongDia();
}

async function thuHoi(msgId) {
  const muc = dangCho.get(msgId);
  if (!muc) return;

  if (!muc.cliMsgId) {
    // Chưa nhận được bản dội về. Giữ lại để vòng quét thử tiếp, trừ khi đã treo
    // quá lâu — lúc đó có giữ nữa cũng vô ích.
    if (Date.now() - muc.hetHan > HAN_TREO_MS) {
      console.warn(
        `[TTL] Bỏ tin ${msgId}: quá ${Math.round(HAN_TREO_MS / 3600000)} giờ vẫn chưa có cliMsgId, không thu hồi được.`,
      );
      xoaMuc(msgId);
    }
    return;
  }

  const api = timApi ? timApi(muc.ownId) : null;
  if (!api) {
    console.warn(`[TTL] Tài khoản ${muc.ownId} chưa sẵn sàng; hoãn thu hồi tin ${msgId}.`);
    return;
  }

  try {
    await api.undo(
      { msgId: muc.msgId, cliMsgId: muc.cliMsgId },
      String(muc.threadId),
      muc.type,
    );
    console.log(`[TTL] Đã thu hồi tin ${msgId} trong thread ${muc.threadId}.`);
    xoaMuc(msgId);
  } catch (error) {
    console.warn(`[TTL] Thu hồi tin ${msgId} lỗi: ${error.message || error}. Sẽ thử lại ở vòng quét sau.`);
  }
}

function datHenGio(muc) {
  huyHenGio(muc.msgId);
  const conLai = Math.max(0, muc.hetHan - Date.now());
  const t = setTimeout(() => { void thuHoi(muc.msgId); }, conLai);
  t.unref?.();
  henGio.set(muc.msgId, t);
}

/**
 * Hẹn thu hồi một tin vừa gửi.
 *
 * Trả về mô tả để route báo lại cho người gọi, hoặc null nếu ttl không yêu cầu
 * tự xoá (0 / null).
 */
export function scheduleUndo({ ownId, msgId, threadId, type, ttlMs }) {
  napTuDia();
  if (!msgId || !threadId || !Number.isFinite(ttlMs) || ttlMs <= 0) return null;

  const key = String(msgId);
  const muc = {
    ownId: String(ownId),
    msgId: key,
    cliMsgId: null,
    threadId: String(threadId),
    type: Number(type) || 0,
    hetHan: Date.now() + ttlMs,
  };
  dangCho.set(key, muc);
  datHenGio(muc);
  ghiXuongDia();

  return {
    requested: ttlMs,
    applied: true,
    scope: 'auto-undo',
    expiresAt: new Date(muc.hetHan).toISOString(),
    note: ttlMs < TTL_TOI_THIEU_MS
      ? 'TTL quá ngắn: có thể chưa kịp nhận cliMsgId để thu hồi.'
      : 'Bot sẽ tự thu hồi tin khi hết giờ. Zalo để lại dòng "Tin nhắn đã được thu hồi".',
  };
}

/**
 * Nhận `cliMsgId` từ bản dội về của listener (selfListen).
 *
 * Gọi cho MỌI tin tự gửi; hàm tự bỏ qua tin không nằm trong danh sách chờ.
 */
export function noteSelfMessage(msg) {
  if (dangCho.size === 0) return;
  const msgId = msg?.data?.msgId ?? msg?.msgId;
  const cliMsgId = msg?.data?.cliMsgId ?? msg?.cliMsgId;
  if (!msgId || !cliMsgId) return;

  const muc = dangCho.get(String(msgId));
  if (!muc || muc.cliMsgId) return;

  muc.cliMsgId = String(cliMsgId);
  ghiXuongDia();

  // Bản dội có thể tới SAU khi đã hết giờ (TTL ngắn, hoặc listener chậm) —
  // lúc đó thu hồi ngay thay vì đợi vòng quét.
  if (muc.hetHan <= Date.now()) void thuHoi(muc.msgId);
}

/** Vòng quét bắt các mục quá hạn mà hẹn giờ đã mất sau restart. */
function batDauQuet() {
  if (timerQuet) return;
  timerQuet = setInterval(() => {
    const now = Date.now();
    for (const muc of [...dangCho.values()]) {
      if (muc.hetHan <= now) void thuHoi(muc.msgId);
    }
  }, CHU_KY_QUET_MS);
  timerQuet.unref?.();
}

/** Nạp danh sách chờ từ đĩa. Gọi nhiều lần cũng chỉ chạy một lần. */
export function napTuDia() {
  if (daNap) return;
  daNap = true;
  try {
    const tep = duongDan();
    if (fs.existsSync(tep)) {
      const ds = JSON.parse(fs.readFileSync(tep, 'utf8'));
      if (Array.isArray(ds)) {
        for (const muc of ds) {
          if (!muc?.msgId) continue;
          dangCho.set(String(muc.msgId), {
            ownId: String(muc.ownId || ''),
            msgId: String(muc.msgId),
            cliMsgId: muc.cliMsgId ? String(muc.cliMsgId) : null,
            threadId: String(muc.threadId || ''),
            type: Number(muc.type) || 0,
            hetHan: Number(muc.hetHan) || 0,
          });
        }
        if (dangCho.size) {
          console.log(`[TTL] Nạp lại ${dangCho.size} tin đang chờ thu hồi.`);
        }
      }
    }
  } catch (error) {
    console.warn('[TTL] Không đọc được danh sách chờ thu hồi:', error.message || error);
  }
  for (const muc of dangCho.values()) datHenGio(muc);
  batDauQuet();
}

/** Chỉ dùng cho kiểm thử. */
export function _trangThai() {
  return { dangCho: [...dangCho.values()], daNap };
}

/** Chỉ dùng cho kiểm thử: xoá sạch trạng thái trong bộ nhớ. */
export function _datLai() {
  for (const msgId of henGio.keys()) huyHenGio(msgId);
  dangCho.clear();
  daNap = false;
  if (timerQuet) { clearInterval(timerQuet); timerQuet = null; }
}
