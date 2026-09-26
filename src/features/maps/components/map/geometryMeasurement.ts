import type { CesiumNamespace, CesiumViewer } from './cesiumRuntime';

export type GeometryMeasurePoint = {
  height: number;
  lat: number;
  lon: number;
};

export type AreaMeasureResult = {
  area: number;
  id: string;
  isSurfaceArea?: boolean;
  perimeter: number;
  points: GeometryMeasurePoint[];
  surfaceArea?: number;
};

export type AngleMeasureResult = {
  firstPitch?: number;
  horizontalAngle: number;
  id: string;
  points: [GeometryMeasurePoint, GeometryMeasurePoint, GeometryMeasurePoint];
  secondPitch?: number;
  spaceAngle?: number;
};

export type BearingMeasureResult = {
  bearing: number;
  horizontalDistance: number;
  id: string;
  points: [GeometryMeasurePoint, GeometryMeasurePoint];
};

export const GEOMETRY_AREA_COLOR = '#4ade80';
export const GEOMETRY_ANGLE_COLOR = '#c084fc';
export const GEOMETRY_BEARING_COLOR = '#f59e0b';
export const GEOMETRY_LABEL_FONT = '700 13px "Segoe UI", "Microsoft YaHei", Arial, sans-serif';

const EARTH_RADIUS_METERS = 6371008.8;
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const DEG_TO_RAD = Math.PI / 180;

export function formatMeasureArea(value: number) {
  if (Math.abs(value) < 1_000_000) {
    return `${value.toFixed(2)} 平方米`;
  }

  return `${(value / 1_000_000).toFixed(4)} 平方千米`;
}

export function formatMeasureAngle(value: number) {
  return `${value.toFixed(2)}°`;
}

