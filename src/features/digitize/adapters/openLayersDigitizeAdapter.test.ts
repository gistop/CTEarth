// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import LineString from 'ol/geom/LineString.js';
import Polygon from 'ol/geom/Polygon.js';
import Draw, { DrawEvent } from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Snap from 'ol/interaction/Snap.js';
import type Interaction from 'ol/interaction/Interaction.js';
import type BaseLayer from 'ol/layer/Base.js';
import type VectorLayer from 'ol/layer/Vector.js';
import type View from 'ol/View.js';
import type Observable from 'ol/Observable.js';
import { fromLonLat } from 'ol/proj.js';
import { createOpenLayersDigitizeMap } from './openLayersDigitizeAdapter';
import { createDigitizeEditService } from '../services/digitizeEditService';
import { createDefaultDigitizeState } from '../services/digitizeStateService';
import { createDigitizeInput, createDigitizeRaster, createEditableLayer, createMemoryDigitizePort } from '../testing/digitizeFixtures';
import { createRegressionLayer, regressionDraft, regressionRings } from '../testing/sharedBoundaryRegression';
import { validateFeatureCollection } from '../services/digitizeValidation';
import type { DigitizeCoordinate } from '../types';
import type { DigitizeMapInput, DigitizeMapRuntime } from './digitizeMapTypes';

const mapCreated = vi.hoisted(() => vi.fn());
vi.mock('ol/Map.js', async () => {
  const { default: Observable } = await import('ol/Observable.js');
  return { default: class TestMap extends Observable {
    layers: BaseLayer[] = [];
    interactions: Interaction[] = [];
    view: View;
    size = [800, 600];
    updateSize = vi.fn();
    setTarget = vi.fn();
    constructor(options: { view: View }) { super(); this.view = options.view; this.view.setViewportSize(this.size); mapCreated(this); }
    getView() { return this.view; }
    getSize() { return this.size; }
    addLayer(layer: BaseLayer) { this.layers.push(layer); }
    removeLayer(layer: BaseLayer) { this.layers = this.layers.filter(existing => existing !== layer); }
    addInteraction(interaction: Interaction) { this.interactions.push(interaction); }
    removeInteraction(interaction: Interaction) { this.interactions = this.interactions.filter(existing => existing !== interaction); }
  } };
});

type TestMap = Observable & { layers: BaseLayer[]; interactions: Interaction[]; view: View; setTarget: ReturnType<typeof vi.fn> };
let runtimes: DigitizeMapRuntime[];
beforeEach(() => { vi.useFakeTimers(); runtimes = []; });
afterEach(() => { runtimes.forEach(runtime => runtime.dispose()); vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });

function setup(input = createDigitizeInput()) {
  const memory = createMemoryDigitizePort(input.layers);
  memory.activate(input.editableLayer?.id ?? null);
  const callbacks = { edits: createDigitizeEditService(memory.port), setStatus: vi.fn(), setFeatureCount: vi.fn(), setRasterAoi: vi.fn() };
  const runtime = createOpenLayersDigitizeMap(document.createElement('div'), callbacks);
  runtimes.push(runtime);
  const map = mapCreated.mock.calls.at(-1)![0] as TestMap;
  const state = { ...createDefaultDigitizeState(), editingActive: true };
  runtime.sync(input); runtime.setState(state); runtime.setVisible(true);
  const source = (zIndex: number) => (map.layers.find(layer => layer.getZIndex() === zIndex) as VectorLayer).getSource()!;
  const draw = () => map.interactions.find(interaction => interaction instanceof Draw) as Draw;
  const modify = () => map.interactions.find(interaction => interaction instanceof Modify) as Modify;
  return { runtime, callbacks, memory, map, state, source, draw, modify, input };
}

function point() { return new Feature(new Point(fromLonLat([11, 51]))); }
function aoi() { return new Feature(new Polygon([[[10, 50], [11, 50], [11, 51], [10, 50]].map(position => fromLonLat(position))])); }

