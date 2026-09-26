// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { fromLonLat, toLonLat, transform } from 'ol/proj.js';
import { collectRasterAoiPixels, editRasterAoiPixels, resolveRasterDisplayPixels } from './rasterAoiPixels';
import type { RasterAoiPolygon } from '../types';

vi.mock('geolibre-wasm', () => ({
  transform_points_epsg: (source: number, target: number, points: Float64Array) => {
    const result = new Float64Array(points.length);
    for (let index = 0; index < points.length; index += 2) {
      result.set(transform([points[index], points[index + 1]], `EPSG:${source}`, `EPSG:${target}`), index);
    }
    return result;
  },
}));

/**
 * 4 x 4、EPSG:4326 的栅格：显示网格就是源网格，纬度 0~4、经度 0~4，
 * 格心分别在经度 0.5/1.5/2.5/3.5、纬度 3.5/2.5/1.5/0.5，像元值 1..16（行优先）。
 */
function createRaster(overrides: Partial<Parameters<typeof collectRasterAoiPixels>[1]> = {}) {
  return {
    width: 4,
    height: 4,
    epsg: 4326,
    coordinates: [[0, 4], [4, 4], [4, 0], [0, 0]] as [number, number][],
    geoTransform: [0, 1, 0, 4, 0, -1],
    pixels: Float64Array.from({ length: 16 }, (_, index) => index + 1),
    ...overrides,
  } as Parameters<typeof collectRasterAoiPixels>[1];
}

