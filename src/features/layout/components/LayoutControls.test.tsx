// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLayoutStore } from '../stores/layoutStore';
import { LayoutStoreProvider, useLayoutServices } from '../stores/LayoutContext';
import { LayoutPaperSelect } from './LayoutPaperSelect';
import { LayoutElementControls, LayoutOrderButton } from './LayoutElementControls';
import { LayoutHeaderActions } from './LayoutToolbar';
import { LayoutExportSplitButton } from './LayoutExportSplitButton';
import { downloadBlob } from '../adapters/browserDownloadAdapter';
import type { LayoutExportController } from '../services/layoutExportController';

vi.mock('../adapters/browserDownloadAdapter', () => ({ downloadBlob: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('layout ribbon integration', () => {
  it('preserves manual paper, element, grid, zoom and ordering operations', () => {
    const store = createLayoutStore();
    render(<LayoutStoreProvider store={store}><LayoutPaperSelect /><LayoutElementControls /><LayoutHeaderActions /><LayoutOrderButton direction="down" /></LayoutStoreProvider>);
    fireEvent.change(screen.getByLabelText('纸张'), { target: { value: 'a4-portrait' } });
    expect(store.getSnapshot().paperId).toBe('a4-portrait');
    fireEvent.click(screen.getByRole('button', { name: '标题' }));
    expect(store.getSnapshot().enabledElements).not.toContain('title');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(store.getSnapshot().mapGraticuleVisible).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    expect(store.getSnapshot().zoom).toBe(125);
    fireEvent.click(screen.getByRole('button', { name: '平移页面' }));
    expect(store.getSnapshot().tool).toBe('pan');
    expect((screen.getByRole('button', { name: '下移选中元素' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => store.actions.setSelectedElementId('north-arrow'));
    fireEvent.click(screen.getByRole('button', { name: '下移选中元素' }));
    expect(store.getSnapshot().enabledElements[0]).toBe('north-arrow');
    fireEvent.click(screen.getByRole('button', { name: '重置布局' }));
    expect(store.getSnapshot()).toEqual(createLayoutStore().getSnapshot());
  });

  it('disables duplicate export and downloads only a completed result', async () => {
    let exports!: LayoutExportController;
    function Probe() { exports = useLayoutServices().exports; return null; }
    render(<LayoutStoreProvider><Probe /><LayoutExportSplitButton /></LayoutStoreProvider>);
    let complete!: () => void;
    const blob = new Blob(['pdf']);
    exports.register(() => new Promise((resolve) => { complete = () => resolve({ blob, fileName: 'map.pdf', warnings: [] }); }));
    const button = screen.getByRole('button', { name: '导出为 PDF' }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    expect(downloadBlob).not.toHaveBeenCalled();
    await act(async () => complete());
    expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(blob, 'map.pdf');
    expect(button.disabled).toBe(false);
  });

  it('reports unavailable exporters instead of silently succeeding', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<LayoutStoreProvider><LayoutExportSplitButton /></LayoutStoreProvider>);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '导出为 PDF' })));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('尚未准备好'));
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
