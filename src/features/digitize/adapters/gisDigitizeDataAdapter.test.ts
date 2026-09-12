import { describe, expect, it, vi } from 'vitest';
import { createGisDigitizeDataAdapter } from './gisDigitizeDataAdapter';
import { createEditableLayer, createPointFeature } from '../testing/digitizeFixtures';

describe('GIS edit data adapter', () => {
  it('routes writes through the existing API and bridges the React commit gap', () => {
    const layer = createEditableLayer();
    const update = vi.fn();
    const bindings = { activeLayerId: layer.id, layers: [layer], updateUploadedLayerGeoJson: update };
    const adapter = createGisDigitizeDataAdapter(bindings);
    const first = { type: 'FeatureCollection' as const, features: [createPointFeature('first')] };
    const second = { type: 'FeatureCollection' as const, features: [createPointFeature('second')] };
    adapter.port.replaceFeatures(layer.id, first, layer.geojson);
    expect(adapter.port.getActiveLayer()!.geojson).toBe(first);
    expect(() => adapter.port.replaceFeatures(layer.id, second, layer.geojson)).toThrow('数据已变化');
    adapter.port.replaceFeatures(layer.id, second, first);
    expect(update).toHaveBeenCalledTimes(2);
    adapter.sync({ ...bindings, layers: [{ ...layer, geojson: second }] });
    expect(adapter.port.getLayer(layer.id)!.geojson).toBe(second);
  });

  it('does not retain pending data after external replacement or deletion', () => {
    const layer = createEditableLayer();
    const bindings = { activeLayerId: layer.id, layers: [layer], updateUploadedLayerGeoJson: vi.fn() };
    const adapter = createGisDigitizeDataAdapter(bindings);
    adapter.port.replaceFeatures(layer.id, { type: 'FeatureCollection', features: [] }, layer.geojson);
    const external = { ...layer, geojson: { type: 'FeatureCollection' as const, features: [createPointFeature('external')] } };
    adapter.sync({ ...bindings, layers: [external] });
    expect(adapter.port.getActiveLayer()).toBe(external);
    adapter.sync({ ...bindings, layers: [] });
    expect(adapter.port.getActiveLayer()).toBeNull();
  });

  it('uses current callbacks and does not publish failed writes optimistically', () => {
    const layer = createEditableLayer();
    const original = vi.fn();
    const adapter = createGisDigitizeDataAdapter({ activeLayerId: null, layers: [layer], updateUploadedLayerGeoJson: original });
    const failing = vi.fn(() => { throw new Error('write failed'); });
    adapter.sync({ activeLayerId: layer.id, layers: [layer], updateUploadedLayerGeoJson: failing });
    expect(() => adapter.port.replaceFeatures(layer.id, { type: 'FeatureCollection', features: [] }, layer.geojson)).toThrow('write failed');
    expect(adapter.port.getActiveLayer()!.geojson).toBe(layer.geojson);
    expect(original).not.toHaveBeenCalled();
  });
});
