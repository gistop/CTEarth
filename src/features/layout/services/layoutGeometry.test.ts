import { describe, expect, it } from 'vitest';
import { clientToPagePoint, constrainRect, dedupeAdjacentPoints, getSelectionBounds, moveRectsTogether, normalizeMmRect, rectIntersectsPolygon, rectIntersectsRect, resizeRect } from './layoutGeometry';

describe('layout geometry', () => {
  it('converts client coordinates to paper millimeters', () => {
    expect(clientToPagePoint(150, 240, 50, 40, 4)).toEqual([25, 50]);
    expect(clientToPagePoint(0, 0, 0, 0, 0)).toBeNull();
    expect(clientToPagePoint(Infinity, 0, 0, 0, 4)).toBeNull();
  });

  it('constrains dimensions before position', () => {
    expect(constrainRect({ x: -10, y: 400, width: 500, height: -20 }, 297, 210))
      .toEqual({ x: 0, y: 204, width: 297, height: 6 });
  });

  it('keeps grouped movement rigid at every paper boundary', () => {
    const rects = { title: { x: 10, y: 20, width: 20, height: 10 }, 'north-arrow': { x: 50, y: 60, width: 10, height: 20 } };
    expect(moveRectsTogether(rects, ['title', 'north-arrow'], 100, 100, 100, 100)).toEqual({
      title: { x: 50, y: 40, width: 20, height: 10 }, 'north-arrow': { x: 90, y: 80, width: 10, height: 20 },
    });
    expect(moveRectsTogether(rects, ['title', 'north-arrow'], -100, -100, 100, 100)).toEqual({
      title: { x: 0, y: 0, width: 20, height: 10 }, 'north-arrow': { x: 40, y: 40, width: 10, height: 20 },
    });
    expect(rects.title.x).toBe(10);
    expect(moveRectsTogether(rects, [], 10, 10, 100, 100)).toEqual({});
  });

  it('resizes without moving the anchor or crossing paper edges', () => {
    const rect = { x: 80, y: 70, width: 10, height: 10 };
    expect(resizeRect(rect, 100, 100, 100, 100)).toEqual({ ...rect, width: 20, height: 30 });
    expect(resizeRect(rect, -100, -100, 100, 100)).toEqual({ ...rect, width: 8, height: 6 });
  });

  it('excludes hidden elements from selection bounds', () => {
    const rects = { title: { x: 10, y: 20, width: 20, height: 10 }, 'north-arrow': { x: 50, y: 60, width: 10, height: 20 } };
    expect(getSelectionBounds(rects, ['title', 'north-arrow'], ['title'])).toEqual(rects.title);
    expect(getSelectionBounds(rects, [], ['title'])).toBeNull();
  });

  it('normalizes reverse rectangle selection and includes touching edges', () => {
    expect(normalizeMmRect([30, 40], [10, 20])).toEqual({ x: 10, y: 20, width: 20, height: 20 });
    expect(rectIntersectsRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 10, width: 3, height: 3 })).toBe(true);
  });

  it('detects polygon containment in either direction and crossing edges', () => {
    const rect = { x: 10, y: 10, width: 10, height: 10 };
    expect(rectIntersectsPolygon(rect, [[0, 0], [30, 0], [30, 30], [0, 30]])).toBe(true);
    expect(rectIntersectsPolygon(rect, [[12, 12], [18, 12], [15, 18]])).toBe(true);
    expect(rectIntersectsPolygon(rect, [[0, 14], [30, 14], [30, 16], [0, 16]])).toBe(true);
    expect(rectIntersectsPolygon(rect, [[30, 30], [40, 30], [30, 40]])).toBe(false);
  });

  it('rejects degenerate polygons and deduplicates adjacent clicks', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectIntersectsPolygon(rect, [[0, 0], [10, 10]])).toBe(false);
    expect(rectIntersectsPolygon(rect, [[0, 0], [5, 5], [10, 10]])).toBe(false);
    expect(dedupeAdjacentPoints([[0, 0], [0.1, 0.1], [10, 10]])).toEqual([[0, 0], [10, 10]]);
  });
});
