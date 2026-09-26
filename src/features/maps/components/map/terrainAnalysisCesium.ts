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
