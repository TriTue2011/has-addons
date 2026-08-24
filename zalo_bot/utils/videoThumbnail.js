import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const defaultExecFileAsync = promisify(execFile);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Trich mot frame JPEG bang ffmpeg ma khong chan event loop Node.
 * Tra null neu ffmpeg/video loi de caller van co the gui bang fallback cua Zalo.
 */
export async function createVideoThumbnail(videoPath, {
  ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg',
  timeoutMs = positiveInteger(process.env.VIDEO_THUMBNAIL_TIMEOUT_MS, 30_000),
  tempDir = path.join(os.tmpdir(), 'zalo-bot-video'),
  execFileAsync = defaultExecFileAsync,
} = {}) {
  let thumbnailPath = null;
  try {
    if (!videoPath) return null;
    await fs.promises.mkdir(tempDir, { recursive: true });
    thumbnailPath = path.join(
      tempDir,
      `${Date.now()}-${crypto.randomUUID()}-video-thumb.jpg`,
    );
    const baseArgs = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', "scale=w='min(1280,iw)':h=-2",
      '-q:v', '3',
      thumbnailPath,
    ];
    const options = { timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true };

    try {
      await execFileAsync(ffmpegBin, ['-ss', '0.5', ...baseArgs], options);
    } catch {
      await fs.promises.rm(thumbnailPath, { force: true }).catch(() => {});
      await execFileAsync(ffmpegBin, baseArgs, options);
    }

    const stat = await fs.promises.stat(thumbnailPath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error('ffmpeg khong tao duoc thumbnail hop le');
    }
    return thumbnailPath;
  } catch (error) {
    if (thumbnailPath) {
      await fs.promises.rm(thumbnailPath, { force: true }).catch(() => {});
    }
    console.warn('[Video] Khong tu tao duoc thumbnail:', error?.message || error);
    return null;
  }
}
