import { describe, expect, it } from 'vitest';
import { nodeBoundaryRings } from './boundaryNodingService';
import { validateRingTopology } from './geometryTopologyService';

const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

describe('boundary noding', () => {
  it('splits a long edge at a neighboring vertex and overlapping edge endpoints', () => {
    const neighbor = [[10, 2], [15, 2], [15, 8], [10, 8], [10, 2]];
    const result = nodeBoundaryRings([square, neighbor]);
    expect(result[0]).toEqual([[0, 0], [10, 0], [10, 2], [10, 8], [10, 10], [0, 10], [0, 0]]);
    expect(result[1]).toEqual(neighbor);
    result.forEach(ring => expect(() => validateRingTopology(ring)).not.toThrow());
  });

  it('inserts two stroke endpoints on the same segment in order without leaving a shortcut', () => {
    expect(nodeBoundaryRings([square], [[10, 8], [10, 2]])[0]).toEqual([[0, 0], [10, 0], [10, 2], [10, 8], [10, 10], [0, 10], [0, 0]]);
  });

  it('nodes crossings on both rings without relying on equal endpoint keys', () => {
    const other = [[5, -5], [15, -5], [15, 5], [5, 5], [5, -5]];
    const result = nodeBoundaryRings([square, other]);
    result.forEach(ring => {
      expect(ring).toContainEqual([5, 0]); expect(ring).toContainEqual([10, 5]);
      expect(() => validateRingTopology(ring)).not.toThrow();
    });
  });

  it('canonicalizes projection roundoff without quantizing coordinates or closing real gaps', () => {
    const ring = [[10 + 1e-9, 2], [15, 2], [15, 8], [10 + 1e-9, 8], [10 + 1e-9, 2]];
    const result = nodeBoundaryRings([square, ring]);
    expect(result[0]).toContainEqual(ring[0]);
    expect(result[1][0]).toEqual(ring[0]);
    const separated = square.map(position => [position[0] + 10.0002, position[1]]);
    expect(nodeBoundaryRings([square, separated])).toEqual([square, separated]);
  });

  it('preserves source data, ring direction and per-ring extra dimensions', () => {
    const first = square.map((position, index) => [...position, [10, 20, 30, 40, 10][index]]);
    const second = [[10, 2, 80], [15, 2, 90], [15, 8, 90], [10, 8, 80], [10, 2, 80]];
    const input = [first, second]; const before = structuredClone(input);
    const result = nodeBoundaryRings(input);
    expect(input).toEqual(before);
    expect(result[0]).toContainEqual([10, 2, 22]); expect(result[0]).toContainEqual([10, 8, 28]);
    expect(result[1]).toEqual(second);
    expect(nodeBoundaryRings([square.slice().reverse()], [[10, 2]])[0]).toEqual([[0, 0], [0, 10], [10, 10], [10, 2], [10, 0], [0, 0]]);
  });

  it('handles empty rings and removes collapsed adjacent nodes', () => {
    expect(nodeBoundaryRings([])).toEqual([]); expect(nodeBoundaryRings([[]])).toEqual([[]]);
    expect(nodeBoundaryRings([[[0, 0], ...square]])).toEqual([square]);
  });
});
