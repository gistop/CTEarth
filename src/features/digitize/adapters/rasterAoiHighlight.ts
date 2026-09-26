import Feature from 'ol/Feature.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import Point from 'ol/geom/Point.js';
import { MAX_AOI_OUTLINE_CELLS, MAX_AOI_VALUE_LABELS, type RasterAoiPixelMatch } from '../services/rasterAoiPixels';

export type RasterExtent3857 = [number, number, number, number];

/**
 * 命中格 → 地图几何。
 *
 * 与栅格贴图共用同一套轴对齐映射：extent 的左上角对应第 0 行第 0 列，每格 spanX × spanY。
 * 输出的是**只描边不填充**的逐格轮廓（描边宽度按屏幕像素给），所以：
 * - 与显示的像元一一重合；
 * - 放大时线宽不变，不会像位图描边那样被放大成粗带；
 * - 像元内容仍然可见，不会被色块盖住。
 */
export function createRasterAoiOutlineFeature(
  match: RasterAoiPixelMatch,
  extent: RasterExtent3857,
  rasterWidth: number,
  rasterHeight: number,
  limit = MAX_AOI_OUTLINE_CELLS,
) {
  if (!match.count || match.count > limit || rasterWidth <= 0 || rasterHeight <= 0) {
    return null;
  }

  const cell = createCellGeometry(extent, rasterWidth, rasterHeight);
  const polygons: number[][][][] = [];

  for (let index = 0; index < match.count; index += 1) {
    polygons.push(cellRing(match.cols[index], match.rows[index], cell));
  }

  return new Feature(new MultiPolygon(polygons));
}

/** 像元值标注：命中格中心 → 地图坐标；超过上限则不标注（避免贴满整屏） */
export function createRasterAoiValueFeatures(
  match: RasterAoiPixelMatch,
  extent: RasterExtent3857,
  rasterWidth: number,
  rasterHeight: number,
  limit = MAX_AOI_VALUE_LABELS,
) {
  if (!match.count || match.count > limit || rasterWidth <= 0 || rasterHeight <= 0) {
    return [];
  }

  const cell = createCellGeometry(extent, rasterWidth, rasterHeight);
  const features: Feature<Point>[] = [];

  for (let index = 0; index < match.count; index += 1) {
    const feature = new Feature(new Point(cellCenter(match.cols[index], match.rows[index], cell)));
    feature.set('value', formatPixelValue(match.values[index]));
    features.push(feature);
  }

  return features;
}

export function formatPixelValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

type CellGeometry = { minX: number; maxY: number; spanX: number; spanY: number };

function createCellGeometry([minX, minY, maxX, maxY]: RasterExtent3857, rasterWidth: number, rasterHeight: number): CellGeometry {
  return {
    minX,
    maxY,
    spanX: (maxX - minX) / rasterWidth,
    spanY: (maxY - minY) / rasterHeight,
  };
}

function cellCenter(col: number, row: number, cell: CellGeometry): [number, number] {
  return [cell.minX + (col + 0.5) * cell.spanX, cell.maxY - (row + 0.5) * cell.spanY];
}

/** 单个像元的闭合环（左上 → 右上 → 右下 → 左下 → 左上） */
function cellRing(col: number, row: number, cell: CellGeometry): number[][][] {
  const left = cell.minX + col * cell.spanX;
  const right = left + cell.spanX;
  const top = cell.maxY - row * cell.spanY;
  const bottom = top - cell.spanY;

  return [[
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
    [left, top],
  ]];
}
