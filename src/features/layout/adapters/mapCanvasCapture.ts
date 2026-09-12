import { assertExportActive } from '../services/layoutExportController';

export async function waitForMapRender(
  listen: (complete: () => void) => () => void,
  render: () => void,
  signal?: AbortSignal,
  timeoutMs = 15000,
) {
  assertExportActive(signal);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};
    const cleanup = () => { unsubscribe(); clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new DOMException('布局地图导出已取消。', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('地图未在限定时间内完成渲染，请检查图层服务后重试。')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      unsubscribe = listen(() => finish());
      if (settled) unsubscribe();
      else { assertExportActive(signal); render(); }
    } catch (error) { finish(error); }
  });
}

export function compositeMapCanvases(viewport: HTMLElement, width: number, height: number) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  const context = result.getContext('2d');
  if (!context) throw new Error('无法创建地图快照画布。');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  const canvases = viewport.querySelectorAll<HTMLCanvasElement>('.ol-layer canvas, canvas.ol-layer');
  for (const canvas of canvases) {
    if (!canvas.width || !canvas.height) continue;
    const parent = canvas.parentElement;
    if (parent?.style.display === 'none' || canvas.style.display === 'none') continue;
    context.save();
    const opacity = Number(parent?.style.opacity || canvas.style.opacity || 1);
    context.globalAlpha = Number.isFinite(opacity) ? opacity : 1;
    if (canvas.style.transform && canvas.style.transform !== 'none') {
      const matrix = new DOMMatrixReadOnly(canvas.style.transform);
      context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    } else {
      context.setTransform((parseFloat(canvas.style.width) || canvas.width) / canvas.width, 0, 0, (parseFloat(canvas.style.height) || canvas.height) / canvas.height, 0, 0);
    }
    if (parent?.style.backgroundColor) {
      context.fillStyle = parent.style.backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(canvas, 0, 0);
    context.restore();
  }
  try { context.getImageData(0, 0, 1, 1); } catch {
    throw new Error('地图包含不允许跨域导出的图层，请更换数据源后重试；未生成替代地图。');
  }
  return result;
}
