import type { CesiumNamespace, CesiumViewer } from './cesiumRuntime';

export type ElevationMeasurePoint = {
  height: number;
  lat: number;
  lon: number;
};

export type ElevationMeasureResult = {
  first: ElevationMeasurePoint;
  horizontalDistance: number;
  id: string;
  second: ElevationMeasurePoint;
  slopeDistance: number;
  verticalDistance: number;
};

export type ElevationTriangle = {
  corner: unknown;
  first: unknown;
  horizontal: number;
  second: unknown;
  slope: number;
  vertical: number;
};

export type ElevationPlaneBounds = {
  maxLat: number;
  maxLon: number;
  minLat: number;
  minLon: number;
};

export const ELEVATION_SLOPE_COLOR = '#ff4b4b';
export const ELEVATION_HORIZONTAL_COLOR = '#2ad4ff';
export const ELEVATION_VERTICAL_COLOR = '#ffd166';
export const ELEVATION_LABEL_FONT = '700 13px "Segoe UI", "Microsoft YaHei", Arial, sans-serif';

const EARTH_RADIUS_METERS = 6378137;
const ELEVATION_GRID_SIZE = 18;
const ELEVATION_CONTOUR_OFFSET_METERS = 1.5;
const ELEVATION_PLANE_MARGIN_RATIO = 0.2;
const ELEVATION_PLANE_MIN_MARGIN_METERS = 150;

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lerp(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio;
}

export function formatMeasureLength(value: number) {
  if (Math.abs(value) < 1000) {
    return `${value.toFixed(2)} 米`;
  }

  return `${(value / 1000).toFixed(3)} 千米`;
}

export function formatSignedMeasureLength(value: number) {
  return `${value >= 0 ? '+' : '-'}${formatMeasureLength(Math.abs(value))}`;
}

export function pickTerrainCartesian(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  windowPosition: unknown,
): unknown | null {
  const ray = viewer.camera.getPickRay?.(windowPosition);
  const picked = ray ? viewer.scene.globe.pick?.(ray, viewer.scene) : undefined;

  return picked ?? viewer.camera.pickEllipsoid?.(windowPosition, viewer.scene.globe.ellipsoid) ?? null;
}

