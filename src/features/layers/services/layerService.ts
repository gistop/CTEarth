import type { LayerOrderId } from '../../../gisStore';

export function displayLayerName(fileName: string) {
  let name = (fileName || 'layer').replace(/^.*[\\/]/, '').trim() || 'layer';

  while (true) {
    const next = name.replace(/\.(zip|csv|geojson|json|shp|gpkg|geopackage|geoparquet|tif|tiff|geotiff)$/i, '');
    if (next === name) {
      return name;
    }
    name = next || 'layer';
  }
}

/** Remove duplicate layer ids while preserving the first-seen order. */
export function normalizeLayerOrder(order: LayerOrderId[]) {
  const seen = new Set<LayerOrderId>();
  const normalized: LayerOrderId[] = [];

  for (const id of order) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

/** Keep user-facing names stable when a source contains a file path. */
export function normalizeLayerName(name: string) {
  return name.trim().replace(/^.*[\\/]/, '');
}
