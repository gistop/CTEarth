import type maplibregl from 'maplibre-gl';
import type { MapViewMode } from '../components/map/MapCommandContext';
import type { MapGroupRenderEntry } from '../../../mapGroupRenderState';
import {
  MAPLIBRE_TERRAIN_DEM_SOURCE_ID,
  MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID,
  MAPLIBRE_TERRAIN_HILLSHADE_SOURCE_ID,
} from './mapTerrainModeService';

type MapTerrainDiagnosticContext = {
  map: maplibregl.Map | null;
  mapMode: MapViewMode;
  displayCrs: string;
  basemap: string;
  basemapSourceKind: string;
  basemapVisible: boolean;
  mapGroupEntries: readonly MapGroupRenderEntry[];
};

/**
 * Writes a public-API-only snapshot of the active MapLibre terrain state.
 * This is intentionally opt-in and is called by the map diagnostics button.
 */
export function logMapTerrainDiagnostics({
  map,
  mapMode,
  displayCrs,
  basemap,
  basemapSourceKind,
  basemapVisible,
  mapGroupEntries,
}: MapTerrainDiagnosticContext) {
  const title = '[CTEarth] map terrain diagnostic';

  if (!map) {
    console.groupCollapsed(title);
    console.warn('MapLibre instance is not available. The active surface may be OpenLayers or Cesium.');
    console.info({ mapMode, displayCrs, basemap, basemapSourceKind, basemapVisible, mapGroupEntries });
    console.groupEnd();
    return;
  }

  let style: maplibregl.StyleSpecification;

  try {
    style = map.getStyle();
  } catch (error) {
    console.groupCollapsed(title);
    console.error('Unable to read the current MapLibre style.', error);
    console.groupEnd();
    return;
  }

  const sources = style.sources ?? {};
  const layers = style.layers ?? [];
  const center = map.getCenter();
  const terrainSources = Object.entries(sources)
    .filter(([id, source]) => isTerrainLikeId(id) || isTerrainLikeSource(source))
    .map(([id, source]) => ({
      id,
      type: getSourceType(source),
      loaded: getSourceLoaded(map, id),
      source,
    }));
  const terrainLayers = layers
    .filter((layer) => isTerrainLikeLayer(layer))
    .map((layer) => ({
      id: layer.id,
      type: layer.type,
      source: getLayerSource(layer),
      visibility: getVisibility(map, layer.id),
      paint: getPaintSnapshot(map, layer.id, layer.type),
    }));
  const basemapLayers = layers
    .filter((layer) => isBasemapLayer(layer))
    .map((layer) => ({
      id: layer.id,
      type: layer.type,
      source: getLayerSource(layer),
      visibility: getVisibility(map, layer.id),
      opacity: getRasterOpacity(map, layer.id, layer.type),
    }));
  const visibleRasterLayers = layers
    .filter((layer) => layer.type === 'raster' && getVisibility(map, layer.id) !== 'none')
    .map((layer) => ({
      id: layer.id,
      source: getLayerSource(layer),
      visibility: getVisibility(map, layer.id),
      opacity: getRasterOpacity(map, layer.id, layer.type),
    }));
  const terrain = readSafely(() => map.getTerrain(), null);
  const queryTerrainElevation = readSafely(() => map.queryTerrainElevation(center), null);
  const snapshot = {
    capturedAt: new Date().toISOString(),
    mapMode,
    displayCrs,
    basemap,
    basemapSourceKind,
    basemapVisible,
    mapGroupEntries,
    styleLoaded: readSafely(() => map.isStyleLoaded(), false),
    styleTerrain: style.terrain ?? null,
    terrain,
    camera: {
      pitch: readSafely(() => map.getPitch(), null),
      bearing: readSafely(() => map.getBearing(), null),
      zoom: readSafely(() => map.getZoom(), null),
      center: { longitude: center.lng, latitude: center.lat },
      centerElevation: readSafely(() => map.getCenterElevation(), null),
      centerClampedToGround: readSafely(() => map.getCenterClampedToGround(), null),
      queryTerrainElevation,
    },
    interaction: {
      isMoving: readSafely(() => map.isMoving(), false),
      isEasing: readSafely(() => map.isEasing(), false),
      isRotating: readSafely(() => map.isRotating(), false),
      isZooming: readSafely(() => map.isZooming(), false),
      dragRotateEnabled: readSafely(() => map.dragRotate.isEnabled(), false),
      areTilesLoaded: readSafely(() => map.areTilesLoaded(), false),
    },
    knownTerrainIds: {
      demSource: hasSource(map, MAPLIBRE_TERRAIN_DEM_SOURCE_ID),
      demSourceLoaded: getSourceLoaded(map, MAPLIBRE_TERRAIN_DEM_SOURCE_ID),
      hillshadeSource: hasSource(map, MAPLIBRE_TERRAIN_HILLSHADE_SOURCE_ID),
      hillshadeSourceLoaded: getSourceLoaded(map, MAPLIBRE_TERRAIN_HILLSHADE_SOURCE_ID),
      hillshadeLayer: hasLayer(map, MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID),
      hillshadeVisibility: getVisibility(map, MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID),
    },
    terrainSources,
    terrainLayers,
    basemapLayers,
    visibleRasterLayers,
  };

  console.groupCollapsed(title);
  console.info('Snapshot', snapshot);
  console.info('Interpretation', {
    terrainEnabled: snapshot.terrain !== null,
    cameraIsPlanar: snapshot.camera.pitch === 0 && snapshot.camera.bearing === 0,
    hillshadeVisible: snapshot.knownTerrainIds.hillshadeVisibility === 'visible',
    visibleRasterLayerCount: visibleRasterLayers.length,
  });
  console.table(terrainSources.map(({ id, type, loaded }) => ({ id, type, loaded })));
  console.table(terrainLayers);
  console.table(basemapLayers);
  console.table(visibleRasterLayers);
  console.info('All style sources', sources);
  console.info('All style layers', layers);
  console.groupEnd();

  // A mode switch uses an easeTo animation. Capturing once after idle helps
  // distinguish a transient state during that animation from the final state.
  if (snapshot.interaction.isMoving || snapshot.interaction.isEasing) {
    try {
      map.once('idle', () => {
        try {
          console.info('[CTEarth] map terrain diagnostic after idle', {
            capturedAt: new Date().toISOString(),
            terrain: map.getTerrain(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
            hillshadeVisibility: getVisibility(map, MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID),
            basemapVisible,
            visibleRasterLayers: map.getStyle().layers
              ?.filter((layer) => layer.type === 'raster' && getVisibility(map, layer.id) !== 'none')
              .map((layer) => ({ id: layer.id, source: getLayerSource(layer) })) ?? [],
          });
        } catch (error) {
          console.warn('[CTEarth] Unable to capture the post-idle terrain diagnostic.', error);
        }
      });
    } catch (error) {
      console.warn('[CTEarth] Unable to schedule the post-idle terrain diagnostic.', error);
    }
  }
}

function isTerrainLikeId(id: string) {
  return /(terrain|hillshade|dem|elevation|relief)/i.test(id);
}

function isTerrainLikeSource(source: unknown) {
  return getSourceType(source) === 'raster-dem';
}

function isTerrainLikeLayer(layer: maplibregl.LayerSpecification) {
  const source = getLayerSource(layer);

  return isTerrainLikeId(layer.id)
    || isTerrainLikeId(source)
    || layer.type === 'hillshade'
    || layer.type === 'color-relief';
}

function isBasemapLayer(layer: maplibregl.LayerSpecification) {
  return layer.id.startsWith('map-group-basemap-')
    || getLayerSource(layer).startsWith('map-group-basemap-source-');
}

function getLayerSource(layer: maplibregl.LayerSpecification) {
  return 'source' in layer && typeof layer.source === 'string' ? layer.source : '';
}

function getSourceType(source: unknown) {
  return isRecord(source) && typeof source.type === 'string' ? source.type : 'unknown';
}

function hasSource(map: maplibregl.Map, sourceId: string) {
  return readSafely(() => Boolean(map.getSource(sourceId)), false);
}

function hasLayer(map: maplibregl.Map, layerId: string) {
  return readSafely(() => Boolean(map.getLayer(layerId)), false);
}

function getSourceLoaded(map: maplibregl.Map, sourceId: string) {
  if (!hasSource(map, sourceId)) {
    return 'missing' as const;
  }

  return readSafely(() => map.isSourceLoaded(sourceId), false);
}

function getVisibility(map: maplibregl.Map, layerId: string) {
  if (!hasLayer(map, layerId)) {
    return 'missing';
  }

  return readSafely(() => map.getLayoutProperty(layerId, 'visibility') ?? 'visible', 'unknown');
}

function getRasterOpacity(map: maplibregl.Map, layerId: string, layerType: string) {
  if (layerType !== 'raster' || !hasLayer(map, layerId)) {
    return undefined;
  }

  return readSafely(() => map.getPaintProperty(layerId, 'raster-opacity'), undefined);
}

function getPaintSnapshot(map: maplibregl.Map, layerId: string, layerType: string) {
  if (!hasLayer(map, layerId)) {
    return undefined;
  }

  const properties = layerType === 'hillshade'
    ? ['hillshade-exaggeration', 'hillshade-illumination-direction', 'hillshade-shadow-color', 'hillshade-highlight-color']
    : layerType === 'color-relief'
      ? ['color-relief-opacity']
      : [];

  return Object.fromEntries(properties.map((property) => [
    property,
    readSafely(() => map.getPaintProperty(layerId, property), undefined),
  ]));
}

function readSafely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
