const RECONNECT_DELAYS_MS = Object.freeze([
  5_000, 15_000, 30_000, 60_000, 120_000, 300_000,
]);

export function reconnectDelay(attempt) {
  const index = Math.max(0, Number.parseInt(String(attempt || 0), 10) || 0);
  return RECONNECT_DELAYS_MS[Math.min(index, RECONNECT_DELAYS_MS.length - 1)];
}