describe('OpenLayers digitize runtime', () => {
  it('commits completed drawing synchronously without serializing engine metadata', () => {
    const { draw, memory, callbacks } = setup();
    const feature = point();
    draw().dispatchEvent(new DrawEvent('drawstart', feature));
    draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(memory.writes).toHaveLength(1);
    expect(memory.writes[0].layerId).toBe('points');
    expect(memory.writes[0].geojson.features).toHaveLength(2);
    expect(memory.writes[0].geojson.features[1]).toMatchObject({ type: 'Feature', properties: null });
    expect(callbacks.setFeatureCount).toHaveBeenLastCalledWith(2);
    vi.runAllTimers();
    expect(memory.writes).toHaveLength(1);
  });

  it('modifies the current target after initially mounting without an editable layer', () => {
    const initial = createDigitizeInput(); initial.editableLayer = null; initial.layers = [];
    const { runtime, memory, modify, source, state } = setup(initial);
    const layer = createEditableLayer('later');
    memory.put(layer); memory.activate(layer.id); runtime.sync(createDigitizeInput(layer));
    runtime.setState({ ...state, modifyEnabled: true });
    const feature = source(3).getFeatures()[0];
    modify().dispatchEvent('modifystart');
    feature.setGeometry(new Point(fromLonLat([12, 52])));
    modify().dispatchEvent('modifyend');
    expect(memory.writes[0].layerId).toBe('later');
    expect(memory.writes[0].geojson.features[0]).toMatchObject({ id: 'point-1', properties: { name: 'point-1', value: 42 } });
  });

  it.each(['LineString', 'Polygon'] as const)('preserves the ordinary %s drawing workflow', geometryType => {
    const layer = { ...createEditableLayer(), geometryType, geojson: { type: 'FeatureCollection' as const, features: [] } };
    const { draw, memory } = setup(createDigitizeInput(layer));
    const feature = geometryType === 'Polygon' ? aoi() : new Feature(new LineString([[10, 50], [11, 51]].map(position => fromLonLat(position))));
    draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(memory.writes).toHaveLength(1);
    expect(memory.writes[0].geojson.features[0]).toMatchObject({ geometry: { type: geometryType } });
  });

  it('completes shared polygon boundaries from reference layers without editing those layers', () => {
    const layer = { ...createEditableLayer(), geometryType: 'Polygon' as const, geojson: { type: 'FeatureCollection' as const, features: [] } };
    const input = createDigitizeInput(layer);
    const reference = { ...createEditableLayer('reference'), geometryType: 'Polygon' as const, geojson: { type: 'FeatureCollection' as const, features: [{ type: 'Feature', properties: { name: 'boundary' }, geometry: { type: 'Polygon', coordinates: [[[10, 50], [11, 50], [11, 51], [10, 51], [10, 50]]] } }] } };
    input.layers = [layer, reference];
    const { draw, callbacks, memory } = setup(input);
    const feature = new Feature(new Polygon([[[10, 50.3], [9.8, 50.3], [9.8, 50.7], [10, 50.7], [10, 50.3]].map(position => fromLonLat(position))]));
    draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(expect.stringContaining('自动补齐公共边'));
    expect(memory.writes).toHaveLength(1); expect(memory.writes[0].layerId).toBe('points');
    expect(memory.port.getLayer('reference')!.geojson).toBe(reference.geojson);
  });

  it('draws the supplied adjacent polygons sequentially and commits noded boundaries in row order', () => {
    const layer = createRegressionLayer(1);
    const { runtime, draw, memory, callbacks } = setup(createDigitizeInput(layer));
    for (const index of [1, 2]) {
      const feature = new Feature(new Polygon([regressionDraft(index).map(position => fromLonLat(position))]));
      draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
      expect(memory.writes).toHaveLength(index);
      const geojson = memory.writes[index - 1].geojson;
      expect(() => validateFeatureCollection(geojson, 'Polygon')).not.toThrow();
      runtime.sync(createDigitizeInput({ ...layer, geojson }));
    }
    const output = memory.writes[1].geojson;
    const rings = output.features.map(feature => (feature as { geometry: { coordinates: DigitizeCoordinate[][] } }).geometry.coordinates[0]);
    expect(rings[2]).toHaveLength(9);
    expect(rings[0][0]).toEqual(regressionRings[0][0]);
    expect(rings[2][7]).toEqual(regressionRings[0][2]);
    expect(rings[2]).not.toContainEqual(regressionRings[0][1]);
    expect(rings[0]).toContainEqual(rings[2][0]); expect(rings[1]).toContainEqual(rings[2][4]);
    expect(rings[0]).toContainEqual(rings[2][6]); expect(rings[1]).toContainEqual(rings[2][6]);
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(expect.stringContaining('自动补齐公共边'));
    expect(callbacks.setFeatureCount).toHaveBeenLastCalledWith(3);
  });

  it('rolls back the new polygon and all synchronized neighbors if persistence fails, then allows retry', () => {
    const layer = createRegressionLayer();
    const { draw, memory, callbacks, source } = setup(createDigitizeInput(layer));
    const before = source(3).getFeatures().map(feature => feature.getGeometry()!.getCoordinates());
    const commit = vi.spyOn(callbacks.edits, 'commit').mockImplementation((_session, features) => {
      expect(features).toHaveLength(3);
      expect((features[0] as { geometry: { coordinates: number[][][] } }).geometry.coordinates[0].length).toBeGreaterThan(before[0][0].length);
      throw new Error('模拟持久化失败');
    });
    const feature = new Feature(new Polygon([regressionDraft(2).map(position => fromLonLat(position))]));
    draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(commit).toHaveBeenCalledOnce(); expect(memory.writes).toHaveLength(0);
    expect(source(3).getFeatures().map(feature => feature.getGeometry()!.getCoordinates())).toEqual(before);
    expect(callbacks.setStatus).toHaveBeenLastCalledWith('模拟持久化失败');
    expect(callbacks.setFeatureCount).toHaveBeenLastCalledWith(2);
    commit.mockRestore();
    const retry = new Feature(new Polygon([regressionDraft(2).map(position => fromLonLat(position))]));
    draw().dispatchEvent(new DrawEvent('drawstart', retry)); draw().dispatchEvent(new DrawEvent('drawend', retry));
    expect(memory.writes).toHaveLength(1);
  });

  it('rejects an unsafe connected trace before inserting a feature and restores the edit source', () => {
    const empty = createRegressionLayer(0);
    const layer = { ...empty, geojson: { ...empty.geojson, features: [{ type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }] } };
    const { draw, memory, source, callbacks } = setup(createDigitizeInput(layer));
    const before = source(3).getFeatures()[0].getGeometry()!.getCoordinates();
    const ring = [[0, 2], [4, 2], [4, -2], [6, -2], [6, 12], [8, 12], [8, 8], [10, 8], [0, 2]];
    const feature = new Feature(new Polygon([ring.map(position => fromLonLat(position))]));
    draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(memory.writes).toHaveLength(0); expect(source(3).getFeatures()).toHaveLength(1);
    expect(source(3).getFeatures()[0].getGeometry()!.getCoordinates()).toEqual(before);
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(expect.stringContaining('无法安全补齐'));
  });

  it('rejects self-intersection in ordinary polygon drawing with tracing disabled', () => {
    const { runtime, state, draw, memory, callbacks, source } = setup(createDigitizeInput(createRegressionLayer(0)));
    runtime.setState({ ...state, traceEnabled: false });
    const feature = new Feature(new Polygon([regressionRings[2].map(position => fromLonLat(position))]));
    draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(memory.writes).toHaveLength(0); expect(source(3).getFeatures()).toHaveLength(0);
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(expect.stringMatching(/自交|折返/));
  });

  it('rolls back a node modification that creates an invalid polygon', () => {
    const { runtime, state, modify, memory, callbacks, source } = setup(createDigitizeInput(createRegressionLayer(1)));
    runtime.setState({ ...state, modifyEnabled: true });
    const feature = source(3).getFeatures()[0]; const before = feature.getGeometry()!.getCoordinates();
    modify().dispatchEvent('modifystart');
    feature.setGeometry(new Polygon([regressionRings[2].map(position => fromLonLat(position))]));
    modify().dispatchEvent('modifyend');
    expect(memory.writes).toHaveLength(0);
    expect(source(3).getFeatures()[0].getGeometry()!.getCoordinates()).toEqual(before);
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(expect.stringMatching(/自交|折返/));
  });

  it('does not silently rewrite existing invalid project data when mounting or synchronizing', () => {
    const layer = createRegressionLayer(3); const before = structuredClone(layer.geojson);
    const { runtime, memory, source } = setup(createDigitizeInput(layer));
    runtime.sync(createDigitizeInput(layer));
    expect(memory.writes).toHaveLength(0); expect(source(3).getFeatures()).toHaveLength(3);
    expect(layer.geojson).toEqual(before);
  });

  it('completes a 2D drawing next to 3D polygons without corrupting their altitude', () => {
    const layer = createRegressionLayer();
    layer.geojson.features = layer.geojson.features.map(feature => ({ ...feature, geometry: { ...feature.geometry, coordinates: feature.geometry.coordinates.map(ring => ring.map(position => [...position, 120])) } }));
    const { draw, memory, callbacks } = setup(createDigitizeInput(layer));
    const feature = new Feature(new Polygon([regressionDraft(2).map(position => fromLonLat(position))]));
    draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(expect.stringContaining('自动补齐公共边'));
    expect(memory.writes).toHaveLength(1);
    const rings = memory.writes[0].geojson.features.map(feature => (feature as { geometry: { coordinates: DigitizeCoordinate[][] } }).geometry.coordinates[0]);
    expect(rings[0].every(position => position.length === 3 && position[2] === 120)).toBe(true);
    expect(rings[1].every(position => position.length === 3 && position[2] === 120)).toBe(true);
    expect(rings[2].every(position => position.length === 2)).toBe(true);
  });

  it('restores a cancelled node modification and rejects its late completion', () => {
    const { runtime, state, source, modify, memory } = setup();
    runtime.setState({ ...state, modifyEnabled: true });
    const original = source(3).getFeatures()[0].getGeometry()!.getCoordinates();
    modify().dispatchEvent('modifystart'); source(3).getFeatures()[0].setGeometry(new Point(fromLonLat([13, 53])));
    runtime.cancel(); modify().dispatchEvent('modifyend');
    expect(memory.writes).toHaveLength(0);
    expect(source(3).getFeatures()[0].getGeometry()!.getCoordinates()).toEqual(original);
  });

  it('cancels drawing on target switch and ignores events from removed interactions', () => {
    const { runtime, draw, memory, source } = setup();
    const oldDraw = draw(); const feature = point();
    oldDraw.dispatchEvent(new DrawEvent('drawstart', feature));
    const next = createEditableLayer('next'); memory.put(next); memory.activate(next.id);
    runtime.sync(createDigitizeInput(next));
    oldDraw.dispatchEvent(new DrawEvent('drawend', feature));
    expect(memory.writes).toHaveLength(0);
    expect(source(3).getFeatures()).toHaveLength(1);
    expect(draw()).not.toBe(oldDraw);
  });

  it('rejects target changes before the rendered input catches up', () => {
    const { draw, memory, source, callbacks } = setup();
    const feature = point(); draw().dispatchEvent(new DrawEvent('drawstart', feature));
    memory.put(createEditableLayer('next')); memory.activate('next');
    draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(memory.writes).toHaveLength(0);
    expect(source(3).getFeatures()).toHaveLength(1);
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(expect.stringContaining('切换'));
  });

  it('restores geometry when modification starts against a stale snapshot', () => {
    const { runtime, state, source, modify, memory } = setup();
    runtime.setState({ ...state, modifyEnabled: true });
    const original = source(3).getFeatures()[0].getGeometry()!.getCoordinates();
    memory.put(createEditableLayer());
    modify().dispatchEvent('modifystart');
    source(3).getFeatures()[0].setGeometry(new Point(fromLonLat([13, 53])));
    modify().dispatchEvent('modifyend');
    expect(memory.writes).toHaveLength(0);
    expect(source(3).getFeatures()[0].getGeometry()!.getCoordinates()).toEqual(original);
  });

  it('preserves feature and draw identity on style updates without cancelling the gesture', () => {
    const { runtime, draw, source, memory, input, map } = setup();
    const interaction = draw(); const existing = source(3).getFeatures()[0]; const feature = point();
    interaction.dispatchEvent(new DrawEvent('drawstart', feature));
    runtime.sync({ ...input, uploadedLayerStyles: { points: { ...input.defaultStyle, pointColor: '#ff0000' } } });
    expect(draw()).toBe(interaction); expect(source(3).getFeatures()[0]).toBe(existing);
    interaction.dispatchEvent(new DrawEvent('drawend', feature));
    expect(memory.writes).toHaveLength(1); expect(mapCreated).toHaveBeenCalledTimes(1);
    expect(map.interactions.slice(-2).every(item => item instanceof Snap)).toBe(true);
  });

  it.each(['escape', 'hidden', 'mode'] as const)('cancels a gesture on %s without replaying it', reason => {
    const { runtime, draw, state, memory, source } = setup();
    const interaction = draw(); const feature = point(); interaction.dispatchEvent(new DrawEvent('drawstart', feature));
    if (reason === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    if (reason === 'hidden') runtime.setVisible(false);
    if (reason === 'mode') runtime.setState({ ...state, modifyEnabled: true });
    interaction.dispatchEvent(new DrawEvent('drawend', feature));
    expect(memory.writes).toHaveLength(0); expect(source(3).getFeatures()).toHaveLength(1);
  });

  it('leaves keyboard input alone and permits the ongoing draw to finish', () => {
    const { draw, memory } = setup(); const feature = point();
    draw().dispatchEvent(new DrawEvent('drawstart', feature));
    const input = document.createElement('input'); document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); input.remove();
    draw().dispatchEvent(new DrawEvent('drawend', feature)); expect(memory.writes).toHaveLength(1);
  });

  it('cancels stale boundary caches when reference map-group visibility changes', () => {
    const input = createDigitizeInput();
    input.vectorOverlay = { name: 'reference', geojson: input.layers[0].geojson };
    const { runtime, draw, memory, source } = setup(input);
    const feature = point(); draw().dispatchEvent(new DrawEvent('drawstart', feature));
    runtime.sync({ ...input, mapGroups: { initialized: true, entries: [{ id: 'vectorOverlay', layerId: 'vectorOverlay', instanceId: 'overlay', groupId: 'group', visible: false }] } });
    draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(source(2).getFeatures()).toHaveLength(0); expect(memory.writes).toHaveLength(0);
  });

  it('isolates AOI from vector data and ignores completion after cancellation', () => {
    const input = createDigitizeInput(); input.raster = createDigitizeRaster();
    const { runtime, draw, state, memory, callbacks, source } = setup(input);
    runtime.setState({ ...state, rasterAoiActive: true });
    const cancelled = aoi(); draw().dispatchEvent(new DrawEvent('drawstart', cancelled)); runtime.cancel();
    draw().dispatchEvent(new DrawEvent('drawend', cancelled)); expect(callbacks.setRasterAoi).not.toHaveBeenCalled();
    const feature = aoi(); draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(callbacks.setRasterAoi).toHaveBeenCalledWith(expect.objectContaining({ type: 'Polygon' }));
    expect(source(4).getFeatures()).toHaveLength(1); expect(memory.writes).toHaveLength(0);
  });

  it('rejects degenerate AOI without altering vector data', () => {
    const input = createDigitizeInput(); input.raster = createDigitizeRaster();
    const { runtime, draw, state, memory, callbacks, source } = setup(input);
    runtime.setState({ ...state, rasterAoiActive: true });
    const feature = new Feature(new Polygon([[[0, 0], [1, 0], [2, 0], [0, 0]]]));
    draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(callbacks.setRasterAoi).not.toHaveBeenCalled(); expect(callbacks.setStatus).toHaveBeenLastCalledWith(expect.stringContaining('退化'));
    expect(source(4).getFeatures()).toHaveLength(0); expect(memory.writes).toHaveLength(0);
  });

  it('rolls back invalid geometry and recovers from failed layer decoding', () => {
    const { runtime, draw, source, memory, input, callbacks } = setup();
    const feature = new Feature(new Point([NaN, 1]));
    draw().dispatchEvent(new DrawEvent('drawstart', feature)); draw().dispatchEvent(new DrawEvent('drawend', feature));
    expect(memory.writes).toHaveLength(0); expect(source(3).getFeatures()).toHaveLength(1);
    const malformed: DigitizeMapInput = { ...input, editableLayer: { ...input.editableLayer!, geojson: { type: 'FeatureCollection', features: [null] } } };
    runtime.sync(malformed); expect(draw()).toBeUndefined();
    expect(callbacks.setStatus).toHaveBeenLastCalledWith(expect.stringContaining('无效'));
    runtime.sync(input); expect(draw()).toBeInstanceOf(Draw); expect(source(3).getFeatures()).toHaveLength(1);
  });

  it('disposes sources, interactions, keyboard listeners and scheduled work exactly once', () => {
    const { runtime, draw, source, map, callbacks } = setup();
    const editable = source(3); const reference = source(2); const interaction = draw();
    const feature = point(); interaction.dispatchEvent(new DrawEvent('drawstart', feature));
    const disposeMap = vi.spyOn(map, 'dispose');
    runtime.dispose(); runtime.dispose(); callbacks.setStatus.mockClear();
    interaction.dispatchEvent(new DrawEvent('drawend', feature)); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    vi.runAllTimers();
    expect(editable.getFeatures()).toHaveLength(0); expect(reference.getFeatures()).toHaveLength(0);
    expect(map.layers).toHaveLength(0); expect(map.interactions).toHaveLength(0);
    expect(map.setTarget).toHaveBeenCalledWith(undefined); expect(disposeMap).toHaveBeenCalledTimes(1);
    expect(callbacks.setStatus).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
