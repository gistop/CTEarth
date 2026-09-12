// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DigitizeProvider } from './DigitizeProvider';
import { RasterEditControls } from './RasterEditControls';
import { useDigitizeRibbonGroups } from './DigitizeRibbon';
import { useDigitize } from '../stores/DigitizeContext';
import { createDigitizeStore } from '../stores/digitizeStore';
import { createDigitizeRaster, createEditableLayer, createMemoryDigitizePort } from '../testing/digitizeFixtures';
import type { RasterOverlay, UploadedLayer } from '../../../gisStore';

const gis = vi.hoisted(() => ({
  layers: [] as UploadedLayer[], activeLayerId: null as string | null, raster: null as RasterOverlay | null, isRunning: false,
  setActiveLayer: vi.fn(), createBlankGeoJsonLayer: vi.fn(), saveGeoJsonLayer: vi.fn(), updateUploadedLayerGeoJson: vi.fn(),
  editRasterByAoi: vi.fn(), saveRasterLayer: vi.fn(),
}));
vi.mock('../../layers', () => ({ useLayerStore: () => gis }));
vi.mock('../../../gisStore', () => ({ useGis: () => gis, displayLayerName: (name: string) => name }));
beforeEach(() => { gis.layers = [createEditableLayer()]; gis.activeLayerId = 'points'; gis.raster = null; gis.isRunning = false; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function ClearButton() {
  const digitize = useDigitize();
  return <><button onClick={digitize.clearFeatures}>Clear</button><output>{digitize.status}</output></>;
}

function Ribbon({ active = true }: { active?: boolean }) {
  const groups = useDigitizeRibbonGroups(active);
  return <>{groups.map(group => <section key={group.title} aria-label={group.title}>
    {group.tools.map(tool => <button key={tool.label} disabled={tool.disabled} aria-pressed={tool.active} onClick={tool.onClick}>{tool.label}</button>)}
    {group.accessory}
  </section>)}</>;
}

describe('digitize manual controls and provider', () => {
  it('clears via an injected data port without loading a map, and does not replay on remount', () => {
    const memory = createMemoryDigitizePort(); const store = createDigitizeStore();
    const view = render(<DigitizeProvider port={memory.port} store={store}><ClearButton /></DigitizeProvider>);
    fireEvent.click(screen.getByText('Clear'));
    expect(memory.writes).toHaveLength(1); expect(store.getSnapshot().featureCount).toBe(0);
    expect(screen.getByRole('status').textContent).toContain('已清空');
    view.unmount(); memory.put(createEditableLayer());
    render(<DigitizeProvider port={memory.port} store={store}><ClearButton /></DigitizeProvider>);
    expect(memory.writes).toHaveLength(1); expect(memory.port.getActiveLayer()!.geojson.features).toHaveLength(1);
  });

  it('uses fresh GIS callbacks and active targets after a provider update', () => {
    const view = render(<DigitizeProvider><ClearButton /></DigitizeProvider>);
    fireEvent.click(screen.getByText('Clear'));
    expect(gis.updateUploadedLayerGeoJson).toHaveBeenCalledWith('points', expect.objectContaining({ features: [] }));
    gis.layers = [createEditableLayer('next')]; gis.activeLayerId = 'next'; gis.updateUploadedLayerGeoJson = vi.fn();
    view.rerender(<DigitizeProvider><ClearButton /></DigitizeProvider>);
    fireEvent.click(screen.getByText('Clear'));
    expect(gis.updateUploadedLayerGeoJson).toHaveBeenCalledWith('next', expect.objectContaining({ features: [] }));
  });

  it('reports missing targets without reporting successful edits', () => {
    const memory = createMemoryDigitizePort([]);
    render(<DigitizeProvider port={memory.port}><ClearButton /></DigitizeProvider>);
    fireEvent.click(screen.getByText('Clear'));
    expect(memory.writes).toHaveLength(0); expect(screen.getByRole('status').textContent).toContain('请选择');
  });

  it('retains ordinary layer creation, selection, saving, clear and snapping controls', () => {
    const memory = createMemoryDigitizePort(gis.layers); const store = createDigitizeStore();
    render(<DigitizeProvider port={memory.port} store={store}><Ribbon /></DigitizeProvider>);
    expect(store.getSnapshot().editingActive).toBe(true);
    fireEvent.click(screen.getByText('节点编辑')); expect(store.getSnapshot().modifyEnabled).toBe(true);
    fireEvent.click(screen.getByText('Snap')); expect(store.getSnapshot().snapEnabled).toBe(false);
    fireEvent.click(screen.getByText('清空图层')); expect(memory.writes).toHaveLength(1);
    fireEvent.click(screen.getByText('Save')); expect(gis.saveGeoJsonLayer).toHaveBeenCalledWith('points');
    fireEvent.click(screen.getByText('Save As')); expect(gis.saveGeoJsonLayer).toHaveBeenCalledWith('points', { saveAs: true });
    fireEvent.change(screen.getByLabelText('当前编辑图层'), { target: { value: 'points' } }); expect(gis.setActiveLayer).toHaveBeenCalledWith('points');
    vi.spyOn(window, 'prompt').mockReturnValue('new.geojson');
    fireEvent.click(screen.getByText('New Poly')); expect(gis.createBlankGeoJsonLayer).toHaveBeenCalledWith({ fileName: 'new.geojson', geometryType: 'Polygon' });
  });

  it('coordinates tool geometry and deactivates editing when leaving the edit tab', () => {
    gis.layers = [{ ...createEditableLayer(), geometryType: 'Polygon' }];
    const store = createDigitizeStore(); const memory = createMemoryDigitizePort(gis.layers);
    const view = render(<DigitizeProvider port={memory.port} store={store}><Ribbon /></DigitizeProvider>);
    expect(store.getSnapshot().activeTool).toBe('Polygon');
    expect((screen.getByRole('button', { name: '点' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<DigitizeProvider port={memory.port} store={store}><Ribbon active={false} /></DigitizeProvider>);
    expect(store.getSnapshot().editingActive).toBe(false);
  });

  it('validates raster values and preserves AOI, execute and save actions', () => {
    gis.raster = createDigitizeRaster(); const memory = createMemoryDigitizePort(); const store = createDigitizeStore();
    const polygon = { type: 'Polygon' as const, coordinates: [[[10, 50], [11, 50], [11, 51], [10, 50]] as [number, number][]] };
    const view = render(<DigitizeProvider port={memory.port} store={store}><RasterEditControls /></DigitizeProvider>);
    const execute = screen.getByTitle('执行栅格修改') as HTMLButtonElement;
    expect(execute.disabled).toBe(true);
    fireEvent.click(screen.getByTitle('绘制 AOI')); expect(store.getSnapshot().rasterAoiActive).toBe(true);
    act(() => { store.actions.setRasterAoi(polygon); }); expect(execute.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('新像元值'), { target: { value: '' } }); expect(execute.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('新像元值'), { target: { value: '-12.5' } }); fireEvent.click(execute);
    expect(gis.editRasterByAoi).toHaveBeenCalledWith({ polygon, value: '-12.5' });
    fireEvent.click(screen.getByTitle('下载 GeoTIFF')); expect(gis.saveRasterLayer).toHaveBeenCalledTimes(1);
    gis.isRunning = true; view.rerender(<DigitizeProvider port={memory.port} store={store}><RasterEditControls /></DigitizeProvider>);
    expect(execute.disabled).toBe(true); expect((screen.getByTitle('下载 GeoTIFF') as HTMLButtonElement).disabled).toBe(true);
  });
});
