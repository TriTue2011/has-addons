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

test.after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));
