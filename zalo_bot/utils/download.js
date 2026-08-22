import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fetch from 'node-fetch';

function safeFilename(value, fallback = 'download.bin') {
  const basename = path.basename(String(value || fallback))
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .slice(0, 180);
  return basename && basename !== '.' && basename !== '..' ? basename : fallback;
}

function filenameFromResponse(url, response) {
  const disposition = response.headers.get('content-disposition') || '';
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
  let raw = utf8Match?.[1] || plainMatch?.[1] || '';
  if (utf8Match?.[1]) {
    try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
  }
  if (!raw) raw = path.basename(new URL(url).pathname);
  let safe = safeFilename(raw);
  if (!path.extname(safe)) {
    const contentType = String(response.headers.get('content-type') || '')
      .split(';', 1)[0].trim().toLowerCase();
    const extensions = {
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
      'image/webp': '.webp', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
    };
    safe += extensions[contentType] || '.bin';
  }
  return safe;
}

function limitError(maxBytes) {
  const error = new Error(`Tep vuot qua gioi han ${maxBytes} bytes`);
  error.code = 'DOWNLOAD_SIZE_LIMIT';
  return error;
}

function sizeLimiter(maxBytes) {
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) return callback(limitError(maxBytes));
      return callback(null, chunk);
    },
  });
}

export async function downloadToTemp(url, {
  maxBytes,
  timeoutMs = 30_000,
  tempDir = path.join(os.tmpdir(), 'zalo-bot-downloads'),
  filename,
} = {}) {
  const parsed = new URL(String(url));
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Chi cho phep tai media qua HTTP/HTTPS');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('maxBytes phai la so nguyen duong');
  }
  let temporaryPath = null;
  try {
    const response = await fetch(parsed, {
      redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Tai media that bai: HTTP ${response.status} ${response.statusText}`);
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      response.body?.destroy?.();
      throw limitError(maxBytes);
    }
    if (!response.body) throw new Error('Phan hoi tai media khong co body');
    await fs.promises.mkdir(tempDir, { recursive: true });
    temporaryPath = path.join(
      tempDir,
      `${Date.now()}-${crypto.randomUUID()}-${safeFilename(filename || filenameFromResponse(parsed, response))}`,
    );
    await pipeline(response.body, sizeLimiter(maxBytes), fs.createWriteStream(temporaryPath, { mode: 0o600 }));
    return temporaryPath;
  } catch (error) {
    if (temporaryPath) await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}
