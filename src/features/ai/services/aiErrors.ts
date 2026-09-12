export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('AI 请求已取消。', 'AbortError');
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAbortError(error: unknown) {
  return isRecord(error) && error.name === 'AbortError';
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请重试。';
}
