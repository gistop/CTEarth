// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type View from 'ol/View.js';
import type BaseLayer from 'ol/layer/Base.js';
import type VectorLayer from 'ol/layer/Vector.js';
import type TileLayer from 'ol/layer/Tile.js';
import type XYZ from 'ol/source/XYZ.js';
import type Observable from 'ol/Observable.js';
import type { Style } from 'ol/style.js';
import { get as getProjection } from 'ol/proj.js';
import { createOpenLayersLayoutMap } from './openLayersLayoutMapAdapter';
import { compositeMapCanvases } from './mapCanvasCapture';
import { createLayoutMapInput, createLayoutPointLayer } from '../testing/layoutMapFixtures';
import type { LayoutMapOptions, LayoutMapRuntime } from './layoutMapTypes';

const mapCreated = vi.hoisted(() => vi.fn());
vi.mock('ol/Map.js', async () => {
  const { default: Observable } = await import('ol/Observable.js');
  return { default: class TestMap extends Observable {
    view: View;
    layers: BaseLayer[];
    viewport = document.createElement('div');
    size = [752, 504];
    completeRenders = true;
    updateSize = vi.fn();
    setTarget = vi.fn();
    addControl = vi.fn();
    removeControl = vi.fn();
    renderSync = vi.fn(() => { if (this.completeRenders) this.dispatchEvent('rendercomplete'); });
    constructor(options: { view: View; layers: BaseLayer[] }) {
      super();
      this.view = options.view;
      this.layers = options.layers;
      this.view.setViewportSize(this.size);
      mapCreated(this);
    }
    getSize() { return this.size; }
    setSize(size: number[]) { this.size = size; }
    getViewport() { return this.viewport; }
    addLayer(layer: BaseLayer) { this.layers.push(layer); }
    removeLayer(layer: BaseLayer) { this.layers = this.layers.filter((existing) => existing !== layer); }
  } };
});
vi.mock('./mapCanvasCapture', async (importOriginal) => ({
  ...await importOriginal<typeof import('./mapCanvasCapture')>(), compositeMapCanvases: vi.fn(),
}));

type TestMap = Observable & {
  view: View; layers: BaseLayer[]; size: number[]; completeRenders: boolean;
  addControl: ReturnType<typeof vi.fn>; removeControl: ReturnType<typeof vi.fn>;
  setTarget: ReturnType<typeof vi.fn>; renderSync: ReturnType<typeof vi.fn>;
};

let runtimes: LayoutMapRuntime[];
beforeEach(() => {
  vi.useFakeTimers();
  runtimes = [];
  vi.mocked(compositeMapCanvases).mockImplementation((_viewport, width, height) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
  });
});
afterEach(() => {
  runtimes.forEach((runtime) => runtime.dispose());
  vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers();
});

function setup() {
  const options: LayoutMapOptions = { pxPerMm: 4, graticuleVisible: false, view: { center3857: [1000000, 5000000], resolutionPerMm: 400, rotation: 0.2 }, onViewChange: vi.fn() };
  const runtime = createOpenLayersLayoutMap(document.createElement('div'), options);
  runtimes.push(runtime);
  const map = mapCreated.mock.calls.at(-1)?.[0] as TestMap;
  return { runtime, map, options };
}