export function formatSignedMeasureAngle(value: number) {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(2)}°`;
}

export function haversineMeters(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
) {
  const deltaLat = (to.lat - from.lat) * DEG_TO_RAD;
  const deltaLon = (to.lon - from.lon) * DEG_TO_RAD;
  const sinLat = Math.sin(deltaLat * 0.5);
  const sinLon = Math.sin(deltaLon * 0.5);
  const h = sinLat * sinLat + Math.cos(from.lat * DEG_TO_RAD) * Math.cos(to.lat * DEG_TO_RAD) * sinLon * sinLon;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
) {
  const deltaLon = (to.lon - from.lon) * DEG_TO_RAD;
  const latFrom = from.lat * DEG_TO_RAD;
  const latTo = to.lat * DEG_TO_RAD;
  const y = Math.sin(deltaLon) * Math.cos(latTo);
  const x = Math.cos(latFrom) * Math.sin(latTo) - Math.sin(latFrom) * Math.cos(latTo) * Math.cos(deltaLon);

  return (Math.atan2(y, x) / DEG_TO_RAD + 360) % 360;
}

export function destinationPoint(
  origin: { lat: number; lon: number },
  bearing: number,
  distance: number,
) {
  const angular = distance / EARTH_RADIUS_METERS;
  const bearingRad = bearing * DEG_TO_RAD;
  const latFrom = origin.lat * DEG_TO_RAD;
  const lonFrom = origin.lon * DEG_TO_RAD;
  const sinLat = Math.sin(latFrom) * Math.cos(angular) + Math.cos(latFrom) * Math.sin(angular) * Math.cos(bearingRad);
  const lat = Math.asin(Math.min(1, Math.max(-1, sinLat)));
  const lon = lonFrom + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angular) * Math.cos(latFrom),
    Math.cos(angular) - Math.sin(latFrom) * sinLat,
  );

  return { lat: lat / DEG_TO_RAD, lon: (((lon / DEG_TO_RAD) + 540) % 360) - 180 };
}

export function polygonCentroidMeters(points: GeometryMeasurePoint[]) {
  return {
    lat: points.reduce((total, point) => total + point.lat, 0) / points.length,
    lon: points.reduce((total, point) => total + point.lon, 0) / points.length,
  };
}

export function measurePolygonArea(points: GeometryMeasurePoint[]) {
  if (points.length < 3) {
    return 0;
  }

  const centroid = polygonCentroidMeters(points);
  const cosLat = Math.max(Math.cos(centroid.lat * DEG_TO_RAD), 0.01);
  const projected = points.map((point) => ({
    x: (point.lon - centroid.lon) * DEG_TO_RAD * EARTH_RADIUS_METERS * cosLat,
    y: (point.lat - centroid.lat) * DEG_TO_RAD * EARTH_RADIUS_METERS,
  }));
  const doubled = projected.reduce((total, vertex, index) => {
    const next = projected[(index + 1) % projected.length];

    return total + vertex.x * next.y - next.x * vertex.y;
  }, 0);

  return Math.abs(doubled) / 2;
}

export function measurePolygonPerimeter(points: GeometryMeasurePoint[]) {
  if (points.length < 2) {
    return 0;
  }

  return points.reduce(
    (total, point, index) => total + haversineMeters(point, points[(index + 1) % points.length]),
    0,
  );
}

export function horizontalAngleDegrees(
  first: { lat: number; lon: number },
  vertex: { lat: number; lon: number },
  second: { lat: number; lon: number },
) {
  const delta = bearingDegrees(vertex, second) - bearingDegrees(vertex, first);
  const normalized = Math.abs(((delta % 360) + 540) % 360 - 180);

  return normalized;
}

function toEcef(point: GeometryMeasurePoint) {
  const lat = point.lat * DEG_TO_RAD;
  const lon = point.lon * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const normal = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  return {
    x: (normal + point.height) * cosLat * Math.cos(lon),
    y: (normal + point.height) * cosLat * Math.sin(lon),
    z: (normal * (1 - WGS84_E2) + point.height) * sinLat,
  };
}

export function spaceAngleDegrees(
  first: GeometryMeasurePoint,
  vertex: GeometryMeasurePoint,
  second: GeometryMeasurePoint,
) {
  const vertexEcef = toEcef(vertex);

  const ray = (target: GeometryMeasurePoint) => {
    const ecef = toEcef(target);

    return {
      x: ecef.x - vertexEcef.x,
      y: ecef.y - vertexEcef.y,
      z: ecef.z - vertexEcef.z,
    };
  };
  const a = ray(first);
  const b = ray(second);
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const lengthA = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  const lengthB = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);

  if (lengthA === 0 || lengthB === 0) {
    return null;
  }

  return Math.acos(Math.min(1, Math.max(-1, dot / (lengthA * lengthB)))) / DEG_TO_RAD;
}

export function segmentPitchDegrees(from: GeometryMeasurePoint, to: GeometryMeasurePoint) {
  const horizontal = haversineMeters(from, to);
  const vertical = to.height - from.height;

  return Math.atan2(vertical, Math.max(horizontal, 0.001)) / DEG_TO_RAD;
}

export function buildArcLngLat(
  vertex: GeometryMeasurePoint,
  firstBearing: number,
  secondBearing: number,
  radius: number,
  segments = 24,
) {
  const delta = (((secondBearing - firstBearing) % 360) + 540) % 360 - 180;
  const positions: { lat: number; lon: number }[] = [];

  for (let index = 0; index <= segments; index += 1) {
    positions.push(destinationPoint(vertex, firstBearing + delta * index / segments, radius));
  }

  return positions;
}

export function arcRadiusMeters(
  vertex: GeometryMeasurePoint,
  first: GeometryMeasurePoint,
  second: GeometryMeasurePoint,
) {
  const firstDistance = haversineMeters(vertex, first);
  const secondDistance = haversineMeters(vertex, second);

  return Math.max(2, Math.min(firstDistance, secondDistance) * 0.35);
}

function toCartesianFromDegrees(Cesium: CesiumNamespace, point: GeometryMeasurePoint) {
  return Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height);
}

function addMeasureLabel(
  Cesium: CesiumNamespace,
  addEntity: (options: Record<string, unknown>) => unknown,
  position: unknown,
  text: string,
  color: unknown,
  pixelOffsetY = -14,
) {
  return addEntity({
    position,
    label: {
      text,
      font: GEOMETRY_LABEL_FONT,
      fillColor: color,
      outlineColor: Cesium.Color.fromCssColorString('#101820'),
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, pixelOffsetY),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

export function createAreaResultEntities(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  result: AreaMeasureResult,
) {
  const entities: unknown[] = [];
  const addEntity = (options: Record<string, unknown>) => {
    const entity = viewer.entities.add(options);
    entities.push(entity);

    return entity;
  };
  const color = Cesium.Color.fromCssColorString(GEOMETRY_AREA_COLOR);
  const white = Cesium.Color.fromCssColorString('#ffffff');
  const isSurfaceArea = result.isSurfaceArea === true;
  const positions = result.points.map((point) => isSurfaceArea
    ? Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0)
    : toCartesianFromDegrees(Cesium, point));

  addEntity({
    polygon: {
      clampToGround: isSurfaceArea,
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: Cesium.Color.fromAlpha(color, 0.18),
      perPositionHeight: !isSurfaceArea,
    },
  });
  addEntity({
    polyline: {
      clampToGround: isSurfaceArea,
      positions: [...positions, positions[0]],
      width: 3,
      material: color,
      arcType: isSurfaceArea ? Cesium.ArcType.GEODESIC : Cesium.ArcType.NONE,
    },
  });
  result.points.forEach((point, index) => {
    addEntity({
      position: toCartesianFromDegrees(Cesium, point),
      point: {
        pixelSize: 8,
        color,
        outlineColor: white,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: index === 0 ? {
        text: `${result.points.length} 点`,
        font: GEOMETRY_LABEL_FONT,
        fillColor: color,
        outlineColor: Cesium.Color.fromCssColorString('#101820'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } : undefined,
    });
  });
  const centroid = polygonCentroidMeters(result.points);
  const centroidHeight = result.points.reduce((total, point) => total + point.height, 0) / result.points.length;
  addMeasureLabel(
    Cesium,
    addEntity,
    Cesium.Cartesian3.fromDegrees(centroid.lon, centroid.lat, centroidHeight),
    `面积 ${formatMeasureArea(result.area)}\n周长 ${formatPolygonPerimeter(result.perimeter)}`,
    color,
    16,
  );

  return entities;
}

function formatPolygonPerimeter(value: number) {
  if (Math.abs(value) < 1000) {
    return `${value.toFixed(2)} 米`;
  }

  return `${(value / 1000).toFixed(3)} 千米`;
}

export function buildBearingResult(points: [GeometryMeasurePoint, GeometryMeasurePoint]): BearingMeasureResult {
  const [start, end] = points;

  return {
    bearing: bearingDegrees(start, end),
    horizontalDistance: haversineMeters(start, end),
    id: `bearing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    points,
  };
}

