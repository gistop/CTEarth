import type { DigitizeCoordinate as Coordinate } from '../types';

export type SegmentContact = { kind: 'touch' | 'cross' | 'overlap'; points: Coordinate[] };
export const boundaryNodeTolerance = 1e-6;

export function samePosition(first: readonly number[], second: readonly number[], tolerance = 0) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]) <= tolerance;
}

export function closestSegmentPosition(position: readonly number[], start: readonly number[], end: readonly number[]) {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((position[0] - start[0]) * deltaX + (position[1] - start[1]) * deltaY) / lengthSquared));
  const coordinate = ratio === 0 ? [...start] : ratio === 1 ? [...end] : [start[0] + deltaX * ratio, start[1] + deltaY * ratio];
  return { coordinate, ratio, distance: Math.hypot(position[0] - coordinate[0], position[1] - coordinate[1]) };
}

export function segmentContact(firstStart: readonly number[], firstEnd: readonly number[], secondStart: readonly number[], secondEnd: readonly number[], tolerance: number): SegmentContact | null {
  if (Math.max(firstStart[0], firstEnd[0]) + tolerance < Math.min(secondStart[0], secondEnd[0])
    || Math.max(secondStart[0], secondEnd[0]) + tolerance < Math.min(firstStart[0], firstEnd[0])
    || Math.max(firstStart[1], firstEnd[1]) + tolerance < Math.min(secondStart[1], secondEnd[1])
    || Math.max(secondStart[1], secondEnd[1]) + tolerance < Math.min(firstStart[1], firstEnd[1])) return null;
  const contacts: Coordinate[] = [];
  for (const [position, start, end] of [[firstStart, secondStart, secondEnd], [firstEnd, secondStart, secondEnd], [secondStart, firstStart, firstEnd], [secondEnd, firstStart, firstEnd]]) {
    if (closestSegmentPosition(position, start, end).distance <= tolerance && !contacts.some(existing => samePosition(position, existing, tolerance))) contacts.push([position[0], position[1]]);
  }
  if (contacts.length) return { kind: contacts.length > 1 ? 'overlap' : 'touch', points: contacts };
  const firstX = firstEnd[0] - firstStart[0]; const firstY = firstEnd[1] - firstStart[1];
  const secondX = secondEnd[0] - secondStart[0]; const secondY = secondEnd[1] - secondStart[1];
  const denominator = firstX * secondY - firstY * secondX;
  if (denominator === 0 || !Number.isFinite(denominator)) return null;
  const deltaX = secondStart[0] - firstStart[0]; const deltaY = secondStart[1] - firstStart[1];
  const firstRatio = (deltaX * secondY - deltaY * secondX) / denominator;
  const secondRatio = (deltaX * firstY - deltaY * firstX) / denominator;
  if (firstRatio <= 0 || firstRatio >= 1 || secondRatio <= 0 || secondRatio >= 1) return null;
  return { kind: 'cross', points: [[firstStart[0] + firstRatio * firstX, firstStart[1] + firstRatio * firstY]] };
}

export function ringTolerance(ring: readonly Coordinate[]) {
  let magnitude = 1;
  for (const position of ring) magnitude = Math.max(magnitude, Math.abs(position[0]), Math.abs(position[1]));
  return magnitude * Number.EPSILON * 32;
}

export function validateRingTopology(ring: readonly Coordinate[], tolerance = ringTolerance(ring)): void {
  if (ring.length < 4 || !ring.every(position => position.length >= 2 && position.every(Number.isFinite)) || !samePosition(ring[0], ring[ring.length - 1], tolerance)) throw new Error('多边形边界未闭合或坐标无效。');
  const origin = ring[0];
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = ring[index]; const end = ring[index + 1];
    if (samePosition(start, end, tolerance)) throw new Error('多边形存在重复节点或退化边。');
    area += (start[0] - origin[0]) * (end[1] - origin[1]) - (end[0] - origin[0]) * (start[1] - origin[1]);
  }
  if (!Number.isFinite(area) || Math.abs(area) <= tolerance * tolerance) throw new Error('多边形边界退化或自交，无法提交。');
  for (let firstIndex = 0; firstIndex < ring.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < ring.length - 1; secondIndex += 1) {
      const contact = segmentContact(ring[firstIndex], ring[firstIndex + 1], ring[secondIndex], ring[secondIndex + 1], tolerance);
      if (!contact) continue;
      const adjacent = secondIndex === firstIndex + 1 || (firstIndex === 0 && secondIndex === ring.length - 2);
      if (!adjacent || contact.kind !== 'touch') throw new Error(`多边形第 ${firstIndex + 1} 与第 ${secondIndex + 1} 条边存在自交、折返或重复边，未提交。`);
    }
  }
}
