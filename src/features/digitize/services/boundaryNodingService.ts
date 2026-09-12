import type { DigitizeCoordinate as Coordinate } from '../types';
import { boundaryNodeTolerance, closestSegmentPosition, samePosition, segmentContact } from './geometryTopologyService';

type Segment = { start: Coordinate; end: Coordinate; minX: number; maxX: number; minY: number; maxY: number };

export function nodeBoundaryRings(input: readonly Coordinate[][], insertions: readonly Coordinate[] = []): Coordinate[][] {
  const canonical = new Map<string, Coordinate[]>();
  const nodes: Coordinate[] = [];
  const register = (coordinate: readonly number[]): Coordinate => {
    const gridX = Math.floor(coordinate[0] / boundaryNodeTolerance);
    const gridY = Math.floor(coordinate[1] / boundaryNodeTolerance);
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const match = canonical.get(`${gridX + offsetX},${gridY + offsetY}`)?.find(node => samePosition(node, coordinate, boundaryNodeTolerance));
        if (match) return match;
      }
    }
    const node = [coordinate[0], coordinate[1]];
    const key = `${gridX},${gridY}`;
    canonical.set(key, [...(canonical.get(key) ?? []), node]);
    nodes.push(node);
    return node;
  };
  const rings = input.map(ring => {
    const open = ring.length > 1 && samePosition(ring[0], ring[ring.length - 1], boundaryNodeTolerance) ? ring.slice(0, -1) : ring;
    return open.map(coordinate => [...register(coordinate), ...coordinate.slice(2)]);
  });
  insertions.forEach(register);
  const segments = rings.map(ring => ring.map((start, index): Segment => {
    const end = ring[(index + 1) % ring.length];
    return { start, end, minX: Math.min(start[0], end[0]), maxX: Math.max(start[0], end[0]), minY: Math.min(start[1], end[1]), maxY: Math.max(start[1], end[1]) };
  }));
  const ordered = segments.flat().sort((first, second) => first.minX - second.minX);
  for (let firstIndex = 0; firstIndex < ordered.length; firstIndex += 1) {
    const first = ordered[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < ordered.length; secondIndex += 1) {
      const second = ordered[secondIndex];
      if (second.minX > first.maxX + boundaryNodeTolerance) break;
      const contact = segmentContact(first.start, first.end, second.start, second.end, boundaryNodeTolerance);
      if (contact?.kind === 'cross') contact.points.forEach(register);
    }
  }
  nodes.sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  const lowerBound = (value: number) => {
    let lower = 0; let upper = nodes.length;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (nodes[middle][0] < value) lower = middle + 1; else upper = middle;
    }
    return lower;
  };
  return segments.map(ringSegments => {
    const result: Coordinate[] = [];
    for (const segment of ringSegments) {
      const positions: { ratio: number; coordinate: Coordinate }[] = [];
      for (let index = lowerBound(segment.minX - boundaryNodeTolerance); index < nodes.length && nodes[index][0] <= segment.maxX + boundaryNodeTolerance; index += 1) {
        const coordinate = nodes[index];
        if (coordinate[1] < segment.minY - boundaryNodeTolerance || coordinate[1] > segment.maxY + boundaryNodeTolerance) continue;
        const location = closestSegmentPosition(coordinate, segment.start, segment.end);
        if (location.distance <= boundaryNodeTolerance && location.ratio < 1) positions.push({ ratio: location.ratio, coordinate });
      }
      positions.sort((first, second) => first.ratio - second.ratio);
      for (const position of positions) {
        if (result.length && samePosition(result[result.length - 1], position.coordinate, boundaryNodeTolerance)) continue;
        const extra = segment.start.slice(2).map((value, index) => value + position.ratio * ((segment.end[index + 2] ?? value) - value));
        result.push([...position.coordinate, ...extra]);
      }
    }
    return result.length ? [...result, [...result[0]]] : [];
  });
}
