// Kiem thu co che tu thu hoi tin sau TTL ngan.
//
// Zalo bo qua `ttl` theo tung tin va auto-delete cua no khong co moc nao duoi
// mot ngay, nen "tin tu mat sau 5 phut" phai do chinh bot goi undo. Bo test nay
// giu ba tinh chat de co che do khong hong am tham:
//
//   1. Chi thu hoi khi da co cliMsgId — api.undo doi ca hai, ma phan hoi luc
//      gui chi tra msgId.
//   2. Danh sach cho song qua restart — het gio nam trong RAM, mat dien la tin
//      le ra phai mat se nam lai vinh vien.
//   3. Ban doi ve toi SAU khi het gio van thu hoi ngay, khong doi vong quet.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-expiry-'));
process.env.DATA_DIRECTORY = dataDirectory;

const {
  configureExpiryDependencies,
  scheduleUndo,
  noteSelfMessage,
  napTuDia,
  _trangThai,
  _datLai,
} = await import('../services/messageExpiry.js');

function apiGia() {
  const daGoi = [];
  return {
    daGoi,
    api: {
      undo: async (payload, threadId, type) => {
        daGoi.push({ payload, threadId, type });
        return { status: 0 };
      },
    },
  };
}

function choMotNhip() {
  return new Promise((resolve) => setImmediate(resolve));
}

test.beforeEach(() => {
  _datLai();
  fs.rmSync(path.join(dataDirectory, 'message-expiry.json'), { force: true });
});

test('chua co cliMsgId thi khong thu hoi', async () => {
  const { daGoi, api } = apiGia();
  configureExpiryDependencies({ layApi: () => api });

  // TTL 0ms: het gio ngay lap tuc.
  scheduleUndo({ ownId: 'own-1', msgId: 'm1', threadId: 't1', type: 0, ttlMs: 1 });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(daGoi.length, 0, 'thieu cliMsgId ma van goi undo');
  assert.equal(_trangThai().dangCho.length, 1, 'phai giu lai de cho ban doi ve');
});

test('nhan cliMsgId sau khi het gio thi thu hoi ngay', async () => {
  const { daGoi, api } = apiGia();
  configureExpiryDependencies({ layApi: () => api });

  scheduleUndo({ ownId: 'own-1', msgId: 'm2', threadId: 't2', type: 0, ttlMs: 1 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(daGoi.length, 0);

  noteSelfMessage({ isSelf: true, data: { msgId: 'm2', cliMsgId: 'c2' } });
  await choMotNhip();
  await choMotNhip();

  assert.equal(daGoi.length, 1);
  assert.deepEqual(daGoi[0].payload, { msgId: 'm2', cliMsgId: 'c2' });
  assert.equal(daGoi[0].threadId, 't2');
  assert.equal(_trangThai().dangCho.length, 0, 'thu hoi xong phai don khoi danh sach');
});

test('ban doi ve cua tin KHONG cho thi bo qua', async () => {
  const { daGoi, api } = apiGia();
  configureExpiryDependencies({ layApi: () => api });

  scheduleUndo({ ownId: 'own-1', msgId: 'm3', threadId: 't3', type: 0, ttlMs: 60_000 });
  noteSelfMessage({ isSelf: true, data: { msgId: 'khong-lien-quan', cliMsgId: 'x' } });
  await choMotNhip();

  assert.equal(daGoi.length, 0);
  assert.equal(_trangThai().dangCho[0].cliMsgId, null);
});

test('danh sach cho song qua restart', async () => {
  const { api } = apiGia();
  configureExpiryDependencies({ layApi: () => api });

  scheduleUndo({ ownId: 'own-9', msgId: 'm4', threadId: 't4', type: 1, ttlMs: 60_000 });
  noteSelfMessage({ isSelf: true, data: { msgId: 'm4', cliMsgId: 'c4' } });

  const tep = path.join(dataDirectory, 'message-expiry.json');
  assert.ok(fs.existsSync(tep), 'phai ghi danh sach cho xuong dia');
  const tren_dia = JSON.parse(fs.readFileSync(tep, 'utf8'));
  assert.equal(tren_dia.length, 1);
  assert.equal(tren_dia[0].cliMsgId, 'c4');
  assert.equal(tren_dia[0].type, 1);

  // Gia lap restart: xoa sach bo nho roi nap lai tu dia.
  _datLai();
  const { daGoi: daGoi2, api: api2 } = apiGia();
  configureExpiryDependencies({ layApi: () => api2 });
  napTuDia();

  assert.equal(_trangThai().dangCho.length, 1, 'restart xong phai nap lai');
  assert.equal(_trangThai().dangCho[0].msgId, 'm4');
  assert.equal(daGoi2.length, 0, 'chua het gio thi chua thu hoi');
});

test('restart sau khi da qua han thi thu hoi ngay', async () => {
  const { api } = apiGia();
  configureExpiryDependencies({ layApi: () => api });

  scheduleUndo({ ownId: 'own-9', msgId: 'm5', threadId: 't5', type: 0, ttlMs: 60_000 });
  noteSelfMessage({ isSelf: true, data: { msgId: 'm5', cliMsgId: 'c5' } });

  // Dat han ve qua khu tren dia, roi nap lai — dung canh mat dien luc dang cho.
  const tep = path.join(dataDirectory, 'message-expiry.json');
  const ds = JSON.parse(fs.readFileSync(tep, 'utf8'));
  ds[0].hetHan = Date.now() - 1000;
  fs.writeFileSync(tep, JSON.stringify(ds));

  _datLai();
  const { daGoi: daGoi2, api: api2 } = apiGia();
  configureExpiryDependencies({ layApi: () => api2 });
  napTuDia();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(daGoi2.length, 1, 'qua han ma khong thu hoi khi khoi dong lai');
  assert.deepEqual(daGoi2[0].payload, { msgId: 'm5', cliMsgId: 'c5' });
});

test('ttl bang 0 hoac am thi khong hen gi ca', () => {
  const { api } = apiGia();
  configureExpiryDependencies({ layApi: () => api });

  assert.equal(scheduleUndo({ ownId: 'o', msgId: 'm6', threadId: 't', type: 0, ttlMs: 0 }), null);
  assert.equal(scheduleUndo({ ownId: 'o', msgId: 'm7', threadId: 't', type: 0, ttlMs: -5 }), null);
  assert.equal(_trangThai().dangCho.length, 0);
});

test('tai khoan chua san sang thi giu lai, khong mat tin', async () => {
  configureExpiryDependencies({ layApi: () => null });

  scheduleUndo({ ownId: 'own-mat', msgId: 'm8', threadId: 't8', type: 0, ttlMs: 1 });
  noteSelfMessage({ isSelf: true, data: { msgId: 'm8', cliMsgId: 'c8' } });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(_trangThai().dangCho.length, 1, 'khong co api thi phai giu de thu lai');
});

test.after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));
