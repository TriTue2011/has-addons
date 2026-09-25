import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const defaultExecFileAsync = promisify(execFile);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Doi mot tep am thanh bat ky sang DUNG dinh dang tin thoai cua Zalo.
 *
 * Do tren tin ghi am that gui tu app Zalo (25/09/2026): AAC-LC, 16 kHz, 1 kenh,
 * ~64 kbps, dong goi ADTS (tep .aac tho, khong boc m4a), nam tren
 * f*-voice-aac-dl.zdn.vn. Gui WAV cua TTS qua sendFile thi nguoi nhan thay mot
 * TEP dinh kem; doi ve dinh dang nay roi sendVoice thi thanh bong bong thoai.
 *
 * Tra duong dan tep .aac vua tao trong thu muc tam; caller tu xoa.
 */
export async function toZaloVoiceAac(inputPath, {
  ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg',
  timeoutMs = positiveInteger(process.env.VOICE_CONVERT_TIMEOUT_MS, 60_000),
  execFileAsync = defaultExecFileAsync,
  outDir = os.tmpdir(),
} = {}) {
  if (!inputPath) throw new Error('Thieu tep am thanh nguon');
  const outPath = path.join(outDir, `voice-${crypto.randomUUID()}.aac`);
  await execFileAsync(ffmpegBin, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', inputPath,
    '-vn', '-ac', '1', '-ar', '16000',
    '-c:a', 'aac', '-b:a', '64k',
    '-f', 'adts', outPath,
  ], { timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });
  return outPath;
}

/** URL da la tin thoai tren may chu thoai cua Zalo — gui thang, khong tai lai. */
export function isZaloVoiceUrl(url) {
  try {
    const host = new URL(String(url)).hostname.toLowerCase();
    return host.endsWith('.zdn.vn') && host.includes('voice');
  } catch {
    return false;
  }
}
