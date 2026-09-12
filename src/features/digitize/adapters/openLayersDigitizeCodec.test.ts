import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import GeometryCollection from 'ol/geom/GeometryCollection.js';
import VectorSource from 'ol/source/Vector.js';
import { fromLonLat } from 'ol/proj.js';
import { describe, expect, it } from 'vitest';
import { createDigitizeFeatureCodec, getBoundaryRings } from './openLayersDigitizeCodec';

describe('OpenLayers edit transport', () => {
  it('preserves ids, properties, foreign members and exact unchanged coordinates', () => {
    const original = { type: 'Feature', id: 'business-id', geometry: { type: 'Point', coordinates: [10.123456789, 50.987654321, 8] }, properties: { geometry: 'business field', _style: 'user value', _editable: false, _selected: 'user selection', _layerId: 'business id' }, bbox: [10, 50, 11, 51], source: 'survey' };
    const codec = createDigitizeFeatureCodec();
    const features = codec.read({ type: 'FeatureCollection', features: [original] });
    expect(codec.write(features)).toEqual([original]);
    features[0].setGeometry(new Point(fromLonLat([11, 51])));
    const changed = codec.write(features)[0];
    expect(changed).toMatchObject({ id: original.id, properties: original.properties, source: 'survey' });
    expect(changed).not.toHaveProperty('bbox');
    expect(original.geometry.coordinates).toEqual([10.123456789, 50.987654321, 8]);
  });

  it('does not let duplicate business ids drop features from the editable source', () => {
    const codec = createDigitizeFeatureCodec();
    const feature = { type: 'Feature', id: 'same', geometry: { type: 'Point', coordinates: [10, 50] }, properties: null };
    const source = new VectorSource({ features: codec.read({ type: 'FeatureCollection', features: [feature, structuredClone(feature)] }) });
    expect(source.getFeatures()).toHaveLength(2);
    expect(codec.write(source.getFeatures())).toEqual([feature, feature]);
  });

  it('preserves original row order after source reindexing and appends new features', () => {
    const codec = createDigitizeFeatureCodec();
    const originals = [1, 2, 3].map(id => ({ type: 'Feature', id, properties: { name: `row-${id}` }, geometry: { type: 'Point', coordinates: [10 + id, 50] } }));
    const features = codec.read({ type: 'FeatureCollection', features: originals });
    features[1].setGeometry(new Point(fromLonLat([20, 52])));
    const created = new Feature(new Point(fromLonLat([30, 53])));
    const result = codec.write([created, features[2], features[0], features[1]]);
    expect(result.map(feature => feature.id)).toEqual([1, 2, 3, undefined]);
    expect(result[0]).toEqual(originals[0]); expect(result[2]).toEqual(originals[2]);
    expect(result[1].properties).toEqual(originals[1].properties);
  });

  it('reuses exact business coordinates for shared nodes without copying another geometry altitude', () => {
    const coordinate = [7.480176481975394, 46.718451479064726, 25];
    const codec = createDigitizeFeatureCodec();
    const original = { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: coordinate }] }, properties: { name: 'anchor' } };
    const features = codec.read({ type: 'FeatureCollection', features: [original] });
    const anchor = (features[0].getGeometry() as GeometryCollection).getGeometries()[0] as Point;
    const created = new Feature(new Point([...anchor.getCoordinates().slice(0, 2), 80]));
    const result = codec.write([created, ...features]);
    expect(result[0]).toEqual(original);
    expect(result[1]).toMatchObject({ geometry: { type: 'Point', coordinates: [coordinate[0], coordinate[1], 80] } });
  });

  it('preserves empty geometries and exports new features without internal style fields', () => {
    const codec = createDigitizeFeatureCodec();
    const original = { type: 'Feature', geometry: null, properties: { name: 'empty' } };
    expect(codec.write(codec.read({ type: 'FeatureCollection', features: [original] }))).toEqual([original]);
    const feature = new Feature(new Point(fromLonLat([10, 50])));
    const result = codec.write([feature])[0];
    expect(result).toMatchObject({ type: 'Feature', geometry: { type: 'Point' } });
    expect(JSON.stringify(result)).not.toMatch(/_editable|_featureIndex|_style|_layerId/);
  });

  it('transforms and validates AOIs and collects multipolygon holes for tracing', () => {
    const codec = createDigitizeFeatureCodec();
    const polygon = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] as [number, number][][] };
    const result = codec.writeAoi(codec.readAoi(polygon));
    expect(result.coordinates[0][2][0]).toBeCloseTo(1);
    expect(result.coordinates[0][2][1]).toBeCloseTo(1);
    expect(() => codec.writeAoi(new Feature(new Point([0, 0])))).toThrow();
    const outer = [[0, 0], [10, 0], [10, 10], [0, 0]];
    const hole = [[2, 2], [3, 2], [3, 3], [2, 2]];
    expect(getBoundaryRings([new Feature(new Polygon([outer, hole])), new Feature(new MultiPolygon([[outer]]))])).toHaveLength(3);
  });
});
