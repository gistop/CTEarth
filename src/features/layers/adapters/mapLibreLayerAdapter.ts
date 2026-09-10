import type maplibregl from 'maplibre-gl';
import type { MapGroupRenderEntry } from '../../../mapGroupRenderState';
import {
  getRasterBasemapDefinitions,
  type RasterBasemapTileDefinition,
} from '../../../components/map/rasterBasemapSources';
import type { LayerEngineAdapter } from './layerAdapterTypes';

const RASTER_LAYER_IDS = ['idw-interpolation'];
const VECTOR_OVERLAY_LAYER_IDS = ['buffer-fill', 'buffer-outline'];

type MapLibreSourceSpecification = Parameters<maplibregl.Map['addSource']>[1];

export type MapLibreLayerSyncRequest = {
  map: maplibregl.Map;
  entries: MapGroupRenderEntry[];
  uploadedLayers: { id: string }[];
  rasterId: string | null;
  hasVectorOverlay: boolean;
  basemapVisible: boolean;
};

const mapLibreLayerAdapter: LayerEngineAdapter<MapLibreLayerSyncRequest> = {
  sync: syncMapLibreLayers,
};

/** Creates the concrete MapLibre adapter used to reconcile basemaps and layer order. */
export function createMapLibreLayerAdapter(): LayerEngineAdapter<MapLibreLayerSyncRequest> {
  return mapLibreLayerAdapter;
}

function syncMapLibreLayers({
  map,
  entries,
  uploadedLayers,
  rasterId,
  hasVectorOverlay,
  basemapVisible,
}: MapLibreLayerSyncRequest) {
  syncBasemapLayers(map, entries, basemapVisible);

  const uploadedIds = new Set(uploadedLayers.map((item) => item.id));
  const layerGroups = entries
    .map((entry) => layerGroupIdsForEntry(entry, uploadedIds, rasterId, hasVectorOverlay))
    .filter((ids) => ids.length > 0);

  [...layerGroups].reverse().forEach((groupIds) => {
    groupIds.forEach((id) => {
      if (map.getLayer(id)) {
        map.moveLayer(id);
      }
    });
  });
}

function syncBasemapLayers(
  map: maplibregl.Map,
  entries: MapGroupRenderEntry[],
  basemapVisible: boolean,
) {
  if (!map.isStyleLoaded()) {
    logMapLibreLayerState(map, 'basemap sync skipped: style not loaded', entries, basemapVisible);
    return;
  }

  const basemapEntries = entries.filter((entry) => entry.basemapId);
  const expectedLayerIds = new Set<string>();
  const expectedSourceIds = new Set<string>();

  basemapEntries.forEach((entry) => {
    getRasterBasemapDefinitions(entry.basemapSourceKind, entry.basemapId, entry.cesiumImageryId).forEach((definition) => {
      const opacity = entry.opacity ?? 1;
      const visible = entry.visible && basemapVisible;
      const layerId = getBasemapRenderLayerId(entry.id, definition.suffix);
      const sourceId = getBasemapRenderSourceId(entry.id, definition.suffix);
      expectedLayerIds.add(layerId);
      expectedSourceIds.add(sourceId);

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, createMapLibreRasterSource(definition));
      }

      const existingLayer = map.getLayer(layerId) as { source?: string } | undefined;

      if (!existingLayer || existingLayer.source !== sourceId) {
        if (existingLayer) {
          map.removeLayer(layerId);
        }

        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          layout: {
            visibility: visible ? 'visible' : 'none',
          },
        });
      }

      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      map.setPaintProperty(layerId, 'raster-opacity', opacity);
    });
  });

  map.getStyle().layers
    ?.map((layer) => layer.id)
    .filter((layerId) => layerId.startsWith('map-group-basemap-'))
    .filter((layerId) => !expectedLayerIds.has(layerId))
    .forEach((layerId) => {
      const existingLayer = map.getLayer(layerId) as { source?: string } | undefined;

      if (existingLayer) {
        map.removeLayer(layerId);
      }

      if (existingLayer?.source && !isSourceUsedByAnyLayer(map, existingLayer.source)) {
        map.removeSource(existingLayer.source);
      }
    });

  Object.keys(map.getStyle().sources)
    .filter((sourceId) => sourceId.startsWith('map-group-basemap-source-'))
    .filter((sourceId) => !expectedSourceIds.has(sourceId))
    .forEach((sourceId) => {
      if (!isSourceUsedByAnyLayer(map, sourceId)) {
        map.removeSource(sourceId);
      }
    });

  logMapLibreLayerState(map, 'basemap sync complete', entries, basemapVisible);
}

