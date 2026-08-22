// Dem ca slot dang xac thuc va WebSocket da mo. Neu chi dem client da dang ky,
// nhieu upgrade dong thoi deu co the thay con cho trong truoc khi session xong.
export function createConnectionLimit(maximum, activeCount) {
  let reserved = 0;
  const hasRoom = () => activeCount() + reserved < maximum;
  return {
    tryReserve() {
      if (!hasRoom()) return false;
      reserved += 1;
      return true;
    },
    confirm() {
      reserved = Math.max(0, reserved - 1);
    },
    release() {
      reserved = Math.max(0, reserved - 1);
    },
    pending() {
      return reserved;
    },
  };
}
