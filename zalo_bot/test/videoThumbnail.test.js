import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-video-bia-'));
process.env.DATA_DIRECTORY = thuMuc;

const { sendVideoByAccount, zaloAccounts } = await import('../api/zalo/zalo.js');

// Header ISO BMFF toi thieu de saveVideoFromUrl nhan ra day dung la MP4.
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

// ffmpeg gia ghi vai byte ra doi so cuoi (duong dan anh bia). Du de
// createVideoThumbnail coi la thanh cong, va may dev khong phai co ffmpeg that.
function ffmpegGia() {
  const duongDan = path.join(thuMuc, 'ffmpeg-gia.sh');
  fs.writeFileSync(duongDan, '#!/bin/sh\nfor a in "$@"; do out="$a"; done\nprintf anh > "$out"\n');
  fs.chmodSync(duongDan, 0o755);
  return duongDan;
}

// Hoi quy cho su co 24/08/2026: tich hop Home Assistant mac dinh lay CHINH dia
// chi video lam anh bia khi automation khong khai thumbnail_url. saveImage soi
// magic bytes, thay MP4 nen vut di — va truoc ban va nay add-on gui tin voi o
// bia RONG, Zalo tra "Tham so khong hop le" nen moi lan gui video tu tep cuc bo
// deu hong. Nay phai tu trich mot khung hinh lam bia.
test('anh bia tro vao chinh tep video thi add-on tu trich khung hinh', async () => {
  const ffmpegCu = process.env.FFMPEG_BIN;
  process.env.FFMPEG_BIN = ffmpegGia();
  const daTaiLen = [];
  const daGui = [];
  zaloAccounts.push({
    ownId: 'tk-test',
    phoneNumber: '0900000000',
    api: {
      uploadAttachment: async ([duongDan]) => {
        daTaiLen.push(duongDan);
        return path.extname(duongDan) === '.mp4'
          ? [{ fileType: 'video', fileUrl: 'https://zalo.test/video.mp4' }]
          : [{ fileType: 'image', thumbUrl: 'https://zalo.test/bia.jpg' }];
      },
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
        options: { videoUrl: url, thumbnailUrl: url },
        threadId: '2749165423519409796',
        type: 1,
        accountSelection: 'tk-test',
      },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    // 'auto' = bia do add-on tu trich, khong phai bia nguoi dung dua vao.
    assert.equal(res.body.thumbnailSource, 'auto');
    assert.equal(daTaiLen.length, 2);
    assert.match(path.basename(daTaiLen[1]), /video-thumb\.jpg$/);
    assert.equal(daGui.length, 1);
    assert.equal(daGui[0].options.videoUrl, 'https://zalo.test/video.mp4');
    assert.equal(daGui[0].options.thumbnailUrl, 'https://zalo.test/bia.jpg');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (ffmpegCu === undefined) delete process.env.FFMPEG_BIN;
    else process.env.FFMPEG_BIN = ffmpegCu;
  }
});

test.after(() => {
  zaloAccounts.length = 0;
  fs.rmSync(thuMuc, { recursive: true, force: true });
});
