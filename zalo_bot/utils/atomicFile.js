import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function writeFileAtomicSync(filePath, content, encoding = 'utf8') {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, content, { encoding, mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      try { fs.unlinkSync(temporaryPath); } catch { /* best effort */ }
    }
  }
}

export function writeJsonAtomicSync(filePath, value, spaces = 2) {
  writeFileAtomicSync(filePath, `${JSON.stringify(value, null, spaces)}\n`);
}
