import type { CesiumNamespace, CesiumViewer } from './cesiumRuntime';

export type ProfilePoint = {
  lat: number;
  lon: number;
};

export type ProfileSample = {
  height: number;
  lat: number;
  lon: number;
};

export type ProfileResult = {
  distances: number[];
  samples: ProfileSample[];
};

export type FloodRegion = {
  east: number;
  north: number;
  south: number;
  west: number;
};

export const FLOOD_WATER_COLOR = '#1f8fff';
export const FLOOD_SLAB_THICKNESS = 45;
export const FLOOD_GRID_SIZE = 33;
export const FLOOD_MAX_REGION_SPAN_DEGREES = 1;
export const FLOOD_DEFAULT_SPAN_DEGREES = 0.3;
const LABEL_FONT = '12px "Segoe UI", "Microsoft YaHei", Arial, sans-serif';
const EARTH_RADIUS_METERS = 6378137;

export function pickTerrainPoint(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  windowPosition: unknown,
): ProfilePoint | null {
  const ray = viewer.camera.getPickRay?.(windowPosition);
  const cartesian = ray ? viewer.scene.globe.pick?.(ray, viewer.scene) : undefined;
  const picked = cartesian ?? viewer.camera.pickEllipsoid?.(windowPosition, viewer.scene.globe.ellipsoid);

  if (!picked) {
    return null;
  }

  const cartographic = Cesium.Cartographic.fromCartesian(picked);

  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lon: Cesium.Math.toDegrees(cartographic.longitude),
  };
}

export function createProfileDrawingEntities(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  pointsRef: { current: ProfilePoint[] },
  previewRef: { current: ProfilePoint | null },
) {
  const entities: unknown[] = [];
  const toCartesian = (point: ProfilePoint) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0);

  entities.push(viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => {
        const current = pointsRef.current.map(toCartesian);
        const preview = previewRef.current;

        return preview ? [...current, toCartesian(preview)] : current;
      }, false),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromAlpha(Cesium.Color.fromCssColorString('#ffffff'), 0.85),
      }),
    },
  }));

  pointsRef.current.forEach((point) => {
    entities.push(viewer.entities.add({
      position: toCartesian(point),
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString('#ffd55c'),
        outlineColor: Cesium.Color.fromCssColorString('#111827'),
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }));
  });

  viewer.scene.requestRender?.();
  return entities;
}

export function createProfileResultEntities(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  result: ProfileResult,
) {
  const entities: unknown[] = [];
  const positions = result.samples.map((sample) => (
    Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height)
  ));

  entities.push(viewer.entities.add({
    polyline: {
      positions,
      width: 5,
      material: new Cesium.PolylineGlowMaterialProperty({
        color: Cesium.Color.fromCssColorString('#4fd8ff'),
        glowPower: 0.25,
      }),
    },
  }));

  const createEndpoint = (sample: ProfileSample, label: string, color: string) => viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height),
    point: {
      pixelSize: 11,
      color: Cesium.Color.fromCssColorString(color),
      outlineColor: Cesium.Color.fromCssColorString('#111827'),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: label,
      font: LABEL_FONT,
      fillColor: Cesium.Color.fromCssColorString('#ffffff'),
      outlineColor: Cesium.Color.fromCssColorString('#111827'),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -20),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  entities.push(createEndpoint(result.samples[0], '起点', '#57ff9a'));
  entities.push(createEndpoint(result.samples[result.samples.length - 1], '终点', '#ff6b6b'));
  viewer.scene.requestRender?.();
  return entities;
}

