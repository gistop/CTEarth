import { describe, expect, it, vi } from 'vitest';
import type maplibregl from 'maplibre-gl';
import type OlMap from 'ol/Map.js';
import ImageLayer from 'ol/layer/Image.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import type { MapGroupRenderEntry } from '../../../mapGroupRenderState';
import type { RasterRenderData } from './layerAdapterTypes';
import { createMapLibreLayerAdapter, syncMapLibreRasters } from './mapLibreLayerAdapter';
import { createOpenLayersLayerAdapter, syncOpenLayersRasters } from './openLayersLayerAdapter';
import { createCesiumLayerAdapter, type CesiumLayerSyncRequest } from './cesiumLayerAdapter';

const a: RasterRenderData = { id: 'A', imageUrl: 'a.png', coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] };
const b: RasterRenderData = { ...a, id: 'B', imageUrl: 'b.png' };
const entries: MapGroupRenderEntry[] = [b, a].map(({ id }) => ({
  id: `raster:${id}`, layerId: `raster:${id}`, groupId: 'map', instanceId: id, visible: true,
}));

function mapLibreMock() {
  const layers = new Map<string, { id: string }>();
  const sources: Record<string, { url: string; coordinates: RasterRenderData['coordinates']; updateImage: ReturnType<typeof vi.fn> }> = {};
  const visibility: Record<string, string> = {};
  const map = {
    getStyle: () => ({ layers: [...layers.values()], sources }),
    getLayer: (id: string) => layers.get(id),
    getSource: (id: string) => sources[id],
    addSource: vi.fn((id: string, source: { url: string; coordinates: RasterRenderData['coordinates'] }) => {
      sources[id] = { ...source, updateImage: vi.fn() };
    }),
    addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    removeSource: vi.fn((id: string) => { delete sources[id]; }),
    setLayoutProperty: vi.fn((id: string, _: string, value: string) => { visibility[id] = value; }),
    setPaintProperty: vi.fn(),
    moveLayer: vi.fn(),
    isStyleLoaded: () => true,
  };
  return { map: map as unknown as maplibregl.Map, api: map, layers, sources, visibility };
}

describe('independent raster rendering', () => {
  it('keeps both MapLibre rasters, reuses sources, hides B and removes only deleted resources', () => {
    const { map, api, sources, layers, visibility } = mapLibreMock();
    syncMapLibreRasters(map, [a], {}, 1, true);
    const sourceA = sources['raster-overlay-A'];
    syncMapLibreRasters(map, [b, a], {}, 1, true);
    expect(layers.size).toBe(2);
    expect(sources['raster-overlay-A']).toBe(sourceA);
    syncMapLibreRasters(map, [b, a], { B: false }, 0.4, true);
    expect(visibility).toEqual({ 'raster-overlay-A': 'visible', 'raster-overlay-B': 'none' });
    expect(sourceA.updateImage).not.toHaveBeenCalled();
    expect(api.setPaintProperty).toHaveBeenCalledWith('raster-overlay-A', 'raster-opacity', 0.4);
    createMapLibreLayerAdapter().sync({ map, entries, rasters: [b, a], uploadedLayers: [], hasVectorOverlay: false, basemapVisible: false });
    expect(api.moveLayer.mock.calls.map(([id]) => id)).toEqual(['raster-overlay-A', 'raster-overlay-B']);
    syncMapLibreRasters(map, [a], {}, 1, true);
    expect([...layers.keys()]).toEqual(['raster-overlay-A']);
    expect(Object.keys(sources)).toEqual(['raster-overlay-A']);
    syncMapLibreRasters(map, [], {}, 1, true);
    expect(layers.size).toBe(0);
    expect(Object.keys(sources)).toHaveLength(0);
  });

  it('maintains separate OpenLayers images, visibility, order and cleanup', () => {
    const map = { addLayer: vi.fn(), removeLayer: vi.fn() } as unknown as OlMap;
    const layers = new Map<string, ImageLayer<ImageStatic>>();
    syncOpenLayersRasters(map, layers, [a], {}, 1, true, 'EPSG:4326');
    const sourceA = layers.get('A')!.getSource();
    syncOpenLayersRasters(map, layers, [b, a], { B: false }, 0.5, true, 'EPSG:4326');
    expect(layers.size).toBe(2);
    expect(layers.get('A')!.getSource()).toBe(sourceA);
    expect(layers.get('A')!.getVisible()).toBe(true);
    expect(layers.get('B')!.getVisible()).toBe(false);
    expect(layers.get('A')!.getOpacity()).toBe(0.5);
    createOpenLayersLayerAdapter().sync({ map, entries, basemapLayers: new Map(), basemapLayerIdPrefix: 'test', stacking: 'ordered', orderTargets: { rasterLayers: layers } });
    expect(layers.get('B')!.getZIndex()).toBeGreaterThan(layers.get('A')!.getZIndex()!);
    const removed = layers.get('B')!;
    syncOpenLayersRasters(map, layers, [a], {}, 1, true, 'EPSG:4326');
    expect(map.removeLayer).toHaveBeenCalledWith(removed);
    expect([...layers.keys()]).toEqual(['A']);
    syncOpenLayersRasters(map, layers, [], {}, 1, true, 'EPSG:4326');
    expect(layers.size).toBe(0);
  });

  it('renders all Cesium rasters in draw order and preserves A when B is hidden or deleted', async () => {
    const images: { provider: { url: string }; alpha: number; show: boolean }[] = [];
    const request = {
      viewer: {
        imageryLayers: {
          removeAll: () => { images.length = 0; },
          addImageryProvider: (provider: { url: string }) => {
            const image = { provider, alpha: 1, show: true };
            images.push(image);
            return image;
          },
        },
        dataSources: { removeAll: vi.fn() },
      },
      Cesium: {
        SingleTileImageryProvider: class { url: string; constructor(options: { url: string }) { this.url = options.url; } },
        Rectangle: { fromDegrees: vi.fn() },
      },
      isActive: () => true, entries, rasters: [b, a],
      layerVisibility: { basemap: false, raster: true, vectorOverlay: false },
      rasterLayerVisibility: {}, rasterStyle: { opacity: 0.6 }, layers: [],
      uploadedLayerVisibility: {}, uploadedLayerStyles: {}, vectorOverlay: null,
      vectorOverlayStyle: { fillColor: '#000000', fillOpacity: 1, lineColor: '#000000', lineWidth: 1 },
    } as unknown as CesiumLayerSyncRequest;
    const adapter = createCesiumLayerAdapter();
    await adapter.sync(request);
    expect(images.map((image) => image.provider.url)).toEqual(['a.png', 'b.png']);
    expect(images.every((image) => image.alpha === 0.6)).toBe(true);
    await adapter.sync({ ...request, rasterLayerVisibility: { B: false } });
    expect(images.map((image) => image.provider.url)).toEqual(['a.png']);
    await adapter.sync({ ...request, rasters: [a] });
    expect(images.map((image) => image.provider.url)).toEqual(['a.png']);
    await adapter.sync({ ...request, rasters: [] });
    expect(images).toHaveLength(0);
  });
});
