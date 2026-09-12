import { describe, expect, it } from 'vitest';
import { createGisDataViewAdapter } from './gisDataViewAdapter';
import { createEditableLayer } from '../../features/digitize/testing/digitizeFixtures';
describe('GIS data-view projection', () => {
  it('projects properties without cloning authoritative data and reuses records on selection changes', () => {
    const adapter = createGisDataViewAdapter(); const layer = createEditableLayer();
    const first = adapter.read([layer], null, name => name)[0];
    const changed = adapter.read([{ ...layer, selectedFeatureIndexes: [0] }], null, name => name)[0];
    expect(first.records[0]).toBe((layer.geojson.features[0] as { properties: object }).properties);
    expect(first.records).toBe(changed.records); expect(changed.selectedIndexes).toEqual([0]); expect(first.selectedIndexes).toEqual([]);
  });
  it('handles null properties without shifting record indexes and marks analysis overlays read-only', () => {
    const adapter = createGisDataViewAdapter();
    const overlay = { name: 'analysis', geojson: { type: 'FeatureCollection' as const, features: [null, { properties: null }, { properties: { result: 3 } }] } };
    const dataset = adapter.read([], overlay, name => name)[0];
    expect(dataset.records).toEqual([{}, {}, { result: 3 }]); expect(dataset.fields).toEqual(['result']); expect(dataset.selectable).toBe(false);
  });
  it('reads replacement snapshots and removals without retaining stale datasets', () => {
    const adapter = createGisDataViewAdapter(); const first = adapter.read([createEditableLayer()], null, name => name)[0];
    const next = adapter.read([createEditableLayer()], null, name => name)[0]; expect(next.records).not.toBe(first.records);
    expect(adapter.read([], null, name => name)).toEqual([]);
  });
});