export function computeFloodRegionFromView(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
): FloodRegion | null {
  const rectangle = viewer.camera.computeViewRectangle?.();

  if (!rectangle) {
    return null;
  }

  const toDegrees = Cesium.Math.toDegrees;
  let west = toDegrees(rectangle.west);
  let east = toDegrees(rectangle.east);
  let south = Math.max(toDegrees(rectangle.south), -84);
  let north = Math.min(toDegrees(rectangle.north), 84);

  if (east < west) {
    east += 360;
  }

  const clampSpan = (low: number, high: number, maxSpan: number, fallbackSpan: number) => {
    let span = high - low;

    if (!Number.isFinite(span) || span <= 0) {
      span = fallbackSpan;
    }

    const center = (low + high) / 2;
    const half = Math.min(span, maxSpan) / 2;

    return [center - half, center + half] as const;
  };

  [west, east] = clampSpan(west, east, FLOOD_MAX_REGION_SPAN_DEGREES, FLOOD_DEFAULT_SPAN_DEGREES);
  [south, north] = clampSpan(south, north, FLOOD_MAX_REGION_SPAN_DEGREES, FLOOD_DEFAULT_SPAN_DEGREES);

  if (![west, south, east, north].every(Number.isFinite)) {
    return null;
  }

  return { east, north, south, west };
}

export function floodRegionAreaSquareMeters(Cesium: CesiumNamespace, region: FloodRegion) {
  const midLat = Cesium.Math.toRadians((region.south + region.north) / 2);

  return Cesium.Math.toRadians(region.east - region.west) * Math.cos(midLat) * EARTH_RADIUS_METERS
    * Cesium.Math.toRadians(region.north - region.south) * EARTH_RADIUS_METERS;
}

export function buildFloodSampleGrid(Cesium: CesiumNamespace, region: FloodRegion) {
  const points: unknown[] = [];

  for (let i = 0; i < FLOOD_GRID_SIZE; i += 1) {
    const lat = region.south + (region.north - region.south) * i / (FLOOD_GRID_SIZE - 1);

    for (let j = 0; j < FLOOD_GRID_SIZE; j += 1) {
      const lon = region.west + (region.east - region.west) * j / (FLOOD_GRID_SIZE - 1);
      points.push(Cesium.Cartographic.fromDegrees(lon, lat));
    }
  }

  return points;
}

export function createFloodEntities(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  region: FloodRegion,
  levelRef: { current: number },
  opacityRef: { current: number },
) {
  const entities: unknown[] = [];
  const waterColor = Cesium.Color.fromCssColorString(FLOOD_WATER_COLOR);

  entities.push(viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy([
        Cesium.Cartesian3.fromDegrees(region.west, region.south, 0),
        Cesium.Cartesian3.fromDegrees(region.east, region.south, 0),
        Cesium.Cartesian3.fromDegrees(region.east, region.north, 0),
        Cesium.Cartesian3.fromDegrees(region.west, region.north, 0),
      ]),
      material: new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(() => Cesium.Color.fromAlpha(waterColor, opacityRef.current), false),
      ),
      height: new Cesium.CallbackProperty(() => levelRef.current - FLOOD_SLAB_THICKNESS, false),
      extrudedHeight: new Cesium.CallbackProperty(() => levelRef.current, false),
      outline: false,
    },
  }));

  const cx = (region.west + region.east) / 2;
  const cy = (region.south + region.north) / 2;

  entities.push(viewer.entities.add({
    position: new Cesium.CallbackProperty(
      () => Cesium.Cartesian3.fromDegrees(cx, cy, levelRef.current + 80),
      false,
    ),
    point: {
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString('#ffffff'),
      outlineColor: waterColor,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: new Cesium.CallbackProperty(() => `水位 ${Math.round(levelRef.current)} m`, false),
      font: LABEL_FONT,
      fillColor: Cesium.Color.fromCssColorString('#ffffff'),
      outlineColor: Cesium.Color.fromCssColorString('#111827'),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -22),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }));

  viewer.scene.requestRender?.();
  return entities;
}

