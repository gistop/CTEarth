// @vitest-environment jsdom

import { useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLayoutStore } from '../stores/layoutStore';
import { LayoutStoreProvider, useLayoutServices } from '../stores/LayoutContext';
import { LayoutExportSurface } from './LayoutExportSurface';
import { exportLayout } from '../services/layoutExportService';
import type { LayoutExportController } from '../services/layoutExportController';
import type { LayoutMapRuntime } from '../adapters/layoutMapTypes';
import type { LayoutMapSnapshot } from '../types';

const bridge = vi.hoisted(() => ({ runtime: null as LayoutMapRuntime | null }));
vi.mock('./LayoutPageElements', () => ({
  LayoutPageElements: ({ onRuntimeChange }: { onRuntimeChange: (runtime: LayoutMapRuntime | null) => void }) => {
    useLayoutEffect(() => { onRuntimeChange(bridge.runtime); return () => onRuntimeChange(null); }, [onRuntimeChange]);
    return null;
  },
}));
vi.mock('../services/layoutExportService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/layoutExportService')>(), exportLayout: vi.fn(),
}));

beforeEach(() => {
  bridge.runtime = { sync: vi.fn(), setOptions: vi.fn(), setTargets: vi.fn(), capture: vi.fn(), dispose: vi.fn() };
  vi.mocked(exportLayout).mockResolvedValue({ blob: new Blob(['pdf']), fileName: 'layout.pdf', warnings: [] });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function setup() {
  const store = createLayoutStore();
  let exports!: LayoutExportController;
  function Probe() { exports = useLayoutServices().exports; return null; }
  const result = render(<LayoutStoreProvider store={store}><Probe /><LayoutExportSurface /></LayoutStoreProvider>);
  return { ...result, store, exports };
}

describe('layout export surface lifecycle', () => {
  it('captures the document map at 300 DPI before composing the page', async () => {
    const snapshot = { canvas: document.createElement('canvas'), rotation: 0, groundMetersPerMm: 40 };
    vi.mocked(bridge.runtime!.capture).mockResolvedValue(snapshot);
    const { store, exports } = setup();
    await exports.export({ format: 'png' });
    expect(bridge.runtime!.capture).toHaveBeenCalledWith(2220, 1488, expect.any(AbortSignal));
    expect(exportLayout).toHaveBeenCalledWith(store.getSnapshot(), 'png', snapshot, expect.any(AbortSignal));
  });

  it('does not require a runtime for documents with the map frame disabled', async () => {
    bridge.runtime = null;
    const { store, exports } = setup();
    await expect(exports.export()).rejects.toThrow('尚未准备好');
    act(() => store.actions.toggleElement('map-frame'));
    await exports.export();
    expect(exportLayout).toHaveBeenCalledWith(store.getSnapshot(), 'pdf', null, expect.any(AbortSignal));
  });

  it.each(['state-change', 'unmount'])('cancels in-flight exports on %s', async (cause) => {
    let signal!: AbortSignal;
    vi.mocked(bridge.runtime!.capture).mockImplementation((_width, _height, requestSignal) => {
      signal = requestSignal!;
      return new Promise<LayoutMapSnapshot>((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }));
    });
    const { store, exports, unmount } = setup();
    const pending = exports.export();
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    if (cause === 'state-change') act(() => store.actions.setPaperId('a4-portrait'));
    else unmount();
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(exportLayout).not.toHaveBeenCalled();
    expect(exports.getSnapshot()).toBe(false);
  });
});
