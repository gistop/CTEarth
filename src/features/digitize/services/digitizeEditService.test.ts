import { describe, expect, it } from 'vitest';
import { createDigitizeEditService } from './digitizeEditService';
import { createEditableLayer, createMemoryDigitizePort, createPointFeature } from '../testing/digitizeFixtures';
import { createRegressionLayer, regressionRings } from '../testing/sharedBoundaryRegression';

describe('digitize edit service', () => {
  it('commits through the ordinary data port without a mounted UI', () => {
    const memory = createMemoryDigitizePort();
    const service = createDigitizeEditService(memory.port);
    const session = service.beginEdit();
    const feature = createPointFeature('new');
    service.commit(session, [feature]);
    feature.properties.name = 'mutated afterwards';
    expect(memory.writes).toHaveLength(1);
    expect(memory.writes[0].layerId).toBe('points');
    expect(memory.port.getActiveLayer()!.geojson.features[0]).toMatchObject({ properties: { name: 'new' } });
    expect(() => service.commit(session, [])).toThrow('会话已结束');
  });

  it('rejects the supplied self-intersecting polygon before calling the ordinary data port', () => {
    const layer = createRegressionLayer(); const memory = createMemoryDigitizePort([layer]);
    const service = createDigitizeEditService(memory.port);
    const invalid = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [regressionRings[2]] }, properties: null };
    expect(() => service.commit(service.beginEdit(), [...layer.geojson.features, invalid])).toThrow(/第 3 个要素.*自交/);
    expect(memory.writes).toHaveLength(0); expect(memory.port.getActiveLayer()!.geojson).toBe(layer.geojson);
  });

  it('preserves collection metadata but invalidates stale bounds', () => {
    const layer = createEditableLayer();
    const memory = createMemoryDigitizePort([{ ...layer, geojson: { ...layer.geojson, name: 'roads', bbox: [0, 0, 1, 1] } }]);
    const service = createDigitizeEditService(memory.port);
    const result = service.commit(service.beginEdit(), [createPointFeature('other')]);
    expect(result.name).toBe('roads');
    expect(result).not.toHaveProperty('bbox');
  });

  it.each(['switch', 'remove', 'change'] as const)('rejects stale edits after target %s', operation => {
    const original = createEditableLayer();
    const memory = createMemoryDigitizePort([original, createEditableLayer('second')]);
    const service = createDigitizeEditService(memory.port);
    const session = service.beginEdit();
    if (operation === 'switch') memory.activate('second');
    if (operation === 'remove') memory.remove(original.id);
    if (operation === 'change') memory.put({ ...original, geojson: { ...original.geojson } });
    expect(() => service.commit(session, [createPointFeature('new')])).toThrow();
    expect(memory.writes).toHaveLength(0);
  });

  it('supports explicit layer commands without forcing a UI selection', () => {
    const memory = createMemoryDigitizePort([createEditableLayer(), createEditableLayer('second')]);
    const service = createDigitizeEditService(memory.port);
    service.commit(service.beginEdit('second'), [createPointFeature('new')]);
    expect(memory.writes[0].layerId).toBe('second');
    expect(memory.port.getActiveLayer()!.id).toBe('points');
  });

  it('cancels sessions and refuses foreign session tokens', () => {
    const memory = createMemoryDigitizePort();
    const first = createDigitizeEditService(memory.port);
    const second = createDigitizeEditService(memory.port);
    const session = first.beginEdit();
    expect(() => second.commit(session, [])).toThrow('会话已结束');
    first.cancel(session);
    expect(() => first.commit(session, [])).toThrow('会话已结束');
    expect(memory.writes).toHaveLength(0);
  });

  it('treats unchanged content as a no-op and provides a direct clear command', () => {
    const memory = createMemoryDigitizePort();
    const service = createDigitizeEditService(memory.port);
    const session = service.beginEdit();
    expect(service.commit(session, structuredClone(session.base.features))).toBe(session.base);
    expect(memory.writes).toHaveLength(0);
    service.clearFeatures();
    expect(memory.port.getActiveLayer()!.geojson.features).toEqual([]);
    expect(memory.writes).toHaveLength(1);
  });

  it.each([
    { type: 'Feature', geometry: { type: 'Point', coordinates: [NaN, 0] }, properties: {} },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] }, properties: {} },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
    { type: 'Feature', geometry: null, properties: 'invalid' },
  ])('validates geometry and layer type before writing', feature => {
    const memory = createMemoryDigitizePort();
    const service = createDigitizeEditService(memory.port);
    expect(() => service.commit(service.beginEdit(), [feature])).toThrow();
    expect(memory.writes).toHaveLength(0);
  });
});
