import { minElementSize } from '../constants';
import type { LayoutElementId, LayoutPoint, LayoutRect } from '../types';

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function constrainRect(rect: LayoutRect, paperWidth: number, paperHeight: number): LayoutRect {
  const width = clamp(rect.width, minElementSize.width, paperWidth);
  const height = clamp(rect.height, minElementSize.height, paperHeight);
  return { x: clamp(rect.x, 0, paperWidth - width), y: clamp(rect.y, 0, paperHeight - height), width, height };
}

export function moveRect(rect: LayoutRect, deltaX: number, deltaY: number, paperWidth: number, paperHeight: number): LayoutRect {
  return constrainRect({ ...rect, x: rect.x + deltaX, y: rect.y + deltaY }, paperWidth, paperHeight);
}

export function resizeRect(rect: LayoutRect, deltaX: number, deltaY: number, paperWidth: number, paperHeight: number): LayoutRect {
  return {
    ...rect,
    width: clamp(rect.width + deltaX, Math.min(minElementSize.width, paperWidth - rect.x), paperWidth - rect.x),
    height: clamp(rect.height + deltaY, Math.min(minElementSize.height, paperHeight - rect.y), paperHeight - rect.y),
  };
}

export function getSelectionBounds(
  rects: Partial<Record<LayoutElementId, LayoutRect>>,
  elementIds: LayoutElementId[],
  enabledElements: LayoutElementId[] = elementIds,
): LayoutRect | null {
  const selected = elementIds.filter((id) => enabledElements.includes(id)).map((id) => rects[id]).filter((rect): rect is LayoutRect => Boolean(rect));
  if (selected.length === 0) return null;
  const left = Math.min(...selected.map((rect) => rect.x));
  const top = Math.min(...selected.map((rect) => rect.y));
  return {
    x: left, y: top,
    width: Math.max(...selected.map((rect) => rect.x + rect.width)) - left,
    height: Math.max(...selected.map((rect) => rect.y + rect.height)) - top,
  };
}

export function moveRectsTogether(
  rects: Partial<Record<LayoutElementId, LayoutRect>>,
  elementIds: LayoutElementId[],
  deltaX: number,
  deltaY: number,
  paperWidth: number,
  paperHeight: number,
) {
  const bounds = getSelectionBounds(rects, elementIds);
  if (!bounds) return {};
  const horizontal = clamp(deltaX, -bounds.x, paperWidth - bounds.x - bounds.width);
  const vertical = clamp(deltaY, -bounds.y, paperHeight - bounds.y - bounds.height);
  const moved: Partial<Record<LayoutElementId, LayoutRect>> = {};
  elementIds.forEach((id) => {
    const rect = rects[id];
    if (rect) moved[id] = { ...rect, x: rect.x + horizontal, y: rect.y + vertical };
  });
  return moved;
}

export function clientToPagePoint(clientX: number, clientY: number, left: number, top: number, scale: number): LayoutPoint | null {
  if (!(scale > 0) || ![clientX, clientY, left, top, scale].every(Number.isFinite)) return null;
  return [(clientX - left) / scale, (clientY - top) / scale];
}

export function normalizeMmRect(start: LayoutPoint, current: LayoutPoint): LayoutRect {
  return { x: Math.min(start[0], current[0]), y: Math.min(start[1], current[1]), width: Math.abs(current[0] - start[0]), height: Math.abs(current[1] - start[1]) };
}

export function distanceMm(first: LayoutPoint, second: LayoutPoint) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

export function dedupeAdjacentPoints(points: LayoutPoint[]) {
  return points.filter((point, index) => index === 0 || distanceMm(points[index - 1], point) >= 0.5);
}

export function selectElementsByRect(rects: Record<LayoutElementId, LayoutRect>, elementIds: LayoutElementId[], selection: LayoutRect) {
  return elementIds.filter((id) => rectIntersectsRect(rects[id], selection));
}

export function selectElementsByPolygon(rects: Record<LayoutElementId, LayoutRect>, elementIds: LayoutElementId[], polygon: LayoutPoint[]) {
  return elementIds.filter((id) => rectIntersectsPolygon(rects[id], polygon));
}

export function rectIntersectsRect(first: LayoutRect, second: LayoutRect) {
  return first.x <= second.x + second.width && first.x + first.width >= second.x
    && first.y <= second.y + second.height && first.y + first.height >= second.y;
}

export function pointInRect(point: LayoutPoint, rect: LayoutRect) {
  return point[0] >= rect.x && point[0] <= rect.x + rect.width && point[1] >= rect.y && point[1] <= rect.y + rect.height;
}

function orientation(first: LayoutPoint, second: LayoutPoint, third: LayoutPoint) {
  const cross = (second[1] - first[1]) * (third[0] - second[0]) - (second[0] - first[0]) * (third[1] - second[1]);
  return Math.abs(cross) < 1e-9 ? 0 : cross > 0 ? 1 : 2;
}

function onSegment(start: LayoutPoint, point: LayoutPoint, end: LayoutPoint) {
  return orientation(start, point, end) === 0
    && point[0] <= Math.max(start[0], end[0]) && point[0] >= Math.min(start[0], end[0])
    && point[1] <= Math.max(start[1], end[1]) && point[1] >= Math.min(start[1], end[1]);
}

export function segmentsIntersect(firstStart: LayoutPoint, firstEnd: LayoutPoint, secondStart: LayoutPoint, secondEnd: LayoutPoint) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  return (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation)
    || onSegment(firstStart, secondStart, firstEnd) || onSegment(firstStart, secondEnd, firstEnd)
    || onSegment(secondStart, firstStart, secondEnd) || onSegment(secondStart, firstEnd, secondEnd);
}

export function pointInPolygon(point: LayoutPoint, polygon: LayoutPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const start = polygon[previous];
    const end = polygon[index];
    if (onSegment(start, point, end)) return true;
    if ((end[1] > point[1]) !== (start[1] > point[1])
      && point[0] < ((start[0] - end[0]) * (point[1] - end[1])) / (start[1] - end[1]) + end[0]) inside = !inside;
  }
  return inside;
}

export function rectIntersectsPolygon(rect: LayoutRect, polygon: LayoutPoint[]) {
  if (polygon.length < 3) return false;
  const area = polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (Math.abs(area) < 1e-9) return false;
  const corners: LayoutPoint[] = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]];
  if (corners.some((point) => pointInPolygon(point, polygon)) || polygon.some((point) => pointInRect(point, rect))) return true;
  return polygon.some((start, index) => corners.some((corner, cornerIndex) => segmentsIntersect(start, polygon[(index + 1) % polygon.length], corner, corners[(cornerIndex + 1) % corners.length])));
}
