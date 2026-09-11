import { describe, expect, it } from 'vitest';
import { boundsFromCoordinates, combineMapBounds, padMapBounds } from './mapViewportService';

describe('mapViewportService', () => {
  it('builds and combines geographic bounds', () => {
    expect(boundsFromCoordinates([[120, 30], [121, 31], [119, 32]])).toEqual([119, 30, 121, 32]);
    expect(combineMapBounds([119, 30, 121, 32], [100, 20, 110, 25])).toEqual([100, 20, 121, 32]);
  });

  it('pads bounds without crossing valid geographic limits', () => {
    expect(padMapBounds([-180, -90, 180, 90], 0.2)).toEqual([-180, -90, 180, 90]);
    expect(padMapBounds([120, 30, 121, 31], 0.1)).toEqual([119.9, 29.9, 121.1, 31.1]);
  });

  it('rejects invalid geographic bounds', () => {
    expect(padMapBounds([121, 30, 120, 31], 0.1)).toBeNull();
    expect(padMapBounds([120, -91, 121, 31], 0.1)).toBeNull();
  });
});

