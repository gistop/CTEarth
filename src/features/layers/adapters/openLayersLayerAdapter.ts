import Map from 'ol/Map.js';
import type BaseLayer from 'ol/layer/Base.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import type { MapGroupRenderEntry } from '../../../mapGroupRenderState';
import {
  getRasterBasemapDefinitions,
  type RasterBasemapTileDefinition,
} from '../../../components/map/rasterBasemapSources';
import type { LayerEngineAdapter } from './layerAdapterTypes';

export type OpenLayersBasemapLayer = TileLayer<OSM | XYZ>;

type OpenLayersLayerOrderTargets = {
  uploadedLayer?: BaseLayer | null;
  rasterLayer?: BaseLayer | null;
  vectorOverlayLayer?: BaseLayer | null;
  rasterId?: string | null;
};

export type OpenLayersLayerSyncRequest = {
  map: Map;
  entries: MapGroupRenderEntry[];
  basemapLayers: globalThis.Map<string, OpenLayersBasemapLayer>;
  basemapLayerIdPrefix: string;
  basemapVisible?: boolean;
  stacking: 'background' | 'ordered';
  orderTargets?: OpenLayersLayerOrderTargets;
};

const openLayersLayerAdapter: LayerEngineAdapter<OpenLayersLayerSyncRequest> = {
  sync: syncOpenLayersLayers,
};

/** Creates the concrete OpenLayers adapter used to reconcile basemaps and z-order. */
export function createOpenLayersLayerAdapter(): LayerEngineAdapter<OpenLayersLayerSyncRequest> {
  return openLayersLayerAdapter;
}

function syncOpenLayersLayers({
  map,
  entries,
  basemapLayers,
  basemapLayerIdPrefix,
  basemapVisible = true,
  stacking,
  orderTargets,
}: OpenLayersLayerSyncRequest) {
  const expectedIds = new Set<string>();
  const topZIndex = entries.length;
  const zIndexByEntryId = new globalThis.Map<string, number>();
  let uploadedZIndex = 0;

  entries.forEach((entry, index) => {
    const entryZIndex = stacking === 'background'
      ? index - topZIndex - 1
      : topZIndex - index;
    zIndexByEntryId.set(entry.id, entryZIndex);

    if (!entry.basemapId) {
      if (stacking === 'ordered' && entry.layerId.startsWith('uploaded:')) {
        uploadedZIndex = Math.max(uploadedZIndex, entryZIndex);
      }

      return;
    }

    getRasterBasemapDefinitions(entry.basemapSourceKind, entry.basemapId, entry.cesiumImageryId).forEach((definition) => {
      const layerId = getBasemapLayerId(basemapLayerIdPrefix, entry.id, definition.suffix);
      expectedIds.add(layerId);

      let layer = basemapLayers.get(layerId);

      if (!layer) {
        layer = createBasemapLayer(definition);
        map.addLayer(layer);
        basemapLayers.set(layerId, layer);
      } else {
        layer.setSource(createBasemapSource(definition));
      }

      layer.setVisible(entry.visible && basemapVisible);
      layer.setOpacity(entry.opacity ?? 1);
      layer.setZIndex(entryZIndex);
    });
  });

  basemapLayers.forEach((layer, layerId) => {
    if (expectedIds.has(layerId)) {
      return;
    }

    map.removeLayer(layer);
    basemapLayers.delete(layerId);
  });

  if (stacking !== 'ordered' || !orderTargets) {
    return;
  }

  orderTargets.uploadedLayer?.setZIndex(uploadedZIndex || topZIndex + 1);
  orderTargets.rasterLayer?.setZIndex(
    zIndexByEntryId.get(orderTargets.rasterId ? `raster:${orderTargets.rasterId}` : '') ?? 0,
  );
  orderTargets.vectorOverlayLayer?.setZIndex(zIndexByEntryId.get('vectorOverlay') ?? 0);
}

function createBasemapLayer(definition: RasterBasemapTileDefinition): OpenLayersBasemapLayer {
  return new TileLayer({
    source: createBasemapSource(definition),
    visible: false,
  });
}

function createBasemapSource(definition: RasterBasemapTileDefinition) {
  if (definition.urls) {
    return new XYZ({
      urls: definition.urls,
      attributions: definition.attribution,
      tileSize: definition.tileSize,
      minZoom: definition.minZoom,
      maxZoom: definition.maxZoom,
    });
  }

  if (definition.url) {
    return new XYZ({
      url: definition.url,
      attributions: definition.attribution,
      tileSize: definition.tileSize,
      minZoom: definition.minZoom,
      maxZoom: definition.maxZoom,
    });
  }

  return new OSM({ attributions: definition.attribution });
}

function getBasemapLayerId(prefix: string, renderId: string, suffix: string) {
  return `${prefix}-${sanitizeLayerId(renderId)}-${suffix}`;
}

function sanitizeLayerId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
