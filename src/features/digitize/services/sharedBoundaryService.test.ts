import { describe, expect, it } from 'vitest';
import { fromLonLat } from 'ol/proj.js';
import { completeSharedBoundary, createBoundaryCache } from './sharedBoundaryService';
import { samePosition, validateRingTopology } from './geometryTopologyService';
import { regressionDraft, regressionRings } from '../testing/sharedBoundaryRegression';

const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

describe('shared boundary completion', () => {
  it('inserts the shortest existing boundary path between the stroke endpoints', () => {
    const cache = createBoundaryCache([square]);
    const result = completeSharedBoundary([[2, 0], [2, -5], [15, -5], [15, 8], [10, 8], [2, 0]], cache, 0.1);
    expect(result).toEqual([[2, 0], [2, -5], [15, -5], [15, 8], [10, 8], [10, 0], [2, 0]]);
  });

  it('snaps endpoints within the supplied map-unit tolerance', () => {
    const ring = [[10.2, 2], [15, 2], [15, 8], [10.2, 8], [10.2, 2]];
    const cache = createBoundaryCache([square]);
    expect(completeSharedBoundary(ring, cache, 0.1)).toBeNull();
    expect(completeSharedBoundary(ring, cache, 0.3)).toEqual([[10, 2], [15, 2], [15, 8], [10, 8], [10, 2]]);
  });

  it('does not mutate input coordinates or cached paths across strokes', () => {
    const input = structuredClone(square);
    const cache = createBoundaryCache([input]);
    input[0][0] = 99;
    const before = JSON.stringify(cache);
    const ring = [[10, 2], [15, 2], [15, 8], [10, 8], [10, 2]];
    const original = structuredClone(ring);
    const first = completeSharedBoundary(ring, cache, 1)!;
    first[0][0] = 200;
    expect(completeSharedBoundary(ring, cache, 1)![0]).toEqual([10, 2]);
    expect(JSON.stringify(cache)).toBe(before);
    expect(ring).toEqual(original);
  });

  it('uses polygon hole boundaries and rejects disconnected paths', () => {
    const outer = [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]];
    const hole = [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]];
    const cache = createBoundaryCache([outer, hole]);
    expect(completeSharedBoundary([[5, 7], [8, 7], [8, 12], [5, 12], [5, 7]], cache, 0.1)).not.toBeNull();
    expect(completeSharedBoundary([[0, 7], [3, 7], [3, 12], [5, 12], [0, 7]], cache, 0.1)).toBeNull();
  });

  it('handles empty, invalid and degenerate input without engine objects', () => {
    const cache = createBoundaryCache([[], [[NaN, 0]], square]);
    expect(cache.rings).toHaveLength(1);
    expect(completeSharedBoundary([], cache, 1)).toBeNull();
    expect(completeSharedBoundary([[0, 0], [0, 0], [0, 0], [0, 0]], cache, 1)).toBeNull();
    expect(completeSharedBoundary(square, createBoundaryCache([]), 1)).toBeNull();
    expect(() => completeSharedBoundary(square, cache, -1)).toThrow();
  });

  it.each([false, true])('joins the supplied two-polygon boundary without the third polygon spike (reversed=%s)', reversed => {
    const boundaries = regressionRings.slice(0, 2).map(ring => (reversed ? [...ring].reverse() : ring).map(position => fromLonLat(position)));
    const cache = createBoundaryCache(boundaries);
    const result = completeSharedBoundary(regressionDraft(2).map(position => fromLonLat(position)), cache, 100)!;
    expect(result).toHaveLength(9);
    expect(() => validateRingTopology(result)).not.toThrow();
    expect(result.some(position => samePosition(position, fromLonLat(regressionRings[0][1]), 1e-6))).toBe(false);
    expect(samePosition(result[6], fromLonLat(regressionRings[1][4]), 1e-6)).toBe(true);
    expect(samePosition(result[7], fromLonLat(regressionRings[0][2]), 1e-6)).toBe(true);
    expect(() => validateRingTopology(regressionRings[2].map(position => fromLonLat(position)))).toThrow(/自交|折返/);
  });

  it('chooses a safe alternative when the shortest boundary crosses the stroke', () => {
    const stroke = [[10, 2], [12, 2], [12, 5], [8, 5], [8, 7], [12, 7], [12, 8], [10, 8], [10, 2]];
    const result = completeSharedBoundary(stroke, createBoundaryCache([square]), 0.1)!;
    expect(result.slice(-5)).toEqual([[10, 10], [0, 10], [0, 0], [10, 0], [10, 2]]);
    expect(() => validateRingTopology(result)).not.toThrow();
  });

  it('reports a failed trace rather than returning an invalid polygon', () => {
    const stroke = [[0, 2], [4, 2], [4, -2], [6, -2], [6, 12], [8, 12], [8, 8], [10, 8], [0, 2]];
    expect(() => completeSharedBoundary(stroke, createBoundaryCache([square]), 0.1)).toThrow('无法安全补齐');
    const repeated = [[2, 0], [2, 0], [2, -5], [15, -5], [15, 8], [10, 8], [2, 0]];
    expect(() => completeSharedBoundary(repeated, createBoundaryCache([square]), 0.1)).toThrow(/重复节点|无法安全补齐/);
  });

  it('keeps real sub-millimeter gaps disconnected regardless of snapping tolerance', () => {
    const other = square.map(position => [position[0] + 10.0002, position[1]]);
    const stroke = [[10, 2], [9, -2], [12, -2], [10.0002, 8], [10, 2]];
    expect(completeSharedBoundary(stroke, createBoundaryCache([square, other]), 100)).toBeNull();
  });

  it('does not inject boundary altitude into a two-dimensional drawing', () => {
    const elevated = square.map(position => [...position, 100]);
    const stroke = [[2, 0], [2, -5], [15, -5], [15, 8], [10, 8], [2, 0]];
    const result = completeSharedBoundary(stroke, createBoundaryCache([elevated]), 0.1)!;
    expect(result.every(position => position.length === 2)).toBe(true);
    expect(result).toEqual([[2, 0], [2, -5], [15, -5], [15, 8], [10, 8], [10, 0], [2, 0]]);
  });

  it('retains drawing endpoint altitude and refuses to invent missing boundary dimensions', () => {
    const stroke = [[2, 0, 10], [2, -5, 10], [15, -5, 10], [15, 8, 10], [10, 8, 10], [2, 0, 10]];
    const result = completeSharedBoundary(stroke, createBoundaryCache([square.map(position => [...position, 100])]), 0.1)!;
    expect(result[0]).toEqual(stroke[0]); expect(result[result.length - 1]).toEqual(stroke[0]);
    expect(result[result.length - 2]).toEqual([10, 0, 100]);
    expect(() => completeSharedBoundary(stroke, createBoundaryCache([square]), 0.1)).toThrow('附加坐标');
  });
});
