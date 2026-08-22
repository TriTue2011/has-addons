export class OperationTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OperationTimeoutError';
    this.code = 'OPERATION_TIMEOUT';
  }
}

export function withTimeout(operation, timeoutMs, message = 'Operation timed out') {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs phai la so nguyen duong');
  }
  const task = Promise.resolve(operation);
  let timer;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new OperationTimeoutError(message)), timeoutMs);
    task.then(resolve, reject);
  }).finally(() => clearTimeout(timer));
}

export function cleanupAfterSettled(operation, cleanup) {
  void Promise.resolve(operation).then(cleanup, cleanup);
}