export function drawProfileChart(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  result: ProfileResult,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const { distances, samples } = result;
  const heights = samples.map((sample) => sample.height);
  const left = 52;
  const right = 14;
  const top = 12;
  const bottom = 26;
  const plotWidth = Math.max(cssWidth - left - right, 10);
  const plotHeight = Math.max(cssHeight - top - bottom, 10);
  const totalDistance = distances[distances.length - 1] || 1;
  let minH = Infinity;
  let maxH = -Infinity;

  for (const height of heights) {
    minH = Math.min(minH, height);
    maxH = Math.max(maxH, height);
  }

  if (!Number.isFinite(minH) || !Number.isFinite(maxH)) {
    return;
  }

  if (maxH - minH < 1) {
    maxH = minH + 1;
  }

  const pad = (maxH - minH) * 0.15;
  const yMin = minH - pad;
  const yMax = maxH + pad;
  const xOf = (distance: number) => left + (distance / totalDistance) * plotWidth;
  const yOf = (height: number) => top + (1 - (height - yMin) / (yMax - yMin)) * plotHeight;

  ctx.font = '11px "Segoe UI", Arial, sans-serif';

  for (let i = 0; i <= 4; i += 1) {
    const y = top + (plotHeight / 4) * i;
    const value = Math.round(yMax - ((yMax - yMin) / 4) * i);

    ctx.strokeStyle = 'rgba(23, 32, 42, 0.08)';
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + plotWidth, y);
    ctx.stroke();
    ctx.fillStyle = '#687887';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${value}`, left - 6, y);
  }

  for (let i = 0; i <= 5; i += 1) {
    const x = left + (plotWidth / 5) * i;
    const value = (totalDistance / 1000 / 5) * i;

    ctx.strokeStyle = 'rgba(23, 32, 42, 0.08)';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + plotHeight);
    ctx.stroke();
    ctx.fillStyle = '#687887';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${value.toFixed(value < 10 ? 1 : 0)} km`, x, top + plotHeight + 6);
  }

  ctx.beginPath();
  ctx.moveTo(xOf(distances[0]), yOf(heights[0]));

  for (let i = 1; i < distances.length; i += 1) {
    ctx.lineTo(xOf(distances[i]), yOf(heights[i]));
  }

  ctx.lineTo(xOf(totalDistance), top + plotHeight);
  ctx.lineTo(xOf(0), top + plotHeight);
  ctx.closePath();
  ctx.fillStyle = 'rgba(31, 143, 255, 0.16)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(xOf(distances[0]), yOf(heights[0]));

  for (let i = 1; i < distances.length; i += 1) {
    ctx.lineTo(xOf(distances[i]), yOf(heights[i]));
  }

  ctx.strokeStyle = '#1f8fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#34495e';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('m', 4, top);
}

export function formatProfileStats(result: ProfileResult) {
  const heights = result.samples.map((sample) => sample.height);
  const total = result.distances[result.distances.length - 1];
  let minH = Infinity;
  let maxH = -Infinity;
  let sum = 0;

  for (const height of heights) {
    minH = Math.min(minH, height);
    maxH = Math.max(maxH, height);
    sum += height;
  }

  if (!Number.isFinite(minH) || !Number.isFinite(maxH)) {
    return '';
  }

  return `长度 ${(total / 1000).toFixed(2)} km · 高程 ${Math.round(minH)}~${Math.round(maxH)} m`
    + ` · 平均 ${Math.round(sum / heights.length)} m · 起伏 ${Math.round(maxH - minH)} m`;
}

export const CONTOUR_GRID_SIZE = 72;
export const CONTOUR_MAX_SPAN_DEGREES = 8;
export const CONTOUR_MAX_LEVELS = 24;
export const CONTOUR_MINOR_COLOR = '#00e5ff';
export const CONTOUR_MAJOR_COLOR = '#ff8c00';
export const CONTOUR_LABEL_COLOR = '#8ff6ff';

export type ContourRegion = {
  east: number;
  north: number;
  south: number;
  west: number;
};

export type ContourStats = {
  interval: number;
  levelCount: number;
  lineCount: number;
};

