// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenLayersLayoutMap } from '../adapters/openLayersLayoutMapAdapter';
import { useLayoutMapInput } from '../stores/useLayoutMapInput';
import { createLayoutStore } from '../stores/layoutStore';
import { LayoutStoreProvider } from '../stores/LayoutContext';
import type { LayoutMapRuntime } from '../adapters/layoutMapTypes';
import { createLayoutMapInput } from '../testing/layoutMapFixtures';
import { LayoutMapPreview } from './LayoutMapPreview';

vi.mock('../adapters/openLayersLayoutMapAdapter', () => ({ createOpenLayersLayoutMap: vi.fn() }));
vi.mock('../stores/useLayoutMapInput', () => ({ useLayoutMapInput: vi.fn() }));

let runtime: LayoutMapRuntime;
beforeEach(() => {
  runtime = { sync: vi.fn(), setOptions: vi.fn(), setTargets: vi.fn(), capture: vi.fn(), dispose: vi.fn() };
  vi.mocked(createOpenLayersLayoutMap).mockReturnValue(runtime);
  vi.mocked(useLayoutMapInput).mockReturnValue(createLayoutMapInput());
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('layout map React bridge', () => {
  it('synchronizes styles and view options without recreating the map', () => {
    const store = createLayoutStore();
    const onRuntimeChange = vi.fn();
    const component = (northArrowTarget: HTMLDivElement | null) => <LayoutStoreProvider store={store}>
      <LayoutMapPreview northArrowTarget={northArrowTarget} scaleBarTarget={null} onRuntimeChange={onRuntimeChange} />
    </LayoutStoreProvider>;
    const { rerender, unmount } = render(component(null));
    const input = createLayoutMapInput();
    input.uploadedLayerStyles.changed = { ...input.defaultUploadedStyle, pointRadius: 10 };
    vi.mocked(useLayoutMapInput).mockReturnValue(input);
    const target = document.createElement('div');
    rerender(component(target));
    act(() => store.actions.updateZoom(140));
    expect(createOpenLayersLayoutMap).toHaveBeenCalledTimes(1);
    expect(runtime.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({ pxPerMm: 5 }));
    expect(runtime.setTargets).toHaveBeenLastCalledWith(target, null);
    expect(runtime.sync).toHaveBeenLastCalledWith(useLayoutMapInput());
    unmount();
    expect(runtime.dispose).toHaveBeenCalledTimes(1);
    expect(onRuntimeChange.mock.calls).toEqual([[runtime], [null]]);
  });

  it('shows synchronization errors and recovers on the next successful input', () => {
    vi.mocked(runtime.sync).mockImplementationOnce(() => { throw new Error('图层数据无效'); });
    const component = <LayoutStoreProvider><LayoutMapPreview northArrowTarget={null} scaleBarTarget={null} /></LayoutStoreProvider>;
    const { rerender } = render(component);
    expect(screen.getByRole('status').textContent).toBe('图层数据无效');
    vi.mocked(useLayoutMapInput).mockReturnValue(createLayoutMapInput());
    rerender(<LayoutStoreProvider><LayoutMapPreview northArrowTarget={null} scaleBarTarget={null} /></LayoutStoreProvider>);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('rebinds notification callbacks without replacing the map runtime', () => {
    const first = vi.fn();
    const second = vi.fn();
    const component = (callback: typeof first) => <LayoutStoreProvider><LayoutMapPreview northArrowTarget={null} scaleBarTarget={null} onRuntimeChange={callback} /></LayoutStoreProvider>;
    const { rerender, unmount } = render(component(first));
    rerender(component(second));
    expect(first.mock.calls).toEqual([[runtime], [null]]);
    expect(second).toHaveBeenCalledExactlyOnceWith(runtime);
    expect(createOpenLayersLayoutMap).toHaveBeenCalledTimes(1);
    unmount();
    expect(second.mock.calls).toEqual([[runtime], [null]]);
  });
});
