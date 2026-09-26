import { transform_points_epsg } from 'geolibre-wasm';
import type { RasterOverlay } from '../../../gisStore';
import type { RasterAoiPolygon } from '../types';

type RasterAoiSource = Pick<RasterOverlay, 'coordinates' | 'epsg' | 'geoTransform' | 'height' | 'nodata' | 'pixels' | 'width' | 'displayReprojected'>;

/**
 * Computes AOI hits against the raster grid as it is displayed by OpenLayers.
 *
 * The image is placed in EPSG:3857, so both the raster cell centers and the AOI
 * polygon are evaluated in that projected coordinate system. Pixel values are
 * then resolved back to the source raster when the source CRS is not 4326.
 */
export type RasterAoiPixelMatch = {
  /** 命中格（显示网格）的列号，栅格左上角为 0 列 0 行 */
  cols: Uint32Array;
  /** 命中格的行号 */
  rows: Uint32Array;
  /** 与 cols/rows 等长的像元值 */
  values: Float64Array;
  sourceIndexes: Uint32Array;
  /** 命中格个数 */
  count: number;
  /** 命中格的行列包围盒，用于裁剪几何 */
  bounds: { minCol: number; minRow: number; maxCol: number; maxRow: number } | null;
  /** 需要评估的格数过多，已放弃（结果为空） */
  skipped: boolean;
  /** 命中数达到上限，结果被截断 */
  truncated: boolean;
};

/** 单次框选最多评估的格数 */
export const MAX_AOI_SCAN_PIXELS = 4_000_000;
/** 单次框选最多命中的格数 */
export const MAX_AOI_MATCH_PIXELS = 200_000;
/** 逐格描边的上限，超过则只报告命中数（逐格描边会拖慢渲染） */
export const MAX_AOI_OUTLINE_CELLS = 20_000;
/** 「显示像元值」最多标注的像元数，超过则不标注 */
export const MAX_AOI_VALUE_LABELS = 400;

export function collectRasterAoiPixels(
  aoi: RasterAoiPolygon,
  raster: RasterAoiSource,
  limits: { maxMatches?: number; maxScan?: number } = {},
): RasterAoiPixelMatch {
  const maxMatches = limits.maxMatches ?? MAX_AOI_MATCH_PIXELS;
  const maxScan = limits.maxScan ?? MAX_AOI_SCAN_PIXELS;
  const skippedResult: RasterAoiPixelMatch = {
    cols: new Uint32Array(0),
    rows: new Uint32Array(0),
    values: new Float64Array(0),
    sourceIndexes: new Uint32Array(0),
    count: 0,
    bounds: null,
    skipped: true,
    truncated: false,
  };
  const display = displayGrid(raster.coordinates);

  if (!display || raster.width <= 0 || raster.height <= 0) {
    return skippedResult;
  }

  const spanX = (display.east - display.west) / raster.width;
  const spanY = (display.north - display.south) / raster.height;

  if (!(spanX > 0) || !(spanY > 0)) {
    return skippedResult;
  }

  const projectedAoi = projectRings(aoi.coordinates);
  const aoiBounds = ringBounds(projectedAoi);
  const minCol = clampInteger(Math.floor((aoiBounds[0] - display.west) / spanX) - 1, 0, raster.width - 1);
  const maxCol = clampInteger(Math.ceil((aoiBounds[2] - display.west) / spanX) + 1, 0, raster.width - 1);
  const minRow = clampInteger(Math.floor((display.north - aoiBounds[3]) / spanY) - 1, 0, raster.height - 1);
  const maxRow = clampInteger(Math.ceil((display.north - aoiBounds[1]) / spanY) + 1, 0, raster.height - 1);

  if ((maxCol - minCol + 1) * (maxRow - minRow + 1) > maxScan) {
    return skippedResult;
  }

  const candidateCols: number[] = [];
  const candidateRows: number[] = [];
  const candidateLons: number[] = [];
  const candidateLats: number[] = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    const projectedY = display.north - (row + 0.5) * spanY;

    for (let col = minCol; col <= maxCol; col += 1) {
      const projectedX = display.west + (col + 0.5) * spanX;
      const [longitude, latitude] = webMercatorToLonLat(projectedX, projectedY);

      if (!pointInPolygonRings([projectedX, projectedY], projectedAoi)) {
        continue;
      }

      candidateCols.push(col);
      candidateRows.push(row);
      candidateLons.push(longitude);
      candidateLats.push(latitude);
    }
  }

  if (candidateCols.length === 0) {
    return { ...skippedResult, skipped: false };
  }

  // 第二遍：取每个候选格对应的源像元值（nodata / 越界的格丢弃）
  const { values: resolved, sourceIndexes: resolvedIndexes, truncated } = resolveDisplayValues(raster, candidateCols, candidateRows, candidateLons, candidateLats, maxMatches);
  const cols: number[] = [];
  const rows: number[] = [];
  const values: number[] = [];
  const sourceIndexes: number[] = [];
  let hitMinCol = Number.POSITIVE_INFINITY;
  let hitMaxCol = Number.NEGATIVE_INFINITY;
  let hitMinRow = Number.POSITIVE_INFINITY;
  let hitMaxRow = Number.NEGATIVE_INFINITY;

  candidateCols.forEach((col, index) => {
    const value = resolved[index];

    if (!Number.isFinite(value)) {
      return;
    }

    cols.push(col);
    rows.push(candidateRows[index]);
    values.push(value);
    sourceIndexes.push(resolvedIndexes[index]);
    hitMinCol = Math.min(hitMinCol, col);
    hitMaxCol = Math.max(hitMaxCol, col);
    hitMinRow = Math.min(hitMinRow, candidateRows[index]);
    hitMaxRow = Math.max(hitMaxRow, candidateRows[index]);
  });

  return {
    cols: Uint32Array.from(cols),
    rows: Uint32Array.from(rows),
    values: Float64Array.from(values),
    sourceIndexes: Uint32Array.from(sourceIndexes),
    count: cols.length,
    bounds: cols.length ? { minCol: hitMinCol, minRow: hitMinRow, maxCol: hitMaxCol, maxRow: hitMaxRow } : null,
    skipped: false,
    truncated,
  };
}