export function computeElevationTriangle(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  first: unknown,
  second: unknown,
): ElevationTriangle {
  const ellipsoid = viewer.scene.globe.ellipsoid as
    | { geodeticSurfaceNormal?: (cartesian: unknown, result: unknown) => unknown }
    | undefined;
  const up = ellipsoid?.geodeticSurfaceNormal
    ? ellipsoid.geodeticSurfaceNormal(first, new Cesium.Cartesian3())
    : Cesium.Cartesian3.normalize(first, new Cesium.Cartesian3());
  const delta = Cesium.Cartesian3.subtract(second, first, new Cesium.Cartesian3());
  const vertical = Cesium.Cartesian3.dot(delta, up);
  const corner = Cesium.Cartesian3.subtract(
    second,
    Cesium.Cartesian3.multiplyByScalar(up, vertical, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );

  return {
    corner,
    first,
    horizontal: Cesium.Cartesian3.distance(first, corner),
    second,
    slope: Cesium.Cartesian3.distance(first, second),
    vertical,
  };
}

export function elevationPlaneBounds(
  Cesium: CesiumNamespace,
  first: unknown,
  second: unknown,
): ElevationPlaneBounds {
  const firstCartographic = Cesium.Cartographic.fromCartesian(first);
  const secondCartographic = Cesium.Cartographic.fromCartesian(second);
  const centerLatitude = (firstCartographic.latitude + secondCartographic.latitude) * 0.5;
  const margin = Math.max(
    Cesium.Cartesian3.distance(first, second) * ELEVATION_PLANE_MARGIN_RATIO,
    ELEVATION_PLANE_MIN_MARGIN_METERS,
  );
  const latitudeMargin = margin / EARTH_RADIUS_METERS;
  const longitudeMargin = margin / (EARTH_RADIUS_METERS * Math.max(Math.abs(Math.cos(centerLatitude)), 0.15));

  return {
    maxLat: Math.max(firstCartographic.latitude, secondCartographic.latitude) + latitudeMargin,
    maxLon: Math.max(firstCartographic.longitude, secondCartographic.longitude) + longitudeMargin,
    minLat: Math.min(firstCartographic.latitude, secondCartographic.latitude) - latitudeMargin,
    minLon: Math.min(firstCartographic.longitude, secondCartographic.longitude) - longitudeMargin,
  };
}

export function createElevationPlanePositions(
  Cesium: CesiumNamespace,
  bounds: ElevationPlaneBounds,
  height: number,
) {
  return [
    Cesium.Cartesian3.fromRadians(bounds.minLon, bounds.minLat, height),
    Cesium.Cartesian3.fromRadians(bounds.maxLon, bounds.minLat, height),
    Cesium.Cartesian3.fromRadians(bounds.maxLon, bounds.maxLat, height),
    Cesium.Cartesian3.fromRadians(bounds.minLon, bounds.maxLat, height),
  ];
}

export function createElevationSampleGrid(
  Cesium: CesiumNamespace,
  bounds: ElevationPlaneBounds,
) {
  const size = ELEVATION_GRID_SIZE;
  const cartographics: unknown[] = [];

  for (let row = 0; row < size; row += 1) {
    const latitude = lerp(bounds.minLat, bounds.maxLat, row / (size - 1));

    for (let column = 0; column < size; column += 1) {
      const longitude = lerp(bounds.minLon, bounds.maxLon, column / (size - 1));
      cartographics.push(new Cesium.Cartographic(longitude, latitude, 0));
    }
  }

  return { cartographics, columns: size, rows: size };
}

export function buildElevationContourSegments(
  Cesium: CesiumNamespace,
  samples: unknown[],
  columns: number,
  rows: number,
  height: number,
) {
  const typedSamples = samples as { height: number; latitude: number; longitude: number }[];
  const segments: unknown[][] = [];
  const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0]];

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const indices = [
        row * columns + column,
        row * columns + column + 1,
        (row + 1) * columns + column + 1,
        (row + 1) * columns + column,
      ];
      const corners = indices.map((index) => typedSamples[index]);

      if (corners.some((corner) => !corner || !Number.isFinite(corner.height))) {
        continue;
      }

      const intersections: unknown[] = [];

      edgePairs.forEach(([startIndex, endIndex]) => {
        const start = corners[startIndex];
        const end = corners[endIndex];
        const crosses = (start.height < height && end.height >= height)
          || (end.height < height && start.height >= height);

        if (!crosses || Math.abs(end.height - start.height) < 0.001) {
          return;
        }

        const ratio = clamp((height - start.height) / (end.height - start.height), 0, 1);
        const longitude = lerp(start.longitude, end.longitude, ratio);
        const latitude = lerp(start.latitude, end.latitude, ratio);
        const position = Cesium.Cartesian3.fromRadians(
          longitude,
          latitude,
          height + ELEVATION_CONTOUR_OFFSET_METERS,
        );

        if (!intersections.some((item) => Cesium.Cartesian3.distance(item, position) < 0.5)) {
          intersections.push(position);
        }
      });

      if (intersections.length === 2) {
        segments.push(intersections);
      } else if (intersections.length === 4) {
        segments.push([intersections[0], intersections[1]], [intersections[2], intersections[3]]);
      }
    }
  }

  return segments;
}

function triangleEdgeMidpoint(
  Cesium: CesiumNamespace,
  triangle: ElevationTriangle,
  metric: 'horizontal' | 'slope' | 'vertical',
) {
  if (metric === 'slope') {
    return Cesium.Cartesian3.midpoint(triangle.first, triangle.second, new Cesium.Cartesian3());
  }

  if (metric === 'horizontal') {
    return Cesium.Cartesian3.midpoint(triangle.first, triangle.corner, new Cesium.Cartesian3());
  }

  return Cesium.Cartesian3.midpoint(triangle.corner, triangle.second, new Cesium.Cartesian3());
}

function addTriangleLabel(
  Cesium: CesiumNamespace,
  addEntity: (options: Record<string, unknown>) => unknown,
  edge: {
    color: unknown;
    metric: 'horizontal' | 'slope' | 'vertical';
    offset: number;
    text: string;
    xOffset: number;
  },
  getTriangle: () => ElevationTriangle | null,
  dynamic: boolean,
  occlusionEnabled: boolean,
) {
  const property = <T,>(compute: () => T) => (dynamic ? new Cesium.CallbackProperty(() => compute(), false) : compute());
  const outlineColor = Cesium.Color.fromCssColorString('#101820');

  return addEntity({
    position: property(() => {
      const triangle = getTriangle();

      return triangle ? triangleEdgeMidpoint(Cesium, triangle, edge.metric) : undefined;
    }),
    label: {
      font: ELEVATION_LABEL_FONT,
      fillColor: edge.color,
      outlineColor,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(edge.xOffset, edge.offset),
      disableDepthTestDistance: occlusionEnabled ? 0 : Number.POSITIVE_INFINITY,
      show: property(() => Boolean(getTriangle())),
      text: property(() => {
        const triangle = getTriangle();

        if (!triangle) {
          return '';
        }

        const value = triangle[edge.metric];
        const sign = edge.metric === 'vertical' ? (value >= 0 ? '+' : '-') : '';

        return `${edge.text} ${sign}${formatMeasureLength(Math.abs(value))}`;
      }),
    },
  });
}

