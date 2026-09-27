let suppressCount = 0;

export function isDoubleClickZoomSuppressed(): boolean {
  return suppressCount > 0;
}

/**
 * 在测量/分析交互 handler 存活期间抑制地图的双击放大行为，
 * handler.destroy() 时自动恢复，避免双击结束测量时地图意外缩放。
 */
export function suppressDoubleClickZoomWhileHandlerAlive(handler: { destroy: () => void }): void {
  suppressCount += 1;

  const originalDestroy = handler.destroy.bind(handler);

  handler.destroy = () => {
    suppressCount = Math.max(0, suppressCount - 1);
    originalDestroy();
  };
}
