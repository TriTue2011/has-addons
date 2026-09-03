// Kiem thu cong "tra loi ca tin cua chinh chu" theo tung thread.
//
// Cong nay quyet dinh tin chu tu go co duoc day ra webhook hay khong, nen no
// vua phai MO dung luc vua phai DONG chac. Bo test giu bon tinh chat:
//
//   1. Trung bat ky tu khoa nao trong danh sach thi khop, va bao dung tu khoa
//      nao trung — ben nhan dua vao do de biet lenh danh cho ai ('@ha' cho
//      automation, '@n8n' cho n8n).
//   2. Khong phan biet hoa thuong. Cong gateway ben chatgpt2api tu dau da vay;
//      de lech nhau thi cung mot tu khoa lai xu su khac nhau tuy tang nao quyet.
//   3. Chong lap: cau bot tu sinh khong chua tu khoa nao -> khong khop; thread
//      tat hoac danh sach rong cung khong khop.
//   4. Ban ghi cu { keyword: "@toi" } van doc duoc, khong mat cau hinh khi nang cap.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-selfreply-'));
process.env.DATA_DIRECTORY = dataDirectory;

// Ban ghi dang CU, ghi truoc khi service doc file lan dau.
fs.writeFileSync(
  path.join(dataDirectory, 'self-reply-config.json'),
  JSON.stringify({ 'thread-cu': { enabled: true, keyword: '@toi' } }),
  'utf8',
);

const { selfReplyService, khopTuKhoa, nhanTag, setSelfReply, getAllSelfReply } =
  await import('../services/selfReplyService.js');

test('trung bat ky tu khoa nao cung khop, va bao dung tu khoa do', () => {
  setSelfReply('t1', true, ['@toi', '@ha', '@n8n']);
  assert.equal(khopTuKhoa('t1', '@ha bat den phong khach'), '@ha');
  assert.equal(khopTuKhoa('t1', '@n8n chay quy trinh'), '@n8n');
  assert.equal(khopTuKhoa('t1', 'hoi bot: @toi may gio roi'), '@toi');
});

test('khong phan biet hoa thuong', () => {
  setSelfReply('t2', true, ['@Ô_Xin']);
  assert.equal(khopTuKhoa('t2', '@ô_xin ngoi len de'), '@Ô_Xin');
  assert.equal(khopTuKhoa('t2', '@Ô_XIN gi do'), '@Ô_Xin');
});

test('tu khoa DAI duoc thu truoc, khong bi tu khoa ngan nuot', () => {
  setSelfReply('t3', true, ['@n', '@n8n']);
  assert.equal(khopTuKhoa('t3', '@n8n chay di'), '@n8n');
});

test('chong lap: cau bot tu sinh khong chua tu khoa nao thi khong khop', () => {
  setSelfReply('t4', true, ['@toi']);
  assert.equal(khopTuKhoa('t4', 'Da bat den phong khach cho anh nhe.'), '');
});

test('thread tat, hoac danh sach rong, thi khong bao gio khop', () => {
  setSelfReply('t5', false, ['@toi']);
  assert.equal(khopTuKhoa('t5', '@toi oi'), '');
  setSelfReply('t6', true, []);
  assert.equal(selfReplyService.get('t6').enabled, false);
  assert.equal(khopTuKhoa('t6', '@toi oi'), '');
  assert.equal(khopTuKhoa('thread-chua-cau-hinh', '@toi oi'), '');
});

test('chuoi ngan bang dau phay duoc tach thanh danh sach, bo trung va rong', () => {
  setSelfReply('t7', true, ' @toi , @ha ,, @TOI ');
  assert.deepEqual(selfReplyService.get('t7').keywords, ['@toi', '@ha']);
});

test('ban ghi dang cu { keyword } van doc duoc', () => {
  assert.deepEqual(selfReplyService.get('thread-cu').keywords, ['@toi']);
  assert.equal(khopTuKhoa('thread-cu', '@TOI oi'), '@toi');
  // getAll tra ve dang moi de WebUI khoi phai biet dang cu.
  assert.deepEqual(getAllSelfReply()['thread-cu'],
    { enabled: true, keywords: ['@toi'], name: '', kind: '' });
});

test('luu roi doc lai tu dia van dung', async () => {
  setSelfReply('t8', true, ['@ha']);
  const tren_dia = JSON.parse(
    fs.readFileSync(path.join(dataDirectory, 'self-reply-config.json'), 'utf8'));
  assert.deepEqual(tren_dia.t8, { enabled: true, keywords: ['@ha'] });
});

test('nhan tag cho tin NGUOI KHAC: khong doi thread phai bat', () => {
  // Co bat la chot chong lap, chi can cho tin TU GUI. Tin nguoi khac van duoc
  // day di het, chi can biet trung tag nao de automation re nhanh.
  setSelfReply('t9', false, ['@ha', '@n8n']);
  assert.equal(khopTuKhoa('t9', '@n8n chay di'), '');   // cong: dong
  assert.equal(nhanTag('t9', '@n8n chay di'), '@n8n');  // nhan: van co
});

test('nhan tag: khong trung tu khoa nao thi rong, khong bia', () => {
  setSelfReply('t10', true, ['@ha']);
  assert.equal(nhanTag('t10', 'cho hoi cai nay bao nhieu'), '');
  assert.equal(nhanTag('thread-la', '@ha bat den'), '');
});

test('luu duoc TEN va LOAI de nguoi doc nhan ra thread', () => {
  setSelfReply('t11', true, ['@toi'], 'Nhóm Kinh Bắc', 'group');
  const c = selfReplyService.get('t11');
  assert.equal(c.name, 'Nhóm Kinh Bắc');
  assert.equal(c.kind, 'group');
});

test('luu lai ma bo trong ten thi GIU ten cu, khong xoa', () => {
  // Nguoi dung bam luu vi doi tu khoa; mat luon ten vua dat la buc.
  setSelfReply('t12', true, ['@toi'], 'Chị Lan', 'user');
  setSelfReply('t12', true, ['@toi', '@ha']);
  const c = selfReplyService.get('t12');
  assert.equal(c.name, 'Chị Lan');
  assert.equal(c.kind, 'user');
  assert.deepEqual(c.keywords, ['@toi', '@ha']);
});

test('loai la thu gi khong hieu thi bo qua, khong bia', () => {
  setSelfReply('t13', true, ['@toi'], 'X', 'nhom-la');
  assert.equal(selfReplyService.get('t13').kind, '');
});
