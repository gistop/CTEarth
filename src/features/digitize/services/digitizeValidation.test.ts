import { describe, expect, it } from 'vitest';
import { copyAoiPolygon, isValidRasterEditValue, parseRasterEditValue, validateFeatureCollection, validateGeometry } from './digitizeValidation';
import type { RasterAoiPolygon } from '../types';

const ring = [[0, 0], [2, 0], [2, 2], [0, 0]];
describe('digitize input validation', () => {
  it('accepts supported single, multi and collection geometries without modifying them', () => {
    const geometries = [
      null, { type: 'Point', coordinates: [0, 0, 100] }, { type: 'MultiPoint', coordinates: [[0, 0], [1, 1]] },
      { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]] },
      { type: 'Polygon', coordinates: [ring] }, { type: 'MultiPolygon', coordinates: [[ring]] },
      { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }] },
    ];
    const original = structuredClone(geometries);
    geometries.forEach(geometry => expect(() => validateGeometry(geometry)).not.toThrow());
    expect(geometries).toEqual(original);
  });

  it('rejects nonfinite positions, insufficient vertices, unclosed rings and invalid collections', () => {
    [undefined, { type: 'Circle', coordinates: [0, 0] }, { type: 'Point', coordinates: [Infinity, 0] },
      { type: 'Point', coordinates: ['0', 0] }, { type: 'LineString', coordinates: [[0, 0]] },
      { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
      { type: 'GeometryCollection', geometries: [null] },
    ].forEach(geometry => expect(() => validateGeometry(geometry)).toThrow());
    const recursive = { type: 'GeometryCollection', geometries: [] as unknown[] };
    recursive.geometries.push(recursive); expect(() => validateGeometry(recursive)).toThrow('结构无效');
  });

  it('enforces feature shape and declared geometry family', () => {
    expect(() => validateFeatureCollection({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[ring]] } }] }, 'Polygon')).not.toThrow();
    expect(() => validateFeatureCollection({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: [], geometry: null }] })).toThrow('属性');
    expect(() => validateFeatureCollection({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates: [ring] } }] }, 'Point')).toThrow('类型');
  });

  it('copies valid AOI and rejects zero-area AOI', () => {
    const polygon: RasterAoiPolygon = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] };
    const copy = copyAoiPolygon(polygon); polygon.coordinates[0][0][0] = 9;
    expect(copy.coordinates[0][0][0]).toBe(0);
    expect(() => copyAoiPolygon({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]] })).toThrow('退化');
  });

  it('distinguishes zero and negative raster values from empty or invalid input', () => {
    expect(parseRasterEditValue('0')).toBe(0); expect(parseRasterEditValue('-12.5')).toBe(-12.5);
    ['', '  ', 'NaN', 'Infinity', '1e309', 'abc'].forEach(value => {
      expect(isValidRasterEditValue(value)).toBe(false); expect(() => parseRasterEditValue(value)).toThrow('像元');
    });
  });
});
