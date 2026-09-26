import Feature from 'ol/Feature.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import type Geometry from 'ol/geom/Geometry.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import type { DigitizeCoordinate, DigitizeFeatureCollection, RasterAoiPolygon } from '../types';
import { copyAoiPolygon, isRecord, validateGeometry } from '../services/digitizeValidation';

const projections = { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' };

export function createDigitizeFeatureCodec() {
  const format = new GeoJSON();
  const originals = new WeakMap<Feature<Geometry>, { feature: Record<string, unknown>; projectedGeometry: string; index: number; anchors: Map<string, number[]> }>();
  const geometry = (feature: Feature<Geometry>) => feature.getGeometry() ? format.writeGeometryObject(feature.getGeometry()!, projections) : null;
  const projectedGeometry = (feature: Feature<Geometry>) => feature.getGeometry() ? format.writeGeometryObject(feature.getGeometry()!) : null;
  return {
    read(collection: DigitizeFeatureCollection) {
      return collection.features.map((value, index) => {
        if (!isRecord(value) || value.type !== 'Feature') throw new Error('图层含有无效 GeoJSON 要素。');
        if (value.geometry !== null && !isRecord(value.geometry)) throw new Error('要素缺少有效几何结构。');
        const feature = new Feature<Geometry>();
        if (value.geometry !== null) feature.setGeometry(format.readGeometry(value.geometry, projections));
        // 保留属性到要素上，供参考图层/编辑图层的字段标注读取
        if (isRecord(value.properties)) {
          Object.entries(value.properties as Record<string, unknown>)
            .filter(([key]) => key !== 'geometry')
            .forEach(([key, property]) => feature.set(key, property));
        }
        const projected = projectedGeometry(feature);
        const anchors = new Map<string, number[]>();
        visitGeometryPositions(projected, value.geometry, (position, original) => anchors.set(positionKey(position), original.slice(0, 2)));
        originals.set(feature, { feature: structuredClone(value), projectedGeometry: JSON.stringify(projected), index, anchors });
        return feature;
      });
    },
    write(features: Feature<Geometry>[]) {
      const entries = features.map(feature => {
        const original = originals.get(feature); const projected = projectedGeometry(feature);
        return { feature, original, projected, unchanged: original && JSON.stringify(projected) === original.projectedGeometry };
      }).sort((first, second) => (first.original?.index ?? Infinity) - (second.original?.index ?? Infinity));
      entries.forEach((entry, index) => {
        try { validateGeometry(entry.projected); }
        catch (error) { throw new Error(`第 ${index + 1} 个要素：${error instanceof Error ? error.message : '几何无效。'}`); }
      });
      const anchors = new Map<string, number[]>();
      for (const entry of [...entries].sort((first, second) => Number(Boolean(second.unchanged)) - Number(Boolean(first.unchanged)))) {
        entry.original?.anchors.forEach((position, key) => { if (!anchors.has(key)) anchors.set(key, position); });
      }
      return entries.map(({ feature, original, projected, unchanged }) => {
        if (unchanged) return structuredClone(original!.feature);
        const nextGeometry = geometry(feature);
        visitGeometryPositions(projected, nextGeometry, (position, output) => {
          const key = positionKey(position);
          const anchor = anchors.get(key);
          if (anchor) { output[0] = anchor[0]; output[1] = anchor[1]; }
          else anchors.set(key, output.slice(0, 2));
        });
        if (!original) return { ...format.writeFeatureObject(feature, projections), geometry: nextGeometry };
        const next: Record<string, unknown> = { ...structuredClone(original.feature), geometry: nextGeometry };
        delete next.bbox;
        return next;
      });
    },
    readAoi(polygon: RasterAoiPolygon) {
      return new Feature(format.readGeometry(polygon, projections));
    },
    writeAoi(feature: Feature<Geometry>): RasterAoiPolygon {
      return copyAoiPolygon(geometry(feature) as RasterAoiPolygon);
    },
  };
}

function positionKey(position: number[]) { return `${position[0]},${position[1]}`; }

function visitGeometryPositions(first: unknown, second: unknown, visit: (first: number[], second: number[]) => void): void {
  if (!isRecord(first) || !isRecord(second)) return;
  if (first.type === 'GeometryCollection' && Array.isArray(first.geometries) && Array.isArray(second.geometries)) {
    const geometries = second.geometries;
    first.geometries.forEach((geometry, index) => visitGeometryPositions(geometry, geometries[index], visit));
    return;
  }
  const walk = (first: unknown, second: unknown): void => {
    if (!Array.isArray(first) || !Array.isArray(second)) return;
    if (typeof first[0] === 'number' && typeof second[0] === 'number') { visit(first, second); return; }
    first.forEach((coordinates, index) => walk(coordinates, second[index]));
  };
  walk(first.coordinates, second.coordinates);
}

export function getBoundaryRings(features: Feature<Geometry>[]): DigitizeCoordinate[][] {
  return features.flatMap(feature => {
    const geometry = feature.getGeometry();
    if (geometry instanceof Polygon) return geometry.getCoordinates();
    if (geometry instanceof MultiPolygon) return geometry.getCoordinates().flatMap(polygon => polygon);
    return [];
  });
}
