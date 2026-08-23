import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createConnectionLimit } from '../services/connectionLimit.js';
import { taiVeVaGuiNhieuAnh } from '../utils/sendImages.js';
import { normalizeZaloIdsInPlace, normalizeZcaNumberId } from '../utils/zaloContract.js';
import { cleanupAfterSettled, OperationTimeoutError, withTimeout } from '../utils/timeout.js';
import { beginReconnectAttempt, invalidateReconnectAttempt } from '../services/reconnectGuard.js';

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-addon-migration-'));
process.env.DATA_DIRECTORY = dataDirectory;
const { getCachedGroupHistory, storeGroupMessage } = await import('../utils/groupHistoryStore.js');

test('reserve slot chan WebSocket upgrade dong thoi vuot gioi han', () => {
  let active = 0;
  const limit = createConnectionLimit(2, () => active);
  assert.equal(limit.tryReserve(), true);
  assert.equal(limit.tryReserve(), true);
  assert.equal(limit.tryReserve(), false);
  active += 2;
  limit.confirm();
  limit.confirm();
  assert.equal(limit.tryReserve(), false);
});

test('album vuot quota so anh bi chan truoc khi tai', async () => {
  process.env.IMAGE_BATCH_MAX_ITEMS = '1';
  let downloads = 0;
  try {
    await assert.rejects(
      taiVeVaGuiNhieuAnh(
        { saveImage: async () => { downloads += 1; return 'never.jpg'; }, removeImage() {} },
        {}, ['one.jpg', 'two.jpg'], 'thread', 0,
      ),
      (error) => error.status === 413,
    );
    assert.equal(downloads, 0);
  } finally {
    delete process.env.IMAGE_BATCH_MAX_ITEMS;
  }
});

test('album chuyen ngan sach byte con lai cho downloader', async () => {
  process.env.IMAGE_BATCH_MAX_BYTES = '3';
  const budgets = [];
  try {
    await assert.rejects(
      taiVeVaGuiNhieuAnh(
        {
          saveImage: async (_url, remainingBytes) => {
            budgets.push(remainingBytes);
            const error = new Error('too large');
            error.code = 'DOWNLOAD_SIZE_LIMIT';
            throw error;
          },
          removeImage() {},
        },
        {}, ['one.jpg'], 'thread', 0,
      ),
      (error) => error.status === 413,
    );
    assert.deepEqual(budgets, [3]);
  } finally {
    delete process.env.IMAGE_BATCH_MAX_BYTES;
  }
});

test('contract giu Zalo ID lon la chuoi nhung doi ID SDK thanh number', () => {
  const body = normalizeZaloIdsInPlace({
    accountSelection: '1234567890123456789',
    pollId: '42',
    itemIds: ['7', '8'],
    stickerAlbum: '22148',
  });
  assert.equal(body.accountSelection, '1234567890123456789');
  assert.equal(body.pollId, 42);
  assert.deepEqual(body.itemIds, [7, 8]);
  assert.equal(body.stickerAlbum, 22148);
  assert.equal(normalizeZcaNumberId('22148', 'sticker.id'), 22148);
  assert.throws(
    () => normalizeZaloIdsInPlace({ threadId: null }),
    /threadId khong duoc de trong/,
  );
  assert.throws(
    () => normalizeZcaNumberId('9007199254740992', 'sticker.id'),
    /so nguyen an toan/,
  );
});

test('history group co fallback persistent va loai message trung', () => {
  const message = {
    threadId: 'group-1', type: 1,
    data: { msgId: 'message-1', uidFrom: 'sender', content: 'xin chao' },
  };
  assert.equal(storeGroupMessage('account-1', message), true);
  assert.equal(storeGroupMessage('account-1', message), true);
  const history = getCachedGroupHistory('account-1', 'group-1', 50);
  assert.equal(history.source, 'local_persistent_cache');
  assert.equal(history.groupMsgs.length, 1);
});

test('history fallback van tra ket qua khi ghi dia that bai', () => {
  const originalAppend = fs.appendFileSync;
  fs.appendFileSync = () => {
    const error = new Error('disk full');
    error.code = 'ENOSPC';
    throw error;
  };
  try {
    const message = {
      threadId: 'group-disk-error', type: 1,
      data: { msgId: 'message-disk-error', uidFrom: 'sender', content: 'xin chao' },
    };
    assert.equal(storeGroupMessage('account-disk-error', message), true);
    const history = getCachedGroupHistory('account-disk-error', 'group-disk-error', 50);
    assert.equal(history.source, 'local_persistent_cache');
    assert.deepEqual(history.groupMsgs, []);
  } finally {
    fs.appendFileSync = originalAppend;
  }
});

