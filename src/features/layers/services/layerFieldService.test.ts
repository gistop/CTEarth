import { describe, expect, it } from 'vitest';
import { addLayerFields, getLayerFields, readLayerFieldDefinitions } from './layerFieldService';
import type { DataFieldDefinition } from '../../../shared/data-views/types';

const field: DataFieldDefinition = { name: 'population', alias: '人口', type: 'integer', nullable: false, defaultValue: 0, length: null };

describe('layer field updates', () => {
  it('updates every record immutably while preserving geometry, feature IDs and collection metadata', () => {
    const geometry = { type: 'Point', coordinates: [10, 50] };
    const features = [
      { type: 'Feature', id: 'first', geometry, properties: { name: 'A' } },
      { type: 'Feature', id: 'second', geometry: null, properties: null },
    ];
    const collection = { type: 'FeatureCollection' as const, features, bbox: [10, 50, 10, 50], custom: 'retained' };
    const before = structuredClone(collection);
    const next = addLayerFields(collection, [field]);
    expect(collection).toEqual(before);
    expect(next).not.toBe(collection);
    expect(next.features).toEqual([
      { ...features[0], properties: { name: 'A', population: 0 } },
      { ...features[1], properties: { population: 0 } },
    ]);
    expect((next.features[0] as { geometry: unknown }).geometry).toBe(geometry);
    expect(next).toMatchObject({ bbox: collection.bbox, custom: 'retained' });
    expect(readLayerFieldDefinitions(next)).toEqual([field]);
  });

  it('round-trips empty and all-null field definitions through JSON used by drafts and GeoJSON', () => {
    const empty = { type: 'FeatureCollection' as const, features: [] };
    const text: DataFieldDefinition = { name: 'label', alias: '标签', type: 'text', nullable: true, defaultValue: null, length: 80 };
    const next = addLayerFields(empty, [field, text]);
    const restored = JSON.parse(JSON.stringify(next));
    expect(restored.features).toEqual([]);
    expect(getLayerFields(restored)).toEqual(['label', 'population']);
    expect(readLayerFieldDefinitions(restored)).toEqual([field, text]);
    expect(() => addLayerFields(restored, [field])).toThrow('已存在');
  });

  it('rejects a whole batch without partially updating data', () => {
    const collection = { type: 'FeatureCollection' as const, features: [{ type: 'Feature', properties: { Population: 4 } }] };
    expect(() => addLayerFields(collection, [field])).toThrow('已存在');
    expect(collection.features[0].properties).toEqual({ Population: 4 });
    expect(() => addLayerFields({ type: 'FeatureCollection', features: [collection.features[0], null] }, [ { ...field, name: 'new_field' } ])).toThrow('无效要素');
    expect(() => addLayerFields(collection, [])).toThrow('至少一个字段');
  });

  it('ignores malformed imported metadata without hiding actual properties', () => {
    const collection = { type: 'FeatureCollection' as const, features: [{ type: 'Feature', properties: { name: 'A' } }], 'ctearth:fields': [null, {}, { ...field, name: '__proto__' }, field, field] };
    expect(readLayerFieldDefinitions(collection)).toEqual([field]);
    expect(getLayerFields(collection)).toEqual(['name', 'population']);
    expect({}.hasOwnProperty('population')).toBe(false);
  });
});
