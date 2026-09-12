import { describe, expect, it } from 'vitest';
import { fromLonLat } from 'ol/proj.js';
import { segmentContact, validateRingTopology } from './geometryTopologyService';
import { regressionRings } from '../testing/sharedBoundaryRegression';

describe('digitize ring topology', () => {
  it('distinguishes touches, crossings, shared edges and disjoint segments', () => {
    expect(segmentContact([0, 0], [10, 0], [5, 0], [5, 5], 1e-6)?.kind).toBe('touch');
    expect(segmentContact([0, 0], [10, 10], [0, 10], [10, 0], 1e-6)).toEqual({ kind: 'cross', points: [[5, 5]] });
    expect(segmentContact([0, 0], [10, 0], [8, 0], [2, 0], 1e-6)?.kind).toBe('overlap');
    expect(segmentContact([0, 0], [10, 0], [10.0002, 0], [20, 0], 1e-6)).toBeNull();
  });

  it('accepts simple concave rings, straight intermediate nodes and either winding', () => {
    const ring = [[0, 0], [5, 0], [10, 0], [10, 10], [5, 5], [0, 10], [0, 0]];
    expect(() => validateRingTopology(ring)).not.toThrow();
    expect(() => validateRingTopology([...ring].reverse())).not.toThrow();
    expect(() => validateRingTopology(ring.map(position => [position[0] + 2e7, position[1] + 6e6]))).not.toThrow();
  });

  it.each([
    [[0, 0], [6, 4], [0, 4], [4, 0], [0, 0]],
    [[0, 0], [6, 0], [3, 0], [3, 4], [0, 4], [0, 0]],
    [[0, 0], [4, 0], [4, 4], [2, 2], [0, 4], [2, 2], [0, 0]],
    [[0, 0], [1, 0], [1, 0], [1, 1], [0, 0]],
    [[0, 0], [1, 0], [2, 0], [0, 0]],
    [[0, 0], [1, 0], [1, 1], [NaN, 0]],
    [[0, 0], [1, 0], [1, 1], [0, 1]],
  ].map(ring => ({ ring })))('rejects invalid ring $ring', ({ ring }) => {
    expect(() => validateRingTopology(ring)).toThrow();
  });

  it('detects the supplied spike in map coordinates and the crossing in GeoJSON', () => {
    regressionRings.slice(0, 2).forEach(ring => expect(() => validateRingTopology(ring)).not.toThrow());
    expect(() => validateRingTopology(regressionRings[2])).toThrow(/自交|折返/);
    expect(() => validateRingTopology(regressionRings[2].map(position => fromLonLat(position)))).toThrow(/自交|折返/);
  });
});
