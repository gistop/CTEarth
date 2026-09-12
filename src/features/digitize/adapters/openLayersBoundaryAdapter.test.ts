import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import { fromLonLat } from 'ol/proj.js';
import { describe, expect, it } from 'vitest';
import { synchronizeSharedBoundaries } from './openLayersBoundaryAdapter';
import { createDigitizeFeatureCodec, getBoundaryRings } from './openLayersDigitizeCodec';
import { completeSharedBoundary, createBoundaryCache } from '../services/sharedBoundaryService';
import { segmentContact, validateRingTopology } from '../services/geometryTopologyService';
import { createRegressionLayer, regressionDraft, regressionRings } from '../testing/sharedBoundaryRegression';
import type { DigitizeCoordinate } from '../types';

const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const neighbor = [[10, 2], [15, 2], [15, 8], [10, 8], [10, 2]];

describe('editable shared boundary synchronization', () => {
  it('exports the supplied third polygon without a spike and with matching shared GeoJSON edges', () => {
    const layer = createRegressionLayer(); const before = structuredClone(layer.geojson);
    const codec = createDigitizeFeatureCodec(); const existing = codec.read(layer.geojson);
    const ring = completeSharedBoundary(regressionDraft(2).map(position => fromLonLat(position)), createBoundaryCache(getBoundaryRings(existing)), 100)!;
    const completed = new Feature(new Polygon([ring]));
    synchronizeSharedBoundaries(existing, completed);
    const output = codec.write([completed, ...existing.slice().reverse()]);
    const rings = output.map(feature => (feature.geometry as { coordinates: DigitizeCoordinate[][] }).coordinates[0]);
    expect(rings[2]).toHaveLength(9);
    expect(rings[2]).not.toContainEqual(regressionRings[0][1]);
    expect(rings[2][6]).toEqual(regressionRings[1][4]); expect(rings[2][7]).toEqual(regressionRings[0][2]);
    expect(rings[0][0]).toEqual(regressionRings[0][0]); expect(rings[1][0]).toEqual(regressionRings[1][0]);
    expect(rings[0]).toContainEqual(rings[2][0]); expect(rings[1]).toContainEqual(rings[2][4]);
    expect(rings[0]).toContainEqual(rings[2][6]); expect(rings[1]).toContainEqual(rings[2][6]);
    rings.forEach(coordinates => expect(() => validateRingTopology(coordinates)).not.toThrow());
    for (let firstIndex = 0; firstIndex < rings.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < rings.length; secondIndex += 1) {
        const first = rings[firstIndex]; const second = rings[secondIndex];
        let sharedEdges = 0;
        for (let firstEdge = 0; firstEdge < first.length - 1; firstEdge += 1) {
          for (let secondEdge = 0; secondEdge < second.length - 1; secondEdge += 1) {
            const contact = segmentContact(first[firstEdge], first[firstEdge + 1], second[secondEdge], second[secondEdge + 1], 1e-12);
            expect(contact?.kind).not.toBe('cross');
            if (contact?.kind !== 'overlap') continue;
            expect([second[secondEdge], second[secondEdge + 1]]).toContainEqual(first[firstEdge]);
            expect([second[secondEdge], second[secondEdge + 1]]).toContainEqual(first[firstEdge + 1]);
            sharedEdges += 1;
          }
        }
        expect(sharedEdges).toBeGreaterThan(0);
      }
    }
    expect(output.every(feature => feature.properties === null && feature.type === 'Feature')).toBe(true);
    const reloaded = codec.read({ type: 'FeatureCollection', features: output });
    expect(codec.write(reloaded)).toEqual(output);
    expect(layer.geojson).toEqual(before);
  });

  it('preserves feature metadata, holes, multipart geometry, extra dimensions and unrelated features', () => {
    const elevated = square.map((position, index) => [...position, [10, 20, 30, 40, 10][index]]);
    const hole = [[2, 2, 10], [4, 2, 10], [4, 4, 10], [2, 2, 10]];
    const distant = elevated.map(position => [position[0] + 50, position[1], position[2]]);
    const feature = new Feature({ geometry: new MultiPolygon([[elevated, hole], [distant]]), name: 'survey' });
    feature.setId('parcel-1');
    const unrelated = new Feature(new Polygon([square.map(position => [position[0] + 100, position[1]])]));
    const untouched = unrelated.getGeometry();
    const completed = new Feature(new Polygon([neighbor]));
    synchronizeSharedBoundaries([feature, unrelated], completed);
    const coordinates = feature.getGeometry()!.getCoordinates();
    expect(coordinates[0][0]).toContainEqual([10, 2, 22]); expect(coordinates[0][0]).toContainEqual([10, 8, 28]);
    expect(coordinates[0][1]).toEqual(hole); expect(coordinates[1]).toEqual([distant]);
    expect(feature.getId()).toBe('parcel-1'); expect(feature.get('name')).toBe('survey');
    expect(unrelated.getGeometry()).toBe(untouched);
    expect(completed.getGeometry()!.getCoordinates()).toEqual([neighbor]);
  });

  it('does not apply any partial geometry changes when a neighboring ring is invalid', () => {
    const valid = new Feature(new Polygon([square]));
    const invalid = new Feature(new Polygon([[[0, 0], [10, 0], [10, 10], [5, 10], [5, 5], [5, 10], [0, 10], [0, 0]]]));
    const completed = new Feature(new Polygon([neighbor]));
    const features = [valid, invalid, completed]; const originals = features.map(feature => feature.getGeometry());
    expect(() => synchronizeSharedBoundaries([valid, invalid], completed)).toThrow(/自交|折返/);
    features.forEach((feature, index) => expect(feature.getGeometry()).toBe(originals[index]));
  });
});