function layerGroupIdsForEntry(
  entry: MapGroupRenderEntry,
  uploadedIds: Set<string>,
  rasterId: string | null,
  hasVectorOverlay: boolean,
) {
  if (entry.layerId === 'basemap' && entry.basemapId) {
    return getRasterBasemapDefinitions(
      entry.basemapSourceKind,
      entry.basemapId,
      entry.cesiumImageryId,
    ).map((definition) => getBasemapRenderLayerId(entry.id, definition.suffix));
  }

  if (entry.layerId === 'vectorOverlay') {
    return hasVectorOverlay ? VECTOR_OVERLAY_LAYER_IDS : [];
  }

  if (entry.layerId.startsWith('uploaded:')) {
    const layerId = entry.layerId.slice('uploaded:'.length);
    return uploadedIds.has(layerId) ? uploadedLayerIds(layerId) : [];
  }

  if (entry.layerId.startsWith('raster:')) {
    return rasterId && entry.layerId === `raster:${rasterId}` ? RASTER_LAYER_IDS : [];
  }

  return [];
}

function uploadedLayerIds(layerId: string) {
  return [
    `uploaded-layer-${layerId}-fill`,
    `uploaded-layer-${layerId}-line`,
    `uploaded-layer-${layerId}-circle`,
    `uploaded-layer-${layerId}-label`,
  ];
}

function createMapLibreRasterSource(definition: RasterBasemapTileDefinition): MapLibreSourceSpecification {
  return {
    type: 'raster',
    tiles: definition.urls ?? (definition.url ? [definition.url] : []),
    tileSize: definition.tileSize ?? 256,
    attribution: definition.attribution,
    ...(definition.minZoom !== undefined ? { minzoom: definition.minZoom } : {}),
    ...(definition.maxZoom !== undefined ? { maxzoom: definition.maxZoom } : {}),
    ...(definition.scheme ? { scheme: definition.scheme } : {}),
  };
}

function getBasemapRenderLayerId(renderId: string, suffix: string) {
  return `map-group-basemap-${sanitizeLayerId(renderId)}-${suffix}`;
}

function getBasemapRenderSourceId(renderId: string, suffix: string) {
  return `map-group-basemap-source-${sanitizeLayerId(renderId)}-${suffix}`;
}

function isSourceUsedByAnyLayer(map: maplibregl.Map, sourceId: string) {
  return Boolean(map.getStyle().layers?.some((layer) => {
    const candidate = layer as { source?: string };
    return candidate.source === sourceId;
  }));
}

function sanitizeLayerId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function logMapLibreLayerState(
  map: maplibregl.Map,
  reason: string,
  entries: MapGroupRenderEntry[],
  basemapVisible: boolean,
) {
  if (!shouldLogMapLibreLayers()) {
    return;
  }

  const style = map.getStyle();
  const layers = (style.layers ?? []).map((layer) => {
    const layerWithSource = layer as {
      id: string;
      type?: string;
      source?: string;
      layout?: { visibility?: string };
    };
    const layerExists = Boolean(map.getLayer(layer.id));

    return {
      id: layer.id,
      type: layer.type,
      source: layerWithSource.source ?? '',
      visibility: layerExists
        ? map.getLayoutProperty(layer.id, 'visibility') ?? 'visible'
        : layerWithSource.layout?.visibility ?? 'visible',
      rasterOpacity: layerExists && layer.type === 'raster'
        ? map.getPaintProperty(layer.id, 'raster-opacity')
        : '',
    };
  });
  const sources = Object.entries(style.sources).map(([id, source]) => {
    const sourceSpec = source as { type?: string; tiles?: string[]; url?: string };

    return {
      id,
      type: sourceSpec.type ?? '',
      url: sourceSpec.url ?? '',
      tiles: sourceSpec.tiles?.join(', ') ?? '',
    };
  });
  const basemapEntries = entries.map((entry) => ({
    id: entry.id,
    basemapId: entry.basemapId ?? '',
    sourceKind: entry.basemapSourceKind ?? 'basemap',
    cesiumImageryId: entry.cesiumImageryId ?? '',
    entryVisible: entry.visible,
    globalBasemapVisible: basemapVisible,
    renderedVisible: Boolean(entry.basemapId && entry.visible && basemapVisible),
    opacity: entry.opacity ?? 1,
  }));

  console.groupCollapsed(`[CTEarth MapLibre] ${reason}`);
  console.info('isStyleLoaded:', map.isStyleLoaded());
  console.info('zoom:', map.getZoom(), 'center:', map.getCenter().toArray());
  console.table(basemapEntries);
  console.table(layers);
  console.table(sources);
  console.groupEnd();
}

function shouldLogMapLibreLayers() {
  if (import.meta.env.DEV) {
    return true;
  }

  try {
    return window.localStorage.getItem('ctearth.debugMapLibre') === '1';
  } catch {
    return false;
  }
}
