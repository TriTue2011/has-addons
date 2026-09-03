import fs from 'node:fs';
import path from 'node:path';
import { getDataDirectory } from '../config/addon.js';
import { writeFileAtomicSync } from './atomicFile.js';

const DEFAULT_MAX_MESSAGES = 5000;
const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEFAULT_PENDING_MAX = 1000;
const pendingWrites = new Map();
const flushTimers = new Map();
const retryAttempts = new Map();
const droppedRecords = new Map();
const needsCompaction = new Set();

function safePart(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function historyFile(ownId, groupId) {
  const directory = path.join(getDataDirectory(), 'history', 'groups', safePart(ownId));
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, `${safePart(groupId)}.jsonl`);
}

function stringify(value) {
  return JSON.stringify(value, (_key, current) => (
    typeof current === 'bigint' ? current.toString() : current
  ));
}

function cloneSerializable(value) {
  try { return JSON.parse(stringify(value)); } catch {
    return {
      threadId: value?.threadId, type: value?.type, isSelf: value?.isSelf,
      data: value?.data ?? null,
    };
  }
}

function messageKey(message) {
  const data = message?.data || {};
  const messageId = data.msgId ?? data.msgID ?? message?.msgId ?? '';
  const clientId = data.cliMsgId ?? data.cliMsgID ?? message?.cliMsgId ?? '';
  const sender = data.uidFrom ?? data.uid ?? '';
  const timestamp = data.ts ?? data.time ?? message?._storedAt ?? '';
  if (messageId || clientId) return `${messageId}:${clientId}:${sender}`;
  return `${sender}:${timestamp}:${stringify(data.content ?? '')}`;
}

function positiveEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function fileSize(file) {
  try { return fs.statSync(file).size; } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

// Khong doc ca file legacy khong co tran: chi lay phan duoi va bo dong dau
// neu no bi cat giua ban ghi JSONL.
function parseFile(file) {
  if (!fs.existsSync(file)) return [];
  const maxBytes = positiveEnv('GROUP_HISTORY_MAX_FILE_BYTES', DEFAULT_MAX_FILE_BYTES);
  const size = fileSize(file);
  const readBytes = Math.min(size, maxBytes);
  if (readBytes <= 0) return [];
  const descriptor = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(readBytes);
  try { fs.readSync(descriptor, buffer, 0, readBytes, size - readBytes); }
  finally { fs.closeSync(descriptor); }
  let text = buffer.toString('utf8');
  if (size > readBytes) {
    const firstNewline = text.indexOf('\n');
    text = firstNewline === -1 ? '' : text.slice(firstNewline + 1);
  }
  const messages = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { messages.push(JSON.parse(line)); } catch { /* bo record dang do */ }
  }
  return messages;
}

function deduplicate(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    const key = messageKey(message);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compact(file) {
  const maxMessages = positiveEnv('GROUP_HISTORY_MAX_MESSAGES', DEFAULT_MAX_MESSAGES);
  const maxBytes = positiveEnv('GROUP_HISTORY_MAX_FILE_BYTES', DEFAULT_MAX_FILE_BYTES);
  const candidates = deduplicate(parseFile(file)).slice(-maxMessages);
  const kept = [];
  let usedBytes = 0;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const line = `${stringify(candidates[index])}\n`;
    const lineBytes = Buffer.byteLength(line);
    if (lineBytes > maxBytes || usedBytes + lineBytes > maxBytes) break;
    kept.unshift(candidates[index]);
    usedBytes += lineBytes;
  }
  const content = kept.map(stringify).join('\n');
  writeFileAtomicSync(file, content ? `${content}\n` : '');
  return kept;
}

function retryDelay(attempt) {
  return Math.min(100 * (2 ** Math.min(attempt, 8)), 30_000);
}

function queueRecords(file, records) {
  const maxPending = positiveEnv('GROUP_HISTORY_PENDING_MAX', DEFAULT_PENDING_MAX);
  const combined = [...(pendingWrites.get(file) || []), ...records];
  if (combined.length > maxPending) {
    const dropped = combined.length - maxPending;
    droppedRecords.set(file, (droppedRecords.get(file) || 0) + dropped);
    pendingWrites.set(file, combined.slice(-maxPending));
    return;
  }
  pendingWrites.set(file, combined);
}

function scheduleFlush(file, delayMs = 100) {
  if (flushTimers.has(file)) return;
  const timer = setTimeout(() => {
    try { flush(file); } catch (error) {
      console.error(`[History] Khong ghi duoc ${file}: ${error.message}`);
    }
  }, delayMs);
  timer.unref?.();
  flushTimers.set(file, timer);
}

