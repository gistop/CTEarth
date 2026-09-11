import type maplibregl from 'maplibre-gl';

export const MAPLIBRE_TERRAIN_DEM_SOURCE_ID = 'terrain-dem';
export const MAPLIBRE_TERRAIN_HILLSHADE_SOURCE_ID = 'terrain-hillshade-dem';
export const MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID = 'terrain-hillshade';

const TERRAIN_DEM_TILEJSON_URL = 'https://tiles.mapterhorn.com/tilejson.json';
const TERRAIN_EXAGGERATION = 1.15;
type MapLibreSourceSpecification = Parameters<maplibregl.Map['addSource']>[1];

/**
 * Reconciles the MapLibre terrain runtime with the requested view mode.
 *
 * This intentionally does not use map.isStyleLoaded(). That API also waits for
 * every source/tile manager to finish loading, while disabling terrain is safe
 * and must remain possible during an in-flight DEM load.
 */
export function setMapLibreTerrainMode(map: maplibregl.Map, enabled: boolean) {
  return enabled ? enableTerrain(map) : disableTerrain(map);
}

function enableTerrain(map: maplibregl.Map) {
  try {
    ensureTerrainResources(map);

    if (!map.getSource(MAPLIBRE_TERRAIN_DEM_SOURCE_ID)
      || !map.getLayer(MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID)) {
      return false;
    }

    setHillshadeVisibility(map, 'visible');

    const terrain = map.getTerrain();

    if (terrain?.source !== MAPLIBRE_TERRAIN_DEM_SOURCE_ID
      || terrain.exaggeration !== TERRAIN_EXAGGERATION) {
      map.setTerrain({
        source: MAPLIBRE_TERRAIN_DEM_SOURCE_ID,
        exaggeration: TERRAIN_EXAGGERATION,
      });
    }

    return map.getTerrain()?.source === MAPLIBRE_TERRAIN_DEM_SOURCE_ID
      && getHillshadeVisibility(map) === 'visible';
  } catch {
    return false;
  }
}

function disableTerrain(map: maplibregl.Map) {
  let terrainDisabled = false;
  let hillshadeHidden = false;

  // Keep these operations independent: if one style API call temporarily
  // fails, the other should still move the map toward a planar state.
  try {
    if (map.getTerrain() !== null) {
      map.setTerrain(null);
    }

    terrainDisabled = map.getTerrain() === null;
  } catch {
    terrainDisabled = false;
  }

  try {
    if (!map.getLayer(MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID)) {
      hillshadeHidden = true;
    } else {
      setHillshadeVisibility(map, 'none');
      hillshadeHidden = getHillshadeVisibility(map) === 'none';
    }
  } catch {
    hillshadeHidden = false;
  }

  return terrainDisabled && hillshadeHidden;
}

function ensureTerrainResources(map: maplibregl.Map) {
  if (!map.getSource(MAPLIBRE_TERRAIN_DEM_SOURCE_ID)) {
    map.addSource(MAPLIBRE_TERRAIN_DEM_SOURCE_ID, createTerrainSourceDefinition());
  }

  if (!map.getSource(MAPLIBRE_TERRAIN_HILLSHADE_SOURCE_ID)) {
    map.addSource(MAPLIBRE_TERRAIN_HILLSHADE_SOURCE_ID, createTerrainSourceDefinition());
  }

  if (!map.getLayer(MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID)) {
    const firstNonBackgroundLayerId = map.getStyle().layers?.find((layer) => layer.type !== 'background')?.id;

    map.addLayer({
      id: MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID,
      type: 'hillshade',
      source: MAPLIBRE_TERRAIN_HILLSHADE_SOURCE_ID,
      layout: {
        visibility: 'none',
      },
      paint: {
        'hillshade-method': 'standard',
        'hillshade-illumination-direction': 315,
        'hillshade-shadow-color': '#2f3340',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': '#2f3340',
        'hillshade-exaggeration': 0.5,
      },
    }, firstNonBackgroundLayerId);
  }
}

function createTerrainSourceDefinition(): MapLibreSourceSpecification {
  return {
    type: 'raster-dem',
    url: TERRAIN_DEM_TILEJSON_URL,
    tileSize: 256,
  };
}

function setHillshadeVisibility(map: maplibregl.Map, visibility: 'visible' | 'none') {
  if (getHillshadeVisibility(map) !== visibility) {
    map.setLayoutProperty(MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID, 'visibility', visibility);
  }
}

function getHillshadeVisibility(map: maplibregl.Map) {
  return map.getLayoutProperty(MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID, 'visibility') ?? 'visible';
}
