import type { MapBounds } from './mapViewportService';

export type MapSearchTarget =
  | { kind: 'bounds'; bounds: MapBounds }
  | { kind: 'point'; longitude: number; latitude: number };

type NominatimSearchResult = {
  boundingbox?: [string, string, string, string];
  lat: string;
  lon: string;
};

export function parseCoordinateQuery(query: string): MapSearchTarget | null {
  const match = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);

  if (!match) {
    return null;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);

  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return { kind: 'point', longitude: first, latitude: second };
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { kind: 'point', longitude: second, latitude: first };
  }

  return null;
}

export async function searchMapLocation(query: string, signal?: AbortSignal): Promise<MapSearchTarget | null> {
  const trimmed = query.trim();

  if (!trimmed) {
    return null;
  }

  const coordinate = parseCoordinateQuery(trimmed);

  if (coordinate) {
    return coordinate;
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', trimmed);

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    return null;
  }

  const result = ((await response.json()) as NominatimSearchResult[])[0];

  if (!result) {
    return null;
  }

  const bounds = parseNominatimBounds(result.boundingbox);

  if (bounds) {
    return { kind: 'bounds', bounds };
  }

  const longitude = Number(result.lon);
  const latitude = Number(result.lat);

  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? { kind: 'point', longitude, latitude }
    : null;
}

function parseNominatimBounds(value: NominatimSearchResult['boundingbox']): MapBounds | null {
  if (!value || value.length !== 4) {
    return null;
  }

  const south = Number(value[0]);
  const north = Number(value[1]);
  const west = Number(value[2]);
  const east = Number(value[3]);

  return [west, south, east, north].every(Number.isFinite)
    ? [west, south, east, north]
    : null;
}