export function createElevationTriangleLabelEntities(
  Cesium: CesiumNamespace,
  addEntity: (options: Record<string, unknown>) => unknown,
  getTriangle: () => ElevationTriangle | null,
  dynamic: boolean,
  occlusionEnabled: boolean,
) {
  const slopeColor = Cesium.Color.fromCssColorString(ELEVATION_SLOPE_COLOR);
  const horizontalColor = Cesium.Color.fromCssColorString(ELEVATION_HORIZONTAL_COLOR);
  const verticalColor = Cesium.Color.fromCssColorString(ELEVATION_VERTICAL_COLOR);

  return [
    addTriangleLabel(Cesium, addEntity, { color: slopeColor, metric: 'slope', offset: -26, text: '斜距', xOffset: 0 }, getTriangle, dynamic, occlusionEnabled),
    addTriangleLabel(Cesium, addEntity, { color: horizontalColor, metric: 'horizontal', offset: 22, text: '水平', xOffset: 0 }, getTriangle, dynamic, occlusionEnabled),
    addTriangleLabel(Cesium, addEntity, { color: verticalColor, metric: 'vertical', offset: -8, text: '垂直', xOffset: 45 }, getTriangle, dynamic, occlusionEnabled),
  ];
}

export function createElevationResultEntities(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  result: ElevationMeasureResult,
  occlusionEnabled: boolean,
) {
  const entities: unknown[] = [];
  const addEntity = (options: Record<string, unknown>) => {
    const entity = viewer.entities.add(options);
    entities.push(entity);

    return entity;
  };

  const first = Cesium.Cartesian3.fromDegrees(result.first.lon, result.first.lat, result.first.height);
  const second = Cesium.Cartesian3.fromDegrees(result.second.lon, result.second.lat, result.second.height);
  const triangle = computeElevationTriangle(Cesium, viewer, first, second);
  const slopeColor = Cesium.Color.fromCssColorString(ELEVATION_SLOPE_COLOR);
  const horizontalColor = Cesium.Color.fromCssColorString(ELEVATION_HORIZONTAL_COLOR);
  const verticalColor = Cesium.Color.fromCssColorString(ELEVATION_VERTICAL_COLOR);
  const white = Cesium.Color.fromCssColorString('#ffffff');
  const outlineColor = Cesium.Color.fromCssColorString('#101820');
  const labelDepthDistance = occlusionEnabled ? 0 : Number.POSITIVE_INFINITY;

  addEntity({
    polyline: {
      positions: [first, second],
      width: 4,
      material: slopeColor,
      depthFailMaterial: occlusionEnabled ? undefined : slopeColor,
      arcType: Cesium.ArcType.NONE,
    },
  });
  addEntity({
    polyline: {
      positions: [first, triangle.corner],
      width: 2,
      material: horizontalColor,
      depthFailMaterial: occlusionEnabled ? undefined : horizontalColor,
      arcType: Cesium.ArcType.NONE,
    },
  });
  addEntity({
    polyline: {
      positions: [triangle.corner, second],
      width: 2,
      material: verticalColor,
      depthFailMaterial: occlusionEnabled ? undefined : verticalColor,
      arcType: Cesium.ArcType.NONE,
    },
  });

  [
    { color: slopeColor, label: `A ${result.first.height.toFixed(1)} m`, position: first },
    { color: slopeColor, label: `B ${result.second.height.toFixed(1)} m`, position: second },
  ].forEach((endpoint) => {
    addEntity({
      position: endpoint.position,
      point: {
        pixelSize: 9,
        color: endpoint.color,
        outlineColor: white,
        outlineWidth: 2,
        disableDepthTestDistance: labelDepthDistance,
      },
      label: {
        text: endpoint.label,
        font: ELEVATION_LABEL_FONT,
        fillColor: endpoint.color,
        outlineColor,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        disableDepthTestDistance: labelDepthDistance,
      },
    });
  });

  createElevationTriangleLabelEntities(Cesium, addEntity, () => triangle, false, occlusionEnabled);

  return entities;
}