/** 覆盖 (1,1)-(3,3) 的方框：格心落在其中的是列 1..2、行 1..2 */
const centerBox: RasterAoiPolygon = { type: 'Polygon', coordinates: [[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };

describe('collectRasterAoiPixels', () => {
  it('selects display-grid cells whose centre falls inside the AOI', () => {
    const match = collectRasterAoiPixels(centerBox, createRaster());

    expect(match.count).toBe(4);
    expect(Array.from(match.cols)).toEqual([1, 2, 1, 2]);
    expect(Array.from(match.rows)).toEqual([1, 1, 2, 2]);
    expect(Array.from(match.values)).toEqual([6, 7, 10, 11]);
    expect(match.bounds).toEqual({ minCol: 1, minRow: 1, maxCol: 2, maxRow: 2 });
    expect(match.skipped).toBe(false);
    expect(match.truncated).toBe(false);
  });

  it('uses the projected display grid rather than linear latitude rows', () => {
    const raster = createRaster({
      coordinates: [[0, 44], [4, 44], [4, 40], [0, 40]],
      geoTransform: [0, 1, 0, 44, 0, -1],
    });
    const aoi: RasterAoiPolygon = { type: 'Polygon', coordinates: [[[0, 42.52], [4, 42.52], [4, 42.54], [0, 42.54], [0, 42.52]]] };
    const match = collectRasterAoiPixels(aoi, raster);

    expect(Array.from(match.cols)).toEqual([0, 1, 2, 3]);
    expect(Array.from(match.rows)).toEqual([1, 1, 1, 1]);
    expect(Array.from(match.values)).toEqual([5, 6, 7, 8]);
  });
  it('skips nodata and non-finite pixels', () => {
    const pixels = createRaster().pixels;
    pixels[5] = Number.NaN;
    const match = collectRasterAoiPixels(centerBox, createRaster({ pixels, nodata: 10 }));

    expect(Array.from(match.values)).toEqual([7, 11]);
    expect(match.count).toBe(2);
  });

  it('excludes cells inside an inner ring (hole)', () => {
    const withHole: RasterAoiPolygon = {
      type: 'Polygon',
      coordinates: [
        [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
        // 洞只压住 (列 1, 行 2) 的格心 (1.5, 1.5)，该格值 10 应被排除
        [[1.2, 1.2], [1.8, 1.2], [1.8, 1.8], [1.2, 1.8], [1.2, 1.2]],
      ],
    };
    const match = collectRasterAoiPixels(withHole, createRaster());

    expect(match.count).toBe(3);
    expect(Array.from(match.values)).toEqual([6, 7, 11]);
  });

  it('truncates when the match limit is reached', () => {
    const match = collectRasterAoiPixels(centerBox, createRaster(), { maxMatches: 2 });

    expect(match.count).toBe(2);
    expect(match.truncated).toBe(true);
  });

  it('gives up when the AOI would require scanning too many cells', () => {
    const match = collectRasterAoiPixels(centerBox, createRaster(), { maxScan: 4 });

    expect(match).toMatchObject({ count: 0, skipped: true, bounds: null });
  });

  it('gives up on a degenerate display grid', () => {
    const match = collectRasterAoiPixels(centerBox, createRaster({ coordinates: [[0, 0], [0, 0], [0, 0], [0, 0]] }));

    expect(match).toMatchObject({ count: 0, skipped: true });
  });

  it('treats a missing raster EPSG as EPSG:4326 like the raster coordinates do', () => {
    const match = collectRasterAoiPixels(centerBox, createRaster({ epsg: undefined }));

    expect(match.count).toBe(4);
  });
});

describe('editRasterAoiPixels', () => {
  function highLatitudeRaster() {
    return createRaster({
      coordinates: [[0, 80], [4, 80], [4, 60], [0, 60]],
      geoTransform: [0, 1, 0, 80, 0, -5],
    });
  }

  function lowerRowAoi(): RasterAoiPolygon {
    const north = fromLonLat([0, 80])[1];
    const south = fromLonLat([0, 60])[1];
    const span = (north - south) / 4;
    const latitude = toLonLat([0, north - 2.5 * span])[1];
    return { type: 'Polygon', coordinates: [[[0, latitude - 0.1], [4, latitude - 0.1], [4, latitude + 0.1], [0, latitude + 0.1], [0, latitude - 0.1]]] };
  }

  it('writes 500 to exactly the highlighted cells, without shifting north or mutating the source', () => {
    const raster = highLatitudeRaster();
    const aoi = lowerRowAoi();
    const before = raster.pixels.slice();
    const selected = collectRasterAoiPixels(aoi, raster);
    expect(Array.from(selected.sourceIndexes)).toEqual([8, 9, 10, 11]);

    const edited = editRasterAoiPixels(aoi, raster, 500);
    expect(edited.editedCount).toBe(4);
    expect(raster.pixels).toEqual(before);
    edited.pixels.forEach((value, index) => {
      expect(value).toBe(index >= 8 && index <= 11 ? 500 : before[index]);
    });
    const result = { ...raster, pixels: edited.pixels };
    expect(Array.from(collectRasterAoiPixels(aoi, result).values)).toEqual([500, 500, 500, 500]);
    expect(resolveRasterDisplayPixels(result)).toEqual(edited.pixels);
    expect(Array.from(editRasterAoiPixels(aoi, result, 600).pixels.slice(8, 12))).toEqual([600, 600, 600, 600]);
  });

  it('shares source indexes with resampled display values and preserves the output grid', () => {
    const north = fromLonLat([0, 80])[1];
    const south = fromLonLat([0, 60])[1];
    const width = fromLonLat([4, 0])[0];
    const raster = createRaster({
      ...highLatitudeRaster(),
      epsg: 3857,
      displayReprojected: true,
      geoTransform: [0, width / 4, 0, north, 0, -(north - south) / 2],
    });
    const aoi = lowerRowAoi();
    const match = collectRasterAoiPixels(aoi, raster);
    expect(Array.from(match.rows)).toEqual([2, 2, 2, 2]);
    expect(Array.from(match.sourceIndexes)).toEqual([4, 5, 6, 7]);
    const edited = editRasterAoiPixels(aoi, raster, 500);
    expect(Array.from(edited.pixels.slice(4, 8))).toEqual([500, 500, 500, 500]);
    expect(Array.from(edited.pixels.slice(8, 12))).toEqual([9, 10, 11, 12]);
    const display = resolveRasterDisplayPixels({ ...raster, pixels: edited.pixels });
    expect(Array.from(display.slice(8, 12))).toEqual([500, 500, 500, 500]);
    expect(Array.from(collectRasterAoiPixels(aoi, { ...raster, pixels: edited.pixels }).values)).toEqual([500, 500, 500, 500]);

    const all: RasterAoiPolygon = { type: 'Polygon', coordinates: [[[0, 60], [4, 60], [4, 80], [0, 80], [0, 60]]] };
    expect(editRasterAoiPixels(all, raster, 500).editedCount).toBe(8);
  });

  it('uses direct source rows when a projected raster image has not been resampled', () => {
    const raster = { ...highLatitudeRaster(), epsg: 3857, displayReprojected: false };
    const match = collectRasterAoiPixels(lowerRowAoi(), raster);
    expect(Array.from(match.sourceIndexes)).toEqual([8, 9, 10, 11]);
    expect(resolveRasterDisplayPixels(raster)).toBe(raster.pixels);
  });

  it('preserves nodata, holes and outside cells', () => {
    const raster = createRaster({ nodata: 10 });
    raster.pixels[5] = NaN;
    const aoi: RasterAoiPolygon = { ...centerBox, coordinates: [...centerBox.coordinates, [[2.2, 1.2], [2.8, 1.2], [2.8, 1.8], [2.2, 1.8], [2.2, 1.2]]] };
    const edited = editRasterAoiPixels(aoi, raster, 500);
    expect(edited.editedCount).toBe(1);
    expect(edited.pixels[6]).toBe(500);
    expect(edited.pixels[5]).toBeNaN();
    expect(edited.pixels[9]).toBe(10);
    expect(edited.pixels[10]).toBe(11);
    expect(edited.pixels[0]).toBe(1);
  });

  it('does not silently apply the preview match limit to edits', () => {
    const raster = createRaster({
      width: 450, height: 450, pixels: new Float64Array(450 * 450).fill(1),
    });
    const aoi: RasterAoiPolygon = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] };
    expect(collectRasterAoiPixels(aoi, raster).truncated).toBe(true);
    const result = editRasterAoiPixels(aoi, raster, 500);
    expect(result.editedCount).toBe(450 * 450);
    expect(result.pixels.every(value => value === 500)).toBe(true);
  });

  it('rejects incomplete selections and invalid values before changing the source', () => {
    const raster = createRaster();
    expect(() => editRasterAoiPixels(centerBox, raster, NaN)).toThrow();
    expect(() => editRasterAoiPixels(centerBox, { ...raster, width: 10000, height: 10000 }, 500)).toThrow('未修改任何像元');
    expect(Array.from(raster.pixels)).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
  });
});
