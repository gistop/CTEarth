export type MapBounds = [west: number, south: number, east: number, north: number];
export type MapPoint = [longitude: number, latitude: number];

export const DEFAULT_MAP_CENTER: MapPoint = [10.4515, 51.1657];
export const DEFAULT_MAP_ZOOM = 5.3;

export function combineMapBounds(current: MapBounds | null, next: MapBounds | null): MapBounds | null {
  if (!current) {
    return next;
  }

  if (!next) {
    return current;
  }

  return [
    Math.min(current[0], next[0]),
    Math.min(current[1], next[1]),
    Math.max(current[2], next[2]),
    Math.max(current[3], next[3]),
  ];
}

export function boundsFromCoordinates(coordinates: readonly MapPoint[]): MapBounds | null {
  if (coordinates.length === 0) {
    return null;
  }

  const bounds = coordinates.reduce<MapBounds>(
    (current, [longitude, latitude]) => [
      Math.min(current[0], longitude),
      Math.min(current[1], latitude),
      Math.max(current[2], longitude),
      Math.max(current[3], latitude),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );

  return isFiniteBounds(bounds) ? bounds : null;
}

export function padMapBounds(bounds: MapBounds, ratio: number): MapBounds | null {
  if (!isGeographicBounds(bounds)) {
    return null;
  }

  const [west, south, east, north] = bounds;
  const longitudePadding = Math.max((east - west) * ratio, 0.01);
  const latitudePadding = Math.max((north - south) * ratio, 0.01);

  return [
    Math.max(-180, west - longitudePadding),
    clampLatitude(south - latitudePadding),
    Math.min(180, east + longitudePadding),
    clampLatitude(north + latitudePadding),
  ];
}

export function isGeographicBounds(bounds: MapBounds) {
  const [west, south, east, north] = bounds;

  return isFiniteBounds(bounds)
    && west >= -180
    && east <= 180
    && south >= -90
    && north <= 90
    && west <= east
    && south <= north;
}

export function isFiniteBounds(bounds: MapBounds) {
  return bounds.every(Number.isFinite);
}

export function clampLatitude(value: number) {
  return Math.max(-90, Math.min(90, value));
}