export function computeContourRegionFromView(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
): ContourRegion | null {
  const rectangle = viewer.camera.computeViewRectangle?.();

  if (!rectangle) {
    return null;
  }

  const region: ContourRegion = {
    east: rectangle.east,
    north: rectangle.north,
    south: rectangle.south,
    west: rectangle.west,
  };

  if (!(region.east > region.west) || !(region.north > region.south)) {
    return null;
  }

  return region;
}

export function contourSpanDegrees(Cesium: CesiumNamespace, region: ContourRegion) {
  return {
    height: Cesium.Math.toDegrees(region.north - region.south),
    width: Cesium.Math.toDegrees(region.east - region.west),
  };
}

export function buildContourSampleGrid(
  Cesium: CesiumNamespace,
  region: ContourRegion,
  size = CONTOUR_GRID_SIZE,
) {
  const points: unknown[] = [];

  for (let j = 0; j <= size; j += 1) {
    const lat = region.south + ((region.north - region.south) * j) / size;

    for (let i = 0; i <= size; i += 1) {
      const lon = region.west + ((region.east - region.west) * i) / size;
      points.push(new Cesium.Cartographic(lon, lat));
    }
  }

  return points;
}

function niceContourInterval(range: number) {
  const raw = Math.max(range, 1) / 14;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;

  return step * magnitude;
}

// Marching Squares：对某一等高层，输出网格坐标 (fx, fy) 下的线段
function contourSegments(grid: number[][], nx: number, ny: number, level: number) {
  const segments: Array<[number, number][]> = [];
  const interp = (v0: number, v1: number) => (level - v0) / (v1 - v0);

  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      // 与 level 相等时微调，避免除零/端点退化
      const bump = (v: number) => (v === level ? v + 1e-6 : v);
      const v00 = bump(grid[j][i]);
      const v10 = bump(grid[j][i + 1]);
      const v01 = bump(grid[j + 1][i]);
      const v11 = bump(grid[j + 1][i + 1]);

      let code = 0;
      if (v00 >= level) code |= 1;
      if (v10 >= level) code |= 2;
      if (v11 >= level) code |= 4;
      if (v01 >= level) code |= 8;
      if (code === 0 || code === 15) continue;

      // 单元四条边上的交点（网格坐标）
      const bottom: [number, number] = [i + interp(v00, v10), j];
      const right: [number, number] = [i + 1, j + interp(v10, v11)];
      const top: [number, number] = [i + interp(v01, v11), j + 1];
      const left: [number, number] = [i, j + interp(v00, v01)];
      const centerAbove = (v00 + v10 + v11 + v01) / 4 >= level;

      switch (code) {
        case 1: case 14: segments.push([left, bottom]); break;
        case 2: case 13: segments.push([bottom, right]); break;
        case 3: case 12: segments.push([left, right]); break;
        case 4: case 11: segments.push([top, right]); break;
        case 6: case 9: segments.push([bottom, top]); break;
        case 7: case 8: segments.push([left, top]); break;
        case 5:
          if (centerAbove) segments.push([left, top], [bottom, right]);
          else segments.push([left, bottom], [top, right]);
          break;
        case 10:
          if (centerAbove) segments.push([left, bottom], [top, right]);
          else segments.push([left, top], [bottom, right]);
          break;
        default: break;
      }
    }
  }

  return segments;
}

