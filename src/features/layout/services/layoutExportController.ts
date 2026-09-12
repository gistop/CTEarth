import type { LayoutExportRequest, LayoutExportResult } from '../types';

export type LayoutExportHandler = (request: Required<Pick<LayoutExportRequest, 'format'>> & { signal: AbortSignal }) => Promise<LayoutExportResult>;

export function assertExportActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('布局导出已取消。', 'AbortError');
}

export function createLayoutExportController() {
  let handler: LayoutExportHandler | null = null;
  let active: { controller: AbortController; handler: LayoutExportHandler } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => Boolean(active),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    register(next: LayoutExportHandler) {
      if (handler && handler !== next) throw new Error('布局导出服务已注册。');
      handler = next;
      return () => {
        if (handler !== next) return;
        handler = null;
        if (active?.handler === next) active.controller.abort();
      };
    },
    cancel() { active?.controller.abort(); },
    async export(request: LayoutExportRequest = {}): Promise<LayoutExportResult> {
      assertExportActive(request.signal);
      const format = request.format ?? 'pdf';
      if (format !== 'pdf' && format !== 'png') throw new Error('不支持的布局导出格式。');
      if (!handler) throw new Error('布局导出服务尚未准备好。');
      if (active) throw new Error('已有布局正在导出，请等待或取消后重试。');
      const controller = new AbortController();
      const current = { controller, handler };
      active = current;
      const abort = () => controller.abort();
      request.signal?.addEventListener('abort', abort, { once: true });
      notify();
      try {
        const result = await current.handler({ format, signal: controller.signal });
        assertExportActive(controller.signal);
        return result;
      } finally {
        request.signal?.removeEventListener('abort', abort);
        if (active === current) active = null;
        notify();
      }
    },
  };
}

export type LayoutExportController = ReturnType<typeof createLayoutExportController>;