/** Display grid in EPSG:3857, matching the OpenLayers image extent. */
function displayGrid(coordinates: RasterOverlay['coordinates']) {
  if (coordinates.length < 4) {
    return null;
  }

  const projected = coordinates.map(([longitude, latitude]) => webMercatorFromLonLat(longitude, latitude));
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  const west = Math.min(...xs);
  const east = Math.max(...xs);
  const south = Math.min(...ys);
  const north = Math.max(...ys);

  return east > west && north > south ? { east, north, south, west } : null;
}

/**
 * 显示格 → 源像元值。
 * 4326（或未声明 CRS）的栅格没有重投影，显示网格就是源网格，直接按行列取值；
 * 其他 CRS 的栅格按与 reprojectRasterForDisplay 相同的换算反查源像元：
 * 显示格心（4326）→ 源 CRS → geoTransform 逆变换 → 源行列。
 */
function resolveDisplayValues(
  raster: RasterAoiSource,
  cols: number[],
  rows: number[],
  lons: number[],
  lats: number[],
  maxMatches: number,
) {
  const total = Math.min(cols.length, maxMatches);
  const values = new Float64Array(cols.length).fill(Number.NaN);
  const sourceIndexes = new Uint32Array(cols.length);

  if (raster.displayReprojected === false || !raster.epsg || raster.epsg === 4326) {
    for (let index = 0; index < total; index += 1) {
      sourceIndexes[index] = rows[index] * raster.width + cols[index];
      values[index] = readSourceValue(raster, sourceIndexes[index]);
    }

    return { values, sourceIndexes, truncated: cols.length > total };
  }

  const inverse = raster.geoTransform.length >= 6 ? invertGeoTransform(raster.geoTransform) : null;

  if (!inverse) {
    throw new Error('GeoTIFF GeoTransform 无效，无法定位显示像元。');
  }

  const points = new Float64Array(total * 2);

  for (let index = 0; index < total; index += 1) {
    points[index * 2] = lons[index];
    points[index * 2 + 1] = lats[index];
  }

  const transformed = transform_points_epsg(4326, raster.epsg, points);

  for (let index = 0; index < total; index += 1) {
    const [column, row] = mapToPixel(inverse, transformed[index * 2], transformed[index * 2 + 1]);
    const sourceCol = Math.floor(column);
    const sourceRow = Math.floor(row);

    if (!Number.isFinite(sourceCol) || !Number.isFinite(sourceRow) || sourceCol < 0 || sourceCol >= raster.width || sourceRow < 0 || sourceRow >= raster.height) {
      continue;
    }

    sourceIndexes[index] = sourceRow * raster.width + sourceCol;
    values[index] = readSourceValue(raster, sourceIndexes[index]);
  }

  return { values, sourceIndexes, truncated: cols.length > total };
}