function formatBearingLabel(bearing: number) {
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

  return `${directions[Math.round(bearing / 45) % 8]} ${bearing.toFixed(2)}°`;
}

export function createBearingResultEntities(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  result: BearingMeasureResult,
) {
  const entities: unknown[] = [];
  const addEntity = (options: Record<string, unknown>) => {
    const entity = viewer.entities.add(options);
    entities.push(entity);

    return entity;
  };
  const color = Cesium.Color.fromCssColorString(GEOMETRY_BEARING_COLOR);
  const white = Cesium.Color.fromCssColorString('#ffffff');
  const [start, end] = result.points;
  const radius = Math.max(haversineMeters(start, end) * 0.35, 2);
  const northDestination = destinationPoint(start, 0, radius);
  const northEnd: GeometryMeasurePoint = { ...northDestination, height: start.height };
  const arcPositions = buildArcLngLat(start, 0, result.bearing, radius)
    .map((point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat, start.height));

  [start, end].forEach((point, index) => {
    addEntity({
      position: toCartesianFromDegrees(Cesium, point),
      point: {
        pixelSize: 8,
        color,
        outlineColor: white,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: index === 0 ? {
        text: '北',
        font: GEOMETRY_LABEL_FONT,
        fillColor: color,
        outlineColor: Cesium.Color.fromCssColorString('#101820'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } : undefined,
    });
  });
  [
    [start, end],
    [start, northEnd],
  ].forEach(([from, to]) => {
    addEntity({
      polyline: {
        positions: [
          toCartesianFromDegrees(Cesium, from),
          Cesium.Cartesian3.fromDegrees(to.lon, to.lat, start.height),
        ],
        width: 4,
        material: color,
        arcType: Cesium.ArcType.NONE,
      },
    });
  });
  addEntity({
    polyline: {
      positions: arcPositions,
      width: 2,
      material: color,
      arcType: Cesium.ArcType.NONE,
    },
  });
  addMeasureLabel(
    Cesium,
    addEntity,
    Cesium.Cartesian3.fromDegrees(
      (start.lon + end.lon) / 2,
      (start.lat + end.lat) / 2,
      start.height,
    ),
    `方位角 ${result.bearing.toFixed(2)}°\n${formatBearingLabel(result.bearing)} · ${formatBearingDistance(result.horizontalDistance)}`,
    color,
    16,
  );

  return entities;
}

function formatBearingDistance(value: number) {
  if (value < 1000) {
    return `${value.toFixed(2)} 米`;
  }

  return `${(value / 1000).toFixed(3)} 千米`;
}

const SURFACE_AREA_DENSIFY_SPACING_METERS = 30;
const SURFACE_AREA_MAX_RING_POINTS = 768;

function ecefTriangleAreaMeters2(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;

  return Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
}

export async function computeSurfaceAreaMeters2(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  points: GeometryMeasurePoint[],
) {
  if (points.length < 3 || !viewer.scene.globe) {
    return null;
  }

  const perimeter = measurePolygonPerimeter(points);
  const spacing = Math.max(perimeter / SURFACE_AREA_MAX_RING_POINTS, SURFACE_AREA_DENSIFY_SPACING_METERS);
  const ring: GeometryMeasurePoint[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = haversineMeters(start, end);
    const segments = Math.max(1, Math.min(64, Math.floor(length / spacing)));

    for (let step = 0; step < segments; step += 1) {
      ring.push({
        height: start.height + (end.height - start.height) * (step / segments),
        lat: start.lat + (end.lat - start.lat) * (step / segments),
        lon: start.lon + (end.lon - start.lon) * (step / segments),
      });
    }
  }

  if (ring.length < 3) {
    return null;
  }

  try {
    const terrainProvider = viewer.terrainProvider;
    const isEllipsoidTerrain = terrainProvider instanceof Cesium.EllipsoidTerrainProvider;

    if (!isEllipsoidTerrain) {
      const updated = await Cesium.sampleTerrainMostDetailed(
        terrainProvider,
        ring.map((point) => Cesium.Cartographic.fromDegrees(point.lon, point.lat)),
      ) as ({ height?: number } | undefined)[];

      updated.forEach((cartographic, index) => {
        const height = cartographic?.height;

        if (height != null && Number.isFinite(height)) {
          ring[index].height = height;
        }
      });
    }
  } catch {
    return null;
  }

  const anchor = toEcef(ring[0]);
  let total = 0;

  for (let index = 1; index < ring.length - 1; index += 1) {
    total += ecefTriangleAreaMeters2(anchor, toEcef(ring[index]), toEcef(ring[index + 1]));
  }

  return Number.isFinite(total) && total > 0 ? total : null;
}

export function createAngleResultEntities(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  result: AngleMeasureResult,
) {
  const entities: unknown[] = [];
  const addEntity = (options: Record<string, unknown>) => {
    const entity = viewer.entities.add(options);
    entities.push(entity);

    return entity;
  };
  const color = Cesium.Color.fromCssColorString(GEOMETRY_ANGLE_COLOR);
  const white = Cesium.Color.fromCssColorString('#ffffff');
  const [first, vertex, second] = result.points;
  const firstBearing = bearingDegrees(vertex, first);
  const secondBearing = bearingDegrees(vertex, second);
  const arcPositions = buildArcLngLat(vertex, firstBearing, secondBearing, arcRadiusMeters(vertex, first, second))
    .map((point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat, vertex.height));

  [first, vertex, second].forEach((point, index) => {
    addEntity({
      position: toCartesianFromDegrees(Cesium, point),
      point: {
        pixelSize: 8,
        color,
        outlineColor: white,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: index === 1 ? {
        text: formatMeasureAngle(result.horizontalAngle),
        font: GEOMETRY_LABEL_FONT,
        fillColor: color,
        outlineColor: Cesium.Color.fromCssColorString('#101820'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, 14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } : undefined,
    });
  });
  [
    [first, vertex],
    [vertex, second],
  ].forEach(([start, end]) => {
    addEntity({
      polyline: {
        positions: [toCartesianFromDegrees(Cesium, start), toCartesianFromDegrees(Cesium, end)],
        width: 4,
        material: color,
        arcType: Cesium.ArcType.NONE,
      },
    });
  });
  addEntity({
    polyline: {
      positions: arcPositions,
      width: 2,
      material: color,
      arcType: Cesium.ArcType.NONE,
    },
  });

  return entities;
}
