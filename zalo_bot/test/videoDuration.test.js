import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-video-thoiluong-'));
process.env.DATA_DIRECTORY = thuMuc;

const { sendVideoByAccount, zaloAccounts } = await import('../api/zalo/zalo.js');

const MP4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.alloc(64),
]);

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

// ffmpeg gia chi de nhanh anh bia chay tron, khong phai trong tam bai test nay.
function ffmpegGia() {
  const duongDan = path.join(thuMuc, 'ffmpeg-gia.sh');
  fs.writeFileSync(duongDan, '#!/bin/sh\nfor a in "$@"; do out="$a"; done\nprintf anh > "$out"\n');
  fs.chmodSync(duongDan, 0o755);
  return duongDan;
}

// ffprobe gia: in ra dung hinh dang JSON that cua ffprobe -show_format.
function ffprobeGia(ten, noiDung, maThoat = 0) {
  const duongDan = path.join(thuMuc, ten);
  fs.writeFileSync(duongDan, `#!/bin/sh\nprintf '%s' '${noiDung}'\nexit ${maThoat}\n`);
  fs.chmodSync(duongDan, 0o755);
  return duongDan;
}

async function guiThu() {
  const daGui = [];
  zaloAccounts.length = 0;
  zaloAccounts.push({
    ownId: 'tk-test',
    phoneNumber: '0900000000',
    api: {
      uploadAttachment: async ([duongDan]) => (path.extname(duongDan) === '.mp4'
        ? [{ fileType: 'video', fileUrl: 'https://zalo.test/video.mp4' }]
        : [{ fileType: 'image', thumbUrl: 'https://zalo.test/bia.jpg' }]),
      sendVideo: async (options, threadId, type) => {
        daGui.push({ options, threadId, type });
        return { msgId: 'm1' };
      },
    },
  });

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4' });
    res.end(MP4);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/camhd_1.mp4`;
    const res = fakeResponse();
    await sendVideoByAccount({
      body: {
        options: { videoUrl: url },
        threadId: '2749165423519409796',
        type: 0,
        accountSelection: 'tk-test',
      },
    }, res);
    return { res, daGui };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Truoc ban nay khong ai do thoi luong: tich hop Home Assistant khai cung 10000
// ms cho MOI video, nen mot doan phim ba phut van hien nhan "0:10" tren Zalo.
test('thoi luong gui kem tin nhan lay tu ffprobe chu khong phai so co dinh', async () => {
  const cu = { ffmpeg: process.env.FFMPEG_BIN, ffprobe: process.env.FFPROBE_BIN };
  process.env.FFMPEG_BIN = ffmpegGia();
  process.env.FFPROBE_BIN = ffprobeGia('ffprobe-35s.sh', '{"format":{"duration":"35.02"}}');
  try {
    const { res, daGui } = await guiThu();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(daGui.length, 1);
    assert.equal(daGui[0].options.duration, 35020);
  } finally {
    if (cu.ffmpeg === undefined) delete process.env.FFMPEG_BIN; else process.env.FFMPEG_BIN = cu.ffmpeg;
    if (cu.ffprobe === undefined) delete process.env.FFPROBE_BIN; else process.env.FFPROBE_BIN = cu.ffprobe;
  }
});

// Do hong thi gui 0 chu khong bia ra con so nao: mot nhan sai lam nguoi nhan tin
// vao no, con 0 thi Zalo van phat het video (da thu that ngay 25/08/2026).
test('ffprobe hong thi gui 0 chu khong bia ra thoi luong', async () => {
  const cu = { ffmpeg: process.env.FFMPEG_BIN, ffprobe: process.env.FFPROBE_BIN };
  process.env.FFMPEG_BIN = ffmpegGia();
  process.env.FFPROBE_BIN = ffprobeGia('ffprobe-hong.sh', '', 1);
  try {
    const { res, daGui } = await guiThu();
    assert.equal(res.body.success, true);
    assert.equal(daGui[0].options.duration, 0);
  } finally {
    if (cu.ffmpeg === undefined) delete process.env.FFMPEG_BIN; else process.env.FFMPEG_BIN = cu.ffmpeg;
    if (cu.ffprobe === undefined) delete process.env.FFPROBE_BIN; else process.env.FFPROBE_BIN = cu.ffprobe;
  }
});

test.after(() => {
  zaloAccounts.length = 0;
  fs.rmSync(thuMuc, { recursive: true, force: true });
});