// 把碎片线段按共享端点连接成折线
function joinContourSegments(segments: Array<[number, number][]>): Array<[number, number][]> {
  const key = (p: [number, number]) => `${Math.round(p[0] * 1e6)}:${Math.round(p[1] * 1e6)}`;
  const adjacency = new Map<string, Array<{ index: number; end: number }>>();

  segments.forEach((seg, index) => {
    [0, 1].forEach((end) => {
      const k = key(seg[end]);

      if (!adjacency.has(k)) {
        adjacency.set(k, []);
      }

      adjacency.get(k)!.push({ index, end });
    });
  });

  const used = new Array(segments.length).fill(false);
  const lines: [number, number][][] = [];

  for (let s = 0; s < segments.length; s += 1) {
    if (used[s]) continue;
    used[s] = true;
    const points: [number, number][] = [segments[s][0], segments[s][1]];

    // 从折线两端分别向外延伸
    for (let end = 1; end >= 0; end -= 1) {
      let guard = 0;

      while (guard++ < 100000) {
        const tip = key(points[end === 1 ? points.length - 1 : 0]);
        const candidates = (adjacency.get(tip) || []).filter((c) => !used[c.index]);

        if (candidates.length === 0) break;

        const next = candidates[0];
        used[next.index] = true;
        const other = segments[next.index][next.end === 0 ? 1 : 0];

        if (end === 1) {
          points.push(other);
        } else {
          points.unshift(other);
        }
      }
    }

    lines.push(points);
  }

  return lines;
}

export function createContourEntities(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  region: ContourRegion,
  heights: number[],
): { entities: unknown[]; stats: ContourStats } {
  const entities: unknown[] = [];
  const size = CONTOUR_GRID_SIZE;
  const grid: number[][] = [];
  let minH = Infinity;
  let maxH = -Infinity;
  let index = 0;

  for (let j = 0; j <= size; j += 1) {
    const row: number[] = [];

    for (let i = 0; i <= size; i += 1) {
      const h = heights[index++] ?? 0;
      row.push(h);

      if (Number.isFinite(h)) {
        minH = Math.min(minH, h);
        maxH = Math.max(maxH, h);
      }
    }

    grid.push(row);
  }

  if (!Number.isFinite(minH) || maxH - minH < 1) {
    return { entities, stats: { interval: 0, levelCount: 0, lineCount: 0 } };
  }

  const interval = niceContourInterval(maxH - minH);
  const levels: number[] = [];

  for (let lv = Math.ceil(minH / interval) * interval; lv < maxH; lv += interval) {
    levels.push(lv);

    if (levels.length >= CONTOUR_MAX_LEVELS) break;
  }

  const toLon = (fx: number) => region.west + ((region.east - region.west) * fx) / size;
  const toLat = (fy: number) => region.south + ((region.north - region.south) * fy) / size;
  const minorColor = Cesium.Color.fromCssColorString(CONTOUR_MINOR_COLOR);
  const majorColor = Cesium.Color.fromCssColorString(CONTOUR_MAJOR_COLOR);
  let lineCount = 0;

  levels.forEach((level) => {
    // 每 5 倍间隔为计曲线，加粗显示
    const isMajor = Math.abs((level / interval) % 5) < 1e-6;
    const lines = joinContourSegments(contourSegments(grid, size, size, level)).filter((pts) => pts.length >= 3); // 过滤碎线

    lines.forEach((pts) => {
      const positions = pts.map((p) => Cesium.Cartesian3.fromRadians(toLon(p[0]), toLat(p[1]), level));

      entities.push(viewer.entities.add({
        polyline: {
          positions,
          width: isMajor ? 3 : 1.6,
          material: isMajor ? majorColor : minorColor,
          clampToGround: true,
        },
      }));
      lineCount += 1;
    });

    // 每层在最长的一条线中点放高程标注
    const longest = lines.reduce<[number, number][] | null>((acc, pts) => (!acc || pts.length > acc.length ? pts : acc), null);

    if (longest) {
      const mid = longest[Math.floor(longest.length / 2)];

      entities.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromRadians(toLon(mid[0]), toLat(mid[1]), level + 40),
        label: {
          text: `${Math.round(level)} m`,
          font: '13px sans-serif',
          fillColor: Cesium.Color.fromCssColorString(CONTOUR_LABEL_COLOR),
          outlineColor: Cesium.Color.fromCssColorString('#000000'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 80000),
        },
      }));
    }
  });

  viewer.scene.requestRender?.();

  return { entities, stats: { interval, levelCount: levels.length, lineCount } };
}
