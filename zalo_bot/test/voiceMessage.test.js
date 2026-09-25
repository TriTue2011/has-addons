import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Tin thoai: do tren tin ghi am that gui tu app Zalo (25/09/2026) — AAC-LC 16 kHz
// mono ~64 kbps, ADTS, nam tren f*-voice-aac-dl.zdn.vn. TTS gui qua sendFile thi
// nguoi nhan thay TEP dinh kem; doi dinh dang + tai len Zalo + sendVoice thi thanh
// bong bong thoai.

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zalo-voice-'));
process.env.DATA_DIRECTORY = directory;
// ffmpeg gia: ghi tep ra (doi so cuoi) de khoi can ffmpeg that tren may test.
const ffmpegGia = path.join(directory, 'ffmpeg-gia.sh');
fs.writeFileSync(ffmpegGia, '#!/bin/sh\nfor a; do out=$a; done\nprintf aac > "$out"\n');
fs.chmodSync(ffmpegGia, 0o755);
process.env.FFMPEG_BIN = ffmpegGia;

const { sendVoiceByAccount, zaloAccounts } = await import('../api/zalo/zalo.js');
const { isZaloVoiceUrl, toZaloVoiceAac } = await import('../utils/voiceAac.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('nhan ra URL tin thoai cua Zalo', () => {
  assert.equal(isZaloVoiceUrl('https://f2-voice-aac-dl.zdn.vn/78284/08c515e5.aac'), true);
  assert.equal(isZaloVoiceUrl('http://127.0.0.1/images/voice/tts_1.wav'), false);
  assert.equal(isZaloVoiceUrl('https://f21-zfile.zdn.vn/abc.aac'), false);
  assert.equal(isZaloVoiceUrl('khong phai url'), false);
});

test('doi sang DUNG dinh dang tin thoai Zalo (AAC-LC 16 kHz mono 64 kbps ADTS)', async () => {
  let goi = null;
  const ra = await toZaloVoiceAac('/tmp/vao.wav', {
    execFileAsync: async (bin, args) => { goi = { bin, args }; return { stdout: '' }; },
    outDir: directory,
  });
  const a = goi.args.join(' ');
  assert.match(a, /-i \/tmp\/vao\.wav/);
  assert.match(a, /-ac 1 -ar 16000 -c:a aac -b:a 64k -f adts/);
  assert.ok(ra.endsWith('.aac') && goi.args.at(-1) === ra);
});

async function voiGia(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('tep TTS noi bo: tai ve, doi AAC, TAI LEN Zalo roi sendVoice bang URL Zalo', async () => {
  let taiLen = '';
  let guiThoai = null;
  zaloAccounts.push({
    ownId: 'acc', phoneNumber: '0900',
    api: {
      uploadAttachment: async ([file]) => {
        taiLen = file;
        assert.equal(fs.readFileSync(file, 'utf8'), 'aac');
        return [{ fileUrl: 'https://f21-zfile.zdn.vn/xyz.aac' }];
      },
      sendVoice: async (options, threadId, type) => {
        guiThoai = { options, threadId, type };
        return { msgId: 1 };
      },
    },
  });
  const server = await voiGia((_req, res) => res.end('RIFF....WAVE'));
  try {
    const { port } = server.address();
    const res = response();
    await sendVoiceByAccount({ body: {
      options: { voiceUrl: `http://127.0.0.1:${port}/images/voice/tts_1.wav`, ttl: 0 },
      threadId: 'thread-1', type: 'user', accountSelection: 'acc',
    } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.uploaded, true);
    assert.deepEqual(guiThoai.options, { voiceUrl: 'https://f21-zfile.zdn.vn/xyz.aac', ttl: 0 });
    assert.equal(guiThoai.threadId, 'thread-1');
    assert.equal(fs.existsSync(taiLen), false, 'tep AAC tam phai duoc xoa');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    zaloAccounts.length = 0;
  }
});

test('URL da la tin thoai Zalo: gui thang, khong tai lai', async () => {
  let taiLen = false;
  let guiThoai = null;
  zaloAccounts.push({
    ownId: 'acc', phoneNumber: '0900',
    api: {
      uploadAttachment: async () => { taiLen = true; return []; },
      sendVoice: async (options) => { guiThoai = options; return {}; },
    },
  });
  try {
    const res = response();
    const url = 'https://f2-voice-aac-dl.zdn.vn/78284/08c515e5.aac';
    await sendVoiceByAccount({ body: {
      options: { voiceUrl: url }, threadId: 't', type: 'user', accountSelection: 'acc',
    } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(taiLen, false);
    assert.deepEqual(guiThoai, { voiceUrl: url });
  } finally {
    zaloAccounts.length = 0;
  }
});

test('thieu voiceUrl -> 400', async () => {
  const res = response();
  await sendVoiceByAccount({ body: { options: {}, threadId: 't' } }, res);
  assert.equal(res.statusCode, 400);
});

test('Zalo khong tra URL sau khi tai len -> loi ro, khong gui tin rong', async () => {
  let guiThoai = false;
  zaloAccounts.push({
    ownId: 'acc', phoneNumber: '0900',
    api: {
      uploadAttachment: async () => [{}],
      sendVoice: async () => { guiThoai = true; },
    },
  });
  const server = await voiGia((_req, res) => res.end('wav'));
  try {
    const { port } = server.address();
    const res = response();
    await sendVoiceByAccount({ body: {
      options: { voiceUrl: `http://127.0.0.1:${port}/a.wav` }, threadId: 't', type: 'user',
      accountSelection: 'acc',
    } }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(guiThoai, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    zaloAccounts.length = 0;
  }
});

test.after(() => {
  delete process.env.FFMPEG_BIN;
  fs.rmSync(directory, { recursive: true, force: true });
});
