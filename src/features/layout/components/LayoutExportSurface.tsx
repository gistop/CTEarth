import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useLayoutServices } from '../stores/LayoutContext';
import { getLayoutDerivedState } from '../services/layoutDocumentService';
import { exportLayout, getExportPixelSize } from '../services/layoutExportService';
import type { LayoutMapRuntime } from '../adapters/layoutMapTypes';
import { LayoutPageElements } from './LayoutPageElements';

export function LayoutExportSurface() {
  const { store, exports } = useLayoutServices();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { paper, pxPerMm } = getLayoutDerivedState(state);
  const runtime = useRef<LayoutMapRuntime | null>(null);
  const onRuntimeChange = useCallback((next: LayoutMapRuntime | null) => { runtime.current = next; }, []);

  useLayoutEffect(() => exports.register(async ({ format, signal }) => {
    if (store.getSnapshot() !== state) throw new Error('布局正在更新，请在版面同步后导出。');
    let image = null;
    if (state.enabledElements.includes('map-frame')) {
      if (!runtime.current) throw new Error('布局地图尚未准备好，请稍后导出。');
      const size = getExportPixelSize(state.rects['map-frame'].width, state.rects['map-frame'].height);
      image = await runtime.current.capture(size.width, size.height, signal);
    }
    return exportLayout(state, format, image, signal);
  }), [state, store, exports]);

  return <div className="layout-export-surface" aria-hidden="true">
    <div className="layout-page" style={{ height: paper.heightMm * pxPerMm, width: paper.widthMm * pxPerMm }}>
      <LayoutPageElements state={state} pxPerMm={pxPerMm} onRuntimeChange={onRuntimeChange} />
    </div>
  </div>;
}
