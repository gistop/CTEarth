import { describe, expect, it, vi } from 'vitest';
import type { DigitizeCommand, RasterAoiPolygon } from '../types';
import { createDigitizeStore } from './digitizeStore';

const polygon: RasterAoiPolygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

describe('digitize state', () => {
  it('supports ordinary commands independently of React and map engines', () => {
    const store = createDigitizeStore();
    store.execute({ type: 'set-editing', active: true });
    store.execute({ type: 'set-tool', tool: 'Polygon' });
    expect(store.getSnapshot()).toMatchObject({ editingActive: true, activeTool: 'Polygon', snapEnabled: true, traceEnabled: true });
    expect(store.getSnapshot().status).toContain('公共边自动完成已开启');
  });

  it('keeps modes mutually exclusive and exits interactions when editing closes', () => {
    const store = createDigitizeStore();
    store.actions.setEditingActive(true);
    store.actions.toggleModify();
    store.actions.startRasterAoi();
    expect(store.getSnapshot()).toMatchObject({ modifyEnabled: false, rasterAoiActive: true });
    store.actions.setActiveTool('LineString');
    expect(store.getSnapshot()).toMatchObject({ modifyEnabled: false, rasterAoiActive: false });
    store.actions.toggleModify();
    store.actions.setEditingActive(false);
    expect(store.getSnapshot()).toMatchObject({ modifyEnabled: false, rasterAoiActive: false, editingActive: false });
  });

  it('does not replace modify status with a drawing status when toggling snapping', () => {
    const store = createDigitizeStore();
    store.actions.toggleModify();
    store.actions.setSnapEnabled(false);
    expect(store.getSnapshot().status).toContain('节点编辑');
    expect(store.getSnapshot().status).toContain('Snap 已关闭');
  });

  it('owns immutable AOI snapshots without freezing caller objects', () => {
    const store = createDigitizeStore();
    const input = structuredClone(polygon);
    store.actions.startRasterAoi();
    store.actions.setRasterAoi(input);
    input.coordinates[0][0][0] = 40;
    expect(store.getSnapshot().rasterAoi!.coordinates[0][0][0]).toBe(0);
    expect(() => { store.getSnapshot().rasterAoi!.coordinates[0][0][0] = 20; }).toThrow();
    expect(store.getSnapshot().rasterAoiActive).toBe(false);
    store.actions.clearRasterAoi();
    expect(store.getSnapshot()).toMatchObject({ rasterAoi: null, rasterAoiActive: false, rasterAoiRevision: 2 });
  });

  it('notifies only on actual changes and keeps providers independent', () => {
    const store = createDigitizeStore();
    const second = createDigitizeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();
    store.actions.setFeatureCount(0);
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    store.actions.setFeatureCount(3);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.actions.setFeatureCount(4);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(second.getSnapshot().featureCount).toBe(0);
  });

  it.each([
    { type: 'set-tool', tool: 'unsupported' }, { type: 'set-feature-count', count: -1 },
    { type: 'set-feature-count', count: NaN }, { type: 'set-snap', enabled: 'yes' },
    { type: 'set-aoi', polygon: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [2, 2], [0, 0]]] } },
  ])('rejects invalid $type commands without partial changes', command => {
    const store = createDigitizeStore();
    const before = store.getSnapshot();
    expect(() => store.execute(command as DigitizeCommand)).toThrow();
    expect(store.getSnapshot()).toBe(before);
  });
});