function scheduleRetry(file) {
  const attempt = (retryAttempts.get(file) || 0) + 1;
  retryAttempts.set(file, attempt);
  scheduleFlush(file, retryDelay(attempt));
}

function flush(file) {
  const timer = flushTimers.get(file);
  if (timer) clearTimeout(timer);
  flushTimers.delete(file);
  const records = pendingWrites.get(file);
  if (!records?.length) {
    if (!needsCompaction.has(file)) return;
    try {
      compact(file);
      needsCompaction.delete(file);
      retryAttempts.delete(file);
    } catch (error) {
      scheduleRetry(file);
      throw error;
    }
    return;
  }
  pendingWrites.delete(file);
  try {
    fs.appendFileSync(file, records.join(''), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    queueRecords(file, records);
    scheduleRetry(file);
    throw error;
  }
  try {
    if (fileSize(file) > positiveEnv('GROUP_HISTORY_MAX_FILE_BYTES', DEFAULT_MAX_FILE_BYTES)) {
      compact(file);
    }
    needsCompaction.delete(file);
    retryAttempts.delete(file);
    const dropped = droppedRecords.get(file) || 0;
    if (dropped) {
      console.warn(`[History] Da bo ${dropped} record cu do queue vuot tran.`);
      droppedRecords.delete(file);
    }
  } catch (error) {
    needsCompaction.add(file);
    scheduleRetry(file);
    throw error;
  }
}

export function storeGroupMessage(ownId, message) {
  const groupId = message?.threadId;
  if (!ownId || !groupId) return false;
  try {
    const file = historyFile(ownId, groupId);
    const record = cloneSerializable(message);
    record._accountId = String(ownId);
    record._storedAt = Date.now();
    queueRecords(file, [`${stringify(record)}\n`]);
    scheduleFlush(file);
    return true;
  } catch (error) {
    console.error(`[History] Khong queue duoc group ${groupId}: ${error.message}`);
    return false;
  }
}

export function getCachedGroupHistory(ownId, groupId, count = 50) {
  // Tran 1000 cho khop API: kho giu toi 5000 tin, kep o 200 thi nguoi goi
  // xin 1000 van chi nhan 200 ma khong hieu vi sao.
  const safeCount = Math.min(Math.max(Number.parseInt(count, 10) || 50, 1), 1000);
  try {
    const file = historyFile(ownId, groupId);
    try { flush(file); } catch (error) {
      console.warn(`[History] Khong flush duoc ${file}; tra cache cu: ${error.message}`);
    }
    let parsedMessages = deduplicate(parseFile(file));
    const maxMessages = positiveEnv('GROUP_HISTORY_MAX_MESSAGES', DEFAULT_MAX_MESSAGES);
    const maxBytes = positiveEnv('GROUP_HISTORY_MAX_FILE_BYTES', DEFAULT_MAX_FILE_BYTES);
    try {
      if (parsedMessages.length > maxMessages || fileSize(file) > maxBytes) {
        compact(file);
        parsedMessages = deduplicate(parseFile(file));
      }
    } catch (error) {
      console.warn(`[History] Khong compact duoc ${file}; tra cache cu: ${error.message}`);
      needsCompaction.add(file);
      scheduleRetry(file);
    }
    const allMessages = parsedMessages.slice(-maxMessages);
    const selected = allMessages.slice(-safeCount);
    const latest = selected.at(-1)?.data || {};
    return {
      lastActionId: String(latest.msgId ?? latest.msgID ?? latest.cliMsgId ?? latest.cliMsgID ?? ''),
      lastActionIdOther: '',
      more: allMessages.length > selected.length ? 1 : 0,
      groupMsgs: selected,
      source: 'local_persistent_cache',
      cachedCount: allMessages.length,
    };
  } catch (error) {
    console.warn(`[History] Khong doc duoc cache group ${groupId}: ${error.message}`);
    return {
      lastActionId: '', lastActionIdOther: '', more: 0, groupMsgs: [],
      source: 'local_persistent_cache', cachedCount: 0,
    };
  }
}

export function flushAllGroupHistorySync() {
  const files = new Set([...pendingWrites.keys(), ...needsCompaction]);
  for (const file of files) {
    try { flush(file); } catch (error) {
      console.error(`[History] Khong flush duoc ${file}: ${error.message}`);
    }
  }
}
