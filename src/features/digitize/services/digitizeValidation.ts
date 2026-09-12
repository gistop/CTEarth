import type { DigitizeFeatureCollection, DigitizeGeometryType, RasterAoiPolygon } from '../types';
import { validateRingTopology } from './geometryTopologyService';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && value.every(number => typeof number === 'number' && Number.isFinite(number));
}

function isLine(value: unknown, minimum = 2): value is number[][] {
  return Array.isArray(value) && value.length >= minimum && value.every(isPosition);
}

function isRing(value: unknown): value is number[][] {
  if (!isLine(value, 4)) return false;
  const first = value[0];
  const last = value[value.length - 1];
  return first.length === last.length && first.every((number, index) => number === last[index]);
}

function isPolygon(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

export function validateGeometry(value: unknown, depth = 0): void {
  if (value === null) return;
  if (!isRecord(value) || depth > 32) throw new Error('要素几何结构无效。');
  const coordinates = value.coordinates;
  const every = (predicate: (item: unknown) => boolean) => Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(predicate);
  let valid = false;
  switch (value.type) {
    case 'Point': valid = isPosition(coordinates); break;
    case 'MultiPoint': valid = every(isPosition); break;
    case 'LineString': valid = isLine(coordinates); break;
    case 'MultiLineString': valid = every(item => isLine(item)); break;
    case 'Polygon':
      valid = isPolygon(coordinates);
      if (isPolygon(coordinates)) coordinates.forEach(ring => validateRingTopology(ring));
      break;
    case 'MultiPolygon':
      valid = every(isPolygon);
      if (valid && Array.isArray(coordinates)) coordinates.forEach(polygon => polygon.forEach((ring: number[][]) => validateRingTopology(ring)));
      break;
    case 'GeometryCollection':
      if (!Array.isArray(value.geometries)) break;
      value.geometries.forEach(geometry => {
        if (geometry === null) throw new Error('几何集合不能包含空几何成员。');
        validateGeometry(geometry, depth + 1);
      });
      valid = true;
      break;
  }
  if (!valid) throw new Error('几何坐标无效：请检查坐标数值、顶点数量和多边形闭合。');
}

export function validateFeatureCollection(value: unknown, geometryType?: DigitizeGeometryType): asserts value is DigitizeFeatureCollection {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) throw new Error('编辑结果必须是 GeoJSON FeatureCollection。');
  value.features.forEach((feature, index) => {
    if (!isRecord(feature) || feature.type !== 'Feature' || !(feature.properties === null || isRecord(feature.properties))) throw new Error('编辑结果含有无效要素或属性。');
    try { validateGeometry(feature.geometry); }
    catch (error) { throw new Error(`第 ${index + 1} 个要素：${error instanceof Error ? error.message : '几何无效。'}`); }
    if (geometryType && isRecord(feature.geometry) && ![geometryType, `Multi${geometryType}`].includes(String(feature.geometry.type))) {
      throw new Error('编辑结果的几何类型与目标图层不一致。');
    }
  });
}

export function copyAoiPolygon(polygon: RasterAoiPolygon): RasterAoiPolygon {
  if (!isRecord(polygon) || polygon.type !== 'Polygon') throw new Error('AOI 必须是多边形。');
  validateGeometry(polygon);
  const ring = polygon.coordinates[0];
  const area = ring.reduce((sum, position, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + position[0] * next[1] - next[0] * position[1];
  }, 0);
  if (Math.abs(area) < 1e-12) throw new Error('AOI 多边形不能退化为点或线。');
  return { type: 'Polygon', coordinates: polygon.coordinates.map(coordinates => coordinates.map(position => [position[0], position[1]])) };
}

export function parseRasterEditValue(value: string) {
  if (!isValidRasterEditValue(value)) throw new Error('请输入有效的像元数值。');
  return Number(value);
}

export function isValidRasterEditValue(value: string) {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value));
}