test('timeout khong don tai nguyen truoc khi upload ket thuc', async () => {
  let resolveUpload;
  const upload = new Promise((resolve) => { resolveUpload = resolve; });
  let cleaned = 0;
  cleanupAfterSettled(upload, () => { cleaned += 1; });
  await assert.rejects(
    withTimeout(upload, 1, 'upload timeout'),
    (error) => error instanceof OperationTimeoutError,
  );
  assert.equal(cleaned, 0);
  resolveUpload();
  await upload;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cleaned, 1);
});

test('reconnect timeout vo hieu hoa ket qua cua lan dang nhap cu', () => {
  const states = new Map();
  const state = { generation: 0 };
  states.set('account-1', state);
  const isCurrentAttempt = beginReconnectAttempt(states, 'account-1', state);
  assert.equal(isCurrentAttempt(), true);
  invalidateReconnectAttempt(state);
  assert.equal(isCurrentAttempt(), false);
});

test('bam mat khau khong chan event loop', async () => {
  // Dat mat khau admin qua env de authService khoi sinh ngau nhien khi tao
  // users.json trong dataDirectory tam cua bo test nay.
  process.env.ZALO_SERVER_ADMIN_PASSWORD = 'mat-khau-kiem-thu';
  const auth = await import('../services/authService.js');

  // pbkdf2Sync chan toan bo event loop: khong timer nao chay duoc trong luc
  // bam. Do tren may Home Assistant that (Armbian aarch64) la 3.410 ms cho
  // 600.000 vong, va tich hop HACS goi /api/login lien tuc. Test nay giu cho
  // duong dang nhap luon dung ban bat dong bo.
  let nhip = 0;
  const dem = setInterval(() => { nhip += 1; }, 5);
  try {
    const user = await auth.validateUser('admin', 'mat-khau-kiem-thu');
    assert.ok(user, 'dang nhap dung mat khau phai tra ve user');
    assert.equal(user.role, 'admin');
  } finally {
    clearInterval(dem);
  }
  assert.ok(nhip > 0, 'event loop bi chan trong luc bam mat khau');

  assert.equal(await auth.validateUser('admin', 'sai-mat-khau'), null);
});

test('doi mat khau nang so vong len muc manh', async () => {
  const auth = await import('../services/authService.js');
  assert.equal(await auth.addUser('nhanvien', 'mk-cu', 'user'), true);
  assert.equal(await auth.addUser('nhanvien', 'mk-cu', 'user'), false);

  assert.equal(await auth.changePassword('nhanvien', 'sai', 'mk-moi'), false);
  assert.equal(await auth.changePassword('nhanvien', 'mk-cu', 'mk-moi'), true);
  assert.ok(await auth.validateUser('nhanvien', 'mk-moi'));
  assert.equal(await auth.validateUser('nhanvien', 'mk-cu'), null);

  const ban_ghi = JSON.parse(
    fs.readFileSync(path.join(dataDirectory, 'cookies', 'users.json'), 'utf8'),
  ).find((u) => u.username === 'nhanvien');
  assert.equal(ban_ghi.iterations, 600000);
});

test('ban ghi cu 1000 vong van dang nhap duoc', async () => {
  const auth = await import('../services/authService.js');
  const crypto = await import('node:crypto');
  const tep = path.join(dataDirectory, 'cookies', 'users.json');
  const users = JSON.parse(fs.readFileSync(tep, 'utf8'));
  const salt = crypto.randomBytes(16).toString('hex');
  users.push({
    username: 'tai-khoan-cu',
    salt,
    hash: crypto.pbkdf2Sync('mk-cu', salt, 1000, 64, 'sha512').toString('hex'),
    iterations: 1000,
    role: 'user',
  });
  fs.writeFileSync(tep, JSON.stringify(users, null, 2));

  const user = await auth.validateUser('tai-khoan-cu', 'mk-cu');
  assert.ok(user, 'ban ghi 1000 vong phai xac minh bang dung so vong cua no');
  assert.equal(user.role, 'user');
});

test.after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));
