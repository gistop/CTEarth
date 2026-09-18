import Map from 'ol/Map.js';
import type BaseLayer from 'ol/layer/Base.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import type { MapGroupRenderEntry } from '../../../mapGroupRenderState';
import {
  getRasterBasemapDefinitions,
  type RasterBasemapTileDefinition,
} from '../../maps/components/map/rasterBasemapSources';
import ImageLayer from 'ol/layer/Image.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import { transform } from 'ol/proj.js';
import type { LayerEngineAdapter, RasterRenderData } from './layerAdapterTypes';

export function syncOpenLayersRasters(
  map: Map,
  rasterLayers: globalThis.Map<string, ImageLayer<ImageStatic>>,
  rasters: RasterRenderData[],
  visibility: Record<string, boolean>,
  opacity: number,
  fallbackVisible: boolean,
  projection: string,
) {
  const expectedIds = new Set(rasters.map((raster) => raster.id));
  rasterLayers.forEach((layer, id) => {
    if (!expectedIds.has(id)) {
      map.removeLayer(layer);
      layer.dispose();
      rasterLayers.delete(id);
    }
  });
  rasters.forEach((raster) => {
    let layer = rasterLayers.get(raster.id);
    if (!layer) {
      layer = new ImageLayer<ImageStatic>();
      rasterLayers.set(raster.id, layer);
      map.addLayer(layer);
    }
    const coordinates = raster.coordinates.map((coordinate) => transform(coordinate, 'EPSG:4326', projection));
    const extent = [
      Math.min(...coordinates.map(([x]) => x)), Math.min(...coordinates.map(([, y]) => y)),
      Math.max(...coordinates.map(([x]) => x)), Math.max(...coordinates.map(([, y]) => y)),
    ];
    const source = layer.getSource();
    if (!source || source.getUrl() !== raster.imageUrl
      || source.getProjection()?.getCode() !== projection
      || source.getImageExtent().some((value, index) => value !== extent[index])) {
      layer.setSource(new ImageStatic({ imageExtent: extent, projection, url: raster.imageUrl }));
    }
    layer.setVisible(visibility[raster.id] ?? fallbackVisible);
    layer.setOpacity(opacity);
  });
}

export type OpenLayersBasemapLayer = TileLayer<OSM | XYZ>;

type OpenLayersLayerOrderTargets = {
  uploadedLayer?: BaseLayer | null;
  rasterLayers?: globalThis.Map<string, ImageLayer<ImageStatic>>;
  rasterLayer?: BaseLayer | null;
  rasterId?: string | null;
  vectorOverlayLayer?: BaseLayer | null;
};

export type OpenLayersLayerSyncRequest = {
  map: Map;
  entries: MapGroupRenderEntry[];
  basemapLayers: globalThis.Map<string, OpenLayersBasemapLayer>;
  basemapLayerIdPrefix: string;
  basemapVisible?: boolean;
  stacking: 'background' | 'ordered';
  orderTargets?: OpenLayersLayerOrderTargets;
  crossOrigin?: string | null;
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
  crossOrigin,
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
        layer = createBasemapLayer(definition, crossOrigin);
        map.addLayer(layer);
        basemapLayers.set(layerId, layer);
      } else {
        layer.setSource(createBasemapSource(definition, crossOrigin));
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
  orderTargets.rasterLayers?.forEach((layer, id) => {
    layer.setZIndex(zIndexByEntryId.get(`raster:${id}`) ?? 0);
  });
  orderTargets.vectorOverlayLayer?.setZIndex(zIndexByEntryId.get('vectorOverlay') ?? 0);
}

function createBasemapLayer(definition: RasterBasemapTileDefinition, crossOrigin?: string | null): OpenLayersBasemapLayer {
  return new TileLayer({
    source: createBasemapSource(definition, crossOrigin),
    visible: false,
  });
}

function createBasemapSource(definition: RasterBasemapTileDefinition, crossOrigin?: string | null) {
  if (definition.urls) {
    return new XYZ({
      urls: definition.urls,
      crossOrigin,
      attributions: definition.attribution,
      tileSize: definition.tileSize,
      minZoom: definition.minZoom,
      maxZoom: definition.maxZoom,
    });
  }

  if (definition.url) {
    return new XYZ({
      url: definition.url,
      crossOrigin,
      attributions: definition.attribution,
      tileSize: definition.tileSize,
      minZoom: definition.minZoom,
      maxZoom: definition.maxZoom,
    });
  }

  return new OSM({ attributions: definition.attribution, crossOrigin });
}

function getBasemapLayerId(prefix: string, renderId: string, suffix: string) {
  return `${prefix}-${sanitizeLayerId(renderId)}-${suffix}`;
}

function sanitizeLayerId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
