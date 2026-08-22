// Hop dong du lieu chung giua Home Assistant, gateway Python va zca-js.
// Zalo ID thuong lon hon Number.MAX_SAFE_INTEGER, vi vay moi ID phai duoc
// giu dang chuoi tu luc JSON duoc parse den khi goi SDK.

const ZALO_ID_KEYS = new Set([
  'threadId', 'threadID', 'groupId', 'userId', 'memberId', 'friendId',
  'ownId', 'uid', 'uidFrom', 'idTo', 'conversationId',
  'msgId', 'cliMsgId', 'globalMsgId', 'ownerId', 'actionId',
  'reminderId', 'topicId', 'photoId', 'accountSelection',
]);

const ZALO_ID_LIST_KEYS = new Set([
  'threadIds', 'groupIds', 'userIds', 'memberIds', 'friendIds', 'msgIds',
  'members',
]);

// zca-js 2.1.2 khai cac ID nay la number/number[]. Van phai tu choi so da
// vuot MAX_SAFE_INTEGER, nhung khong doi sang string lam sai contract SDK.
const ZCA_NUMBER_ID_KEYS = new Set(['pollId', 'itemId']);
const ZCA_NUMBER_ID_OR_LIST_KEYS = new Set(['itemIds', 'stickerAlbum']);

function normalizeId(value, key) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(
        `${key} vuot gioi han so nguyen an toan cua JavaScript; hay gui ID duoi dang chuoi JSON.`,
      );
    }
  } else if (typeof value !== 'string') {
    throw new Error(`${key} phai la chuoi hoac so nguyen an toan.`);
  }
  const text = String(value).trim();
  if (!text) throw new Error(`${key} khong duoc de trong.`);
  return text.toLowerCase().startsWith('zalo:') ? text.slice(5) : text;
}

export function normalizeZcaNumberId(value, key) {
  if (typeof value === 'boolean') throw new Error(`${key} khong phai ID hop le.`);
  const text = String(value).trim();
  const unprefixed = text.toLowerCase().startsWith('zalo:') ? text.slice(5) : text;
  const number = Number(unprefixed);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${key} phai la so nguyen an toan theo contract zca-js.`);
  }
  return number;
}

export function normalizeZaloIdsInPlace(value, key = '') {
  if (value === null || value === undefined) {
    if (ZALO_ID_KEYS.has(key) || ZALO_ID_LIST_KEYS.has(key)
      || ZCA_NUMBER_ID_KEYS.has(key) || ZCA_NUMBER_ID_OR_LIST_KEYS.has(key)) {
      throw new Error(`${key} khong duoc de trong.`);
    }
    return value;
  }

  if (ZALO_ID_KEYS.has(key)) return normalizeId(value, key);
  if (ZCA_NUMBER_ID_KEYS.has(key)) return normalizeZcaNumberId(value, key);

  if (ZALO_ID_LIST_KEYS.has(key)) {
    const list = Array.isArray(value) ? value : [value];
    return list.map((item) => normalizeId(item, key));
  }

  if (ZCA_NUMBER_ID_OR_LIST_KEYS.has(key)) {
    return Array.isArray(value)
      ? value.map((item) => normalizeZcaNumberId(item, key))
      : normalizeZcaNumberId(value, key);
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = normalizeZaloIdsInPlace(value[index]);
    }
    return value;
  }

  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      value[childKey] = normalizeZaloIdsInPlace(childValue, childKey);
    }
  }
  return value;
}
