import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const defaultExecFileAsync = promisify(execFile);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Doc thoi luong video (milliseconds) bang ffprobe ma khong chan event loop Node.
 *
 * Zalo in nhan thoi luong len bong bong video tu con so kem theo tin nhan, chu
 * khong tu do tep. Truoc ban nay khong ai do ca: tich hop Home Assistant khai
 * cung 10000 ms cho MOI video, nen mot doan phim ba phut van hien "0:10".
 *
 * Do o day vi day la noi duy nhat chac chan cam tep that — add-on tai video ve
 * dia truoc khi day len Zalo, ke ca khi nguoi goi chi dua vao mot dia chi URL.
 *
 * Tra null neu ffprobe hong hoac tep khong doc duoc, de caller van gui duoc tin.
 */
export async function readVideoDuration(videoPath, {
  ffprobeBin = process.env.FFPROBE_BIN || 'ffprobe',
  timeoutMs = positiveInteger(process.env.VIDEO_DURATION_TIMEOUT_MS, 15_000),
  execFileAsync = defaultExecFileAsync,
} = {}) {
  try {
    if (!videoPath) return null;
    const { stdout } = await execFileAsync(ffprobeBin, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      videoPath,
    ], { timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });

    const giay = Number.parseFloat(JSON.parse(stdout)?.format?.duration);
    if (!Number.isFinite(giay) || giay <= 0) return null;
    return Math.round(giay * 1000);
  } catch (error) {
    console.warn('[Video] Khong doc duoc thoi luong:', error?.message || error);
    return null;
  }
}
