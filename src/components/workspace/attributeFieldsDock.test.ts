import { describe, expect, it, vi } from 'vitest';
import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { getAttributeFieldsLayerId, openAttributeFieldsPanel } from './attributeFieldsDock';

function createDock() {
  const panels = new Map<string, IDockviewPanel>();
  const panel = { api: { setActive: vi.fn(), setTitle: vi.fn() }, group: { panels: [] } } as unknown as IDockviewPanel;
  const addPanel = vi.fn(() => panel);
  const api = { getPanel: (id: string) => panels.get(id), addPanel } as Pick<DockviewApi, 'getPanel' | 'addPanel'>;
  return { api, panel, panels, addPanel };
}

describe('field tab navigation', () => {
  it('opens within the owning attribute table group and reuses the same tab', () => {
    const dock = createDock();
    const layerId = 'roads:/中文';
    dock.panels.set(`attribute-table:${encodeURIComponent(layerId)}`, dock.panel);
    openAttributeFieldsPanel(dock.api, layerId, '道路');
    const options = dock.addPanel.mock.calls[0] as unknown as [{ id: string }];
    expect(dock.addPanel).toHaveBeenCalledWith(expect.objectContaining({
      component: 'attributeFields', title: '字段 - 道路', params: { layerId },
      position: { direction: 'within', referencePanel: dock.panel, index: 0 },
    }));
    expect(getAttributeFieldsLayerId(options[0].id)).toBe(layerId);
    dock.panels.set(options[0].id, dock.panel);
    openAttributeFieldsPanel(dock.api, layerId, '道路改名');
    expect(dock.addPanel).toHaveBeenCalledTimes(1);
    expect(dock.panel.api.setTitle).toHaveBeenCalledWith('字段 - 道路改名');
    expect(dock.panel.api.setActive).toHaveBeenCalledTimes(2);
  });

  it('falls back to Python or below the map, and handles missing references', () => {
    const dock = createDock();
    dock.panels.set('python', dock.panel);
    openAttributeFieldsPanel(dock.api, 'first');
    expect(dock.addPanel).toHaveBeenLastCalledWith(expect.objectContaining({ position: { direction: 'within', referencePanel: dock.panel, index: 0 } }));
    dock.panels.delete('python');
    dock.panels.set('map', dock.panel);
    openAttributeFieldsPanel(dock.api, 'second');
    expect(dock.addPanel).toHaveBeenLastCalledWith(expect.objectContaining({ position: { direction: 'below', referencePanel: dock.panel } }));
    dock.panels.clear();
    openAttributeFieldsPanel(dock.api, 'third');
    expect(dock.addPanel).toHaveBeenLastCalledWith(expect.objectContaining({ position: undefined }));
    expect(getAttributeFieldsLayerId('attribute-table:other')).toBeNull();
    expect(getAttributeFieldsLayerId('attribute-fields:%bad')).toBe('%bad');
  });
});