export function editRasterAoiPixels(aoi: RasterAoiPolygon, raster: RasterAoiSource, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error('请输入有效的像元值。');
  }

  const match = collectRasterAoiPixels(aoi, raster, { maxMatches: Infinity });

  if (match.skipped || match.truncated) {
    throw new Error('AOI 无法完整计算，请缩小范围后重试；未修改任何像元。');
  }

  const pixels = new Float64Array(raster.pixels);
  const indexes = new Set(match.sourceIndexes);

  indexes.forEach(index => { pixels[index] = value; });
  return { pixels, editedCount: indexes.size };
}

export function resolveRasterDisplayPixels(raster: RasterAoiSource) {
  if (raster.displayReprojected === false || !raster.epsg || raster.epsg === 4326) {
    return raster.pixels;
  }

  const display = displayGrid(raster.coordinates);

  if (!display) {
    throw new Error('栅格显示范围无效。');
  }

  const pixels = new Float64Array(raster.width * raster.height);
  const spanX = (display.east - display.west) / raster.width;
  const spanY = (display.north - display.south) / raster.height;

  for (let start = 0; start < pixels.length; start += 65536) {
    const end = Math.min(start + 65536, pixels.length);
    const cols: number[] = [];
    const rows: number[] = [];
    const longitudes: number[] = [];
    const latitudes: number[] = [];

    for (let index = start; index < end; index += 1) {
      const col = index % raster.width;
      const row = Math.floor(index / raster.width);
      const [longitude, latitude] = webMercatorToLonLat(display.west + (col + 0.5) * spanX, display.north - (row + 0.5) * spanY);
      cols.push(col);
      rows.push(row);
      longitudes.push(longitude);
      latitudes.push(latitude);
    }

    pixels.set(resolveDisplayValues(raster, cols, rows, longitudes, latitudes, Infinity).values, start);
  }

  return pixels;
}

function readSourceValue(
  raster: Pick<RasterOverlay, 'nodata' | 'pixels'>,
  index: number,
) {
  const value = raster.pixels[index];

  return Number.isFinite(value) && (raster.nodata === undefined || value !== raster.nodata) ? value : Number.NaN;
}

/** 与 gisStore 的像元定位数学保持一致：geoTransform 为 6 元素仿射矩阵 */
function invertGeoTransform(geoTransform: number[]) {
  const determinant = geoTransform[1] * geoTransform[5] - geoTransform[2] * geoTransform[4];

  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-18) {
    return null;
  }

  return [
    geoTransform[5] / determinant,
    -geoTransform[2] / determinant,
    -geoTransform[4] / determinant,
    geoTransform[1] / determinant,
    geoTransform[0],
    geoTransform[3],
  ];
}

function mapToPixel(inverse: number[], x: number, y: number): [number, number] {
  const dx = x - inverse[4];
  const dy = y - inverse[5];

  return [inverse[0] * dx + inverse[1] * dy, inverse[2] * dx + inverse[3] * dy];
}

function projectRings(rings: [number, number][][]): [number, number][][] {
  return rings.map((ring) => ring.map(([longitude, latitude]) => webMercatorFromLonLat(longitude, latitude)));
}

function ringBounds(rings: [number, number][][]): [number, number, number, number] {
  const points = rings.flat();
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  points.forEach(([x, y]) => {
    west = Math.min(west, x);
    south = Math.min(south, y);
    east = Math.max(east, x);
    north = Math.max(north, y);
  });

  return [west, south, east, north];
}
const WEB_MERCATOR_RADIUS = 6378137;
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798066;

function webMercatorFromLonLat(longitude: number, latitude: number): [number, number] {
  const clampedLatitude = Math.max(-WEB_MERCATOR_MAX_LATITUDE, Math.min(WEB_MERCATOR_MAX_LATITUDE, latitude));
  const latitudeRadians = clampedLatitude * DEGREES_TO_RADIANS;

  return [
    WEB_MERCATOR_RADIUS * longitude * DEGREES_TO_RADIANS,
    WEB_MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
  ];
}

function webMercatorToLonLat(x: number, y: number): [number, number] {
  return [
    x / WEB_MERCATOR_RADIUS * RADIANS_TO_DEGREES,
    (2 * Math.atan(Math.exp(y / WEB_MERCATOR_RADIUS)) - Math.PI / 2) * RADIANS_TO_DEGREES,
  ];
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 射线法，外环命中且不落在任何内环（洞）里才算命中 */
function pointInPolygonRings(point: [number, number], rings: [number, number][][]) {
  const outerRing = rings[0];

  if (!outerRing || !pointInRing(point, outerRing)) {
    return false;
  }

  return !rings.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInRing([x, y]: [number, number], ring: [number, number][]) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}