describe('OpenLayers layout runtime', () => {
  it('reconciles uploaded layers, selection, styles and order without recreating the map', () => {
    const { runtime, map, options } = setup();
    const input = createLayoutMapInput();
    input.layers = [createLayoutPointLayer()];
    runtime.sync(input);
    const layer = map.layers.at(-1) as VectorLayer;
    const feature = layer.getSource()!.getFeatures()[0];
    expect(feature.get('_selected')).toBe(true);
    expect(feature.get('_value')).toBe('42.000');
    const initialCenter = map.view.getCenter();
    runtime.sync({ ...input, uploadedLayerStyles: { points: { ...input.defaultUploadedStyle, pointRadius: 12 } } });
    expect(map.layers.at(-1)).toBe(layer);
    expect(map.view.getCenter()).toEqual(initialCenter);
    expect(map.view.getRotation()).toBe(options.view!.rotation);
    expect(mapCreated).toHaveBeenCalledTimes(1);
    expect(layer.getSource()!.getFeatures()[0]).toBe(feature);
    runtime.sync({ ...input, uploadedLayerVisibility: { points: false } });
    expect(layer.getVisible()).toBe(false);
    runtime.sync({ ...input, layers: [] });
    expect(map.layers).not.toContain(layer);
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it('shares the geographic view while paper display zoom changes', () => {
    const { runtime, map, options } = setup();
    runtime.sync(createLayoutMapInput());
    const before = map.view.getResolution()!;
    runtime.setOptions({ ...options, pxPerMm: 8, graticuleVisible: true });
    expect(map.view.getResolution()).toBe(before / 2);
    expect(map.view.getCenter()).toEqual(options.view!.center3857);
    expect(map.layers[0].getVisible()).toBe(true);
    map.dispatchEvent('moveend');
    expect(options.onViewChange).not.toHaveBeenCalled();
  });

  it('preserves symbol sizes and graticule spacing in high-DPI captures', async () => {
    const { runtime, map, options } = setup();
    const input = createLayoutMapInput();
    input.layers = [createLayoutPointLayer()];
    runtime.sync(input);
    runtime.setOptions({ ...options, graticuleVisible: true });
    const originalGraticule = map.layers[0];
    const pointLayer = map.layers.at(-1) as VectorLayer;
    const point = pointLayer.getSource()!.getFeatures()[0];
    const count = map.layers.length;
    map.renderSync.mockImplementationOnce(() => {
      const styles = pointLayer.getStyleFunction()!(point, 1) as Style[];
      expect(styles[0].getImage()!.getScale()).toBe(3);
      expect(styles[1].getText()!.getOffsetY()).toBe(45);
      expect(originalGraticule.getVisible()).toBe(false);
      expect(map.layers).toHaveLength(count + 1);
      map.dispatchEvent('rendercomplete');
    });
    await runtime.capture(2256, 1512);
    const styles = pointLayer.getStyleFunction()!(point, 1) as Style[];
    expect(styles[0].getImage()!.getScale()).toBe(1);
    expect(styles[1].getText()!.getOffsetY()).toBe(15);
    expect(map.layers).toHaveLength(count);
    expect(originalGraticule.getVisible()).toBe(true);
  });

  it('reuses controls until their DOM targets actually change', () => {
    const { runtime, map } = setup();
    const north = document.createElement('div');
    const scale = document.createElement('div');
    runtime.setTargets(north, scale);
    runtime.setTargets(north, scale);
    expect(map.addControl).toHaveBeenCalledTimes(2);
    expect(map.removeControl).not.toHaveBeenCalled();
    runtime.setTargets(null, scale);
    expect(map.removeControl).toHaveBeenCalledTimes(1);
    runtime.dispose();
    runtime.dispose();
    expect(map.removeControl).toHaveBeenCalledTimes(2);
    expect(map.setTarget).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(map.hasListener('moveend')).toBe(false);
  });

  it('captures at requested resolution and restores view, size and zoom constraints', async () => {
    const { runtime, map, options } = setup();
    const input = createLayoutMapInput();
    runtime.sync(input);
    map.view.setZoom(18);
    const before = { size: map.size, resolution: map.view.getResolution(), center: map.view.getCenter(), rotation: map.view.getRotation(), min: map.view.getMinZoom(), max: map.view.getMaxZoom() };
    const exportOptions = { ...options, view: { ...options.view!, resolutionPerMm: before.resolution! * options.pxPerMm } };
    runtime.setOptions(exportOptions);
    map.renderSync.mockImplementationOnce(() => {
      expect(map.size).toEqual([2256, 1512]);
      expect(map.view.getResolution()).toBeCloseTo(before.resolution! / 3, 8);
      expect(map.view.getMaxZoom()).toBeGreaterThan(18);
      map.dispatchEvent('moveend');
      map.dispatchEvent('rendercomplete');
    });
    const result = await runtime.capture(2256, 1512);
    expect([result.canvas.width, result.canvas.height]).toEqual([2256, 1512]);
    expect(result.rotation).toBe(before.rotation);
    expect(result.groundMetersPerMm).toBeGreaterThan(0);
    expect(map.size).toEqual(before.size);
    expect(map.view.getResolution()).toBe(before.resolution);
    expect(map.view.getCenter()).toEqual(before.center);
    expect(map.view.getRotation()).toBe(before.rotation);
    expect(map.view.getMinZoom()).toBe(before.min);
    expect(map.view.getMaxZoom()).toBe(before.max);
    expect(options.onViewChange).not.toHaveBeenCalled();
    expect(map.hasListener('rendercomplete')).toBe(false);
  });

  it.each(['cancel', 'data-change', 'dispose'] as const)('aborts snapshots on %s without leaving render listeners', async (cause) => {
    const { runtime, map } = setup();
    const input = createLayoutMapInput();
    runtime.sync(input);
    map.completeRenders = false;
    const controller = new AbortController();
    const pending = runtime.capture(1504, 1008, controller.signal);
    if (cause === 'cancel') controller.abort();
    if (cause === 'data-change') runtime.sync({ ...input, rasterStyle: { opacity: 0.5 } });
    if (cause === 'dispose') runtime.dispose();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(map.hasListener('rendercomplete')).toBe(false);
    expect(compositeMapCanvases).not.toHaveBeenCalled();
    if (cause !== 'dispose') expect(map.size).toEqual([752, 504]);
  });

  it('rejects unready, concurrent and excessive captures', async () => {
    const { runtime, map } = setup();
    await expect(runtime.capture(100, 100)).rejects.toThrow('尚未就绪');
    runtime.sync(createLayoutMapInput());
    await expect(runtime.capture(10000, 10000)).rejects.toThrow('尺寸无效');
    map.completeRenders = false;
    const controller = new AbortController();
    const pending = runtime.capture(100, 100, controller.signal);
    await expect(runtime.capture(100, 100)).rejects.toThrow('正在生成');
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not restore a stale viewport over newly fitted data after cancellation', async () => {
    const { runtime, map, options } = setup();
    const input = createLayoutMapInput();
    runtime.sync(input);
    map.completeRenders = false;
    const pending = runtime.capture(1504, 1008);
    runtime.sync({ ...input, layers: [createLayoutPointLayer()] });
    const fitted = map.view.getCenter();
    expect(fitted).not.toEqual(options.view!.center3857);
    expect(options.onViewChange).toHaveBeenCalled();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(map.view.getCenter()).toEqual(fitted);
  });

  it('restores the viewport after render timeout and canvas security errors', async () => {
    const { runtime, map } = setup();
    runtime.sync(createLayoutMapInput());
    map.completeRenders = false;
    const pending = runtime.capture(1504, 1008);
    const rejected = expect(pending).rejects.toThrow('限定时间');
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(map.size).toEqual([752, 504]);
    map.completeRenders = true;
    vi.mocked(compositeMapCanvases).mockImplementationOnce(() => { throw new Error('跨域'); });
    await expect(runtime.capture(1504, 1008)).rejects.toThrow('跨域');
    expect(map.size).toEqual([752, 504]);
    expect(map.hasListener('rendercomplete')).toBe(false);
  });

  it('invalidates exports after failed synchronization and can recover', async () => {
    const { runtime } = setup();
    const input = createLayoutMapInput();
    input.layers = [createLayoutPointLayer()];
    runtime.sync(input);
    const invalid = { ...input, layers: [{ ...input.layers[0], geojson: { type: 'FeatureCollection' as const, features: [{ type: 'Feature', geometry: { type: 'NotAGeometry', coordinates: [] } }] } }] };
    expect(() => runtime.sync(invalid)).toThrow();
    await expect(runtime.capture(752, 504)).rejects.toThrow('尚未就绪');
    runtime.sync(input);
    await expect(runtime.capture(752, 504)).resolves.toHaveProperty('canvas');
  });

  it('requests CORS-readable tiles and refuses known failed visible sources', async () => {
    const { runtime, map } = setup();
    const input = createLayoutMapInput();
    input.mapGroups.entries = [{ id: 'basemap:main:osm', instanceId: 'osm', groupId: 'main', layerId: 'basemap', visible: true, basemapId: 'osm' }];
    runtime.sync(input);
    const layer = map.layers.at(-1) as TileLayer<XYZ>;
    const source = layer.getSource()!;
    const tile = source.getTile(2, 1, 1, 1, getProjection('EPSG:3857')!);
    expect((tile.getImage() as HTMLImageElement).crossOrigin).toBe('anonymous');
    source.dispatchEvent({ type: 'tileloaderror', tile } as never);
    await expect(runtime.capture(752, 504)).rejects.toThrow('资源加载失败');
    source.dispatchEvent({ type: 'tileloadend', tile } as never);
    await expect(runtime.capture(752, 504)).resolves.toHaveProperty('canvas');
    runtime.dispose();
    expect(source.hasListener('tileloaderror')).toBe(false);
    expect(source.hasListener('tileloadend')).toBe(false);
  });
});
