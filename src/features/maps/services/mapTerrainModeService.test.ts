import type maplibregl from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import {
  MAPLIBRE_TERRAIN_DEM_SOURCE_ID,
  MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID,
  MAPLIBRE_TERRAIN_HILLSHADE_SOURCE_ID,
  setMapLibreTerrainMode,
} from './mapTerrainModeService';

type TerrainState = ReturnType<maplibregl.Map['getTerrain']>;

describe('mapTerrainModeService', () => {
  it('disables terrain while DEM sources are still loading', () => {
    const harness = createMapHarness({
      resourcesExist: true,
      terrain: { source: MAPLIBRE_TERRAIN_DEM_SOURCE_ID, exaggeration: 1.15 },
      visibility: 'visible',
    });

    expect(harness.map.isStyleLoaded()).toBe(false);
    expect(setMapLibreTerrainMode(harness.map, false)).toBe(true);
    expect(harness.setTerrain).toHaveBeenCalledWith(null);
    expect(harness.setLayoutProperty).toHaveBeenCalledWith(
      MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID,
      'visibility',
      'none',
    );
    expect(harness.getTerrain()).toBeNull();
    expect(harness.getVisibility()).toBe('none');
  });

  it('creates terrain resources and enables terrain idempotently', () => {
    const harness = createMapHarness({
      resourcesExist: false,
      terrain: null,
      visibility: 'none',
    });

    expect(setMapLibreTerrainMode(harness.map, true)).toBe(true);
    expect(harness.addSource).toHaveBeenCalledTimes(2);
    expect(harness.addLayer).toHaveBeenCalledTimes(1);
    expect(harness.setTerrain).toHaveBeenCalledTimes(1);
    expect(harness.getTerrain()).toMatchObject({ source: MAPLIBRE_TERRAIN_DEM_SOURCE_ID });
    expect(harness.getVisibility()).toBe('visible');

    harness.setTerrain.mockClear();
    harness.setLayoutProperty.mockClear();

    expect(setMapLibreTerrainMode(harness.map, true)).toBe(true);
    expect(harness.setTerrain).not.toHaveBeenCalled();
    expect(harness.setLayoutProperty).not.toHaveBeenCalled();
  });
});

function createMapHarness({
  resourcesExist,
  terrain: initialTerrain,
  visibility: initialVisibility,
}: {
  resourcesExist: boolean;
  terrain: TerrainState;
  visibility: 'visible' | 'none';
}) {
  const sources = new Set<string>(resourcesExist
    ? [MAPLIBRE_TERRAIN_DEM_SOURCE_ID, MAPLIBRE_TERRAIN_HILLSHADE_SOURCE_ID]
    : []);
  let hillshadeLayerExists = resourcesExist;
  let terrain = initialTerrain;
  let visibility = initialVisibility;

  const isStyleLoaded = vi.fn(() => false);
  const addSource = vi.fn((id: string) => {
    sources.add(id);
  });
  const addLayer = vi.fn((layer: maplibregl.LayerSpecification) => {
    hillshadeLayerExists = layer.id === MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID;
    visibility = layer.layout?.visibility === 'visible' ? 'visible' : 'none';
  });
  const setTerrain = vi.fn((nextTerrain: TerrainState) => {
    terrain = nextTerrain;
  });
  const setLayoutProperty = vi.fn((layerId: string, property: string, value: unknown) => {
    if (layerId === MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID
      && property === 'visibility'
      && (value === 'visible' || value === 'none')) {
      visibility = value;
    }
  });

  const map = {
    addLayer,
    addSource,
    getLayer: vi.fn((id: string) => (
      id === MAPLIBRE_TERRAIN_HILLSHADE_LAYER_ID && hillshadeLayerExists ? { id } : undefined
    )),
    getLayoutProperty: vi.fn(() => visibility),
    getSource: vi.fn((id: string) => (sources.has(id) ? { id } : undefined)),
    getStyle: vi.fn(() => ({
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background' }],
    })),
    getTerrain: vi.fn(() => terrain),
    isStyleLoaded,
    setLayoutProperty,
    setTerrain,
  } as unknown as maplibregl.Map;

  return {
    addLayer,
    addSource,
    getTerrain: () => terrain,
    getVisibility: () => visibility,
    isStyleLoaded,
    map,
    setLayoutProperty,
    setTerrain,
  };
}
