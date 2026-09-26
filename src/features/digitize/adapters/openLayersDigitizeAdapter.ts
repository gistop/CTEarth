import Map from 'ol/Map.js';
import View from 'ol/View.js';
import type Feature from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import Polygon from 'ol/geom/Polygon.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Select from 'ol/interaction/Select.js';
import Snap from 'ol/interaction/Snap.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import { fromLonLat } from 'ol/proj.js';
import { unByKey } from 'ol/Observable.js';
import type { EventsKey } from 'ol/events.js';
import type { DigitizeEditSession } from '../types';
import { createDefaultDigitizeState, getDrawingStatus, labelForTool } from '../services/digitizeStateService';
import { MAX_AOI_OUTLINE_CELLS, MAX_AOI_VALUE_LABELS } from '../services/rasterAoiPixels';
import { completeSharedBoundary, createBoundaryCache, type BoundaryCache } from '../services/sharedBoundaryService';
import { createDigitizeLayerRenderer, isDigitizeLayerVisible } from './openLayersDigitizeLayers';
import { getBoundaryRings } from './openLayersDigitizeCodec';
import { synchronizeSharedBoundaries } from './openLayersBoundaryAdapter';
import { createDigitizeViewportAdapter, digitizeDefaultCenter, digitizeDefaultZoom } from './digitizeViewportAdapter';
import type { DigitizeMapCallbacks, DigitizeMapInput, DigitizeMapRuntime } from './digitizeMapTypes';

export function createOpenLayersDigitizeMap(container: HTMLElement, callbacks: DigitizeMapCallbacks): DigitizeMapRuntime {
  let disposed = false;
  let visible = false;
  let ready = false;
  let state = createDefaultDigitizeState();
  let input: DigitizeMapInput | null = null;
  let session: DigitizeEditSession | null = null;
  let sketch: Feature<Geometry> | null = null;
  let boundaryCache: BoundaryCache | null = null;
  let draw: Draw | null = null;
  let drawKeys: EventsKey[] = [];
  let interactionKey = '';
  let cancelling = false;
  let snapping = false;
  const map = new Map({ target: container, view: new View({ center: fromLonLat(digitizeDefaultCenter), zoom: digitizeDefaultZoom, minZoom: 2, maxZoom: 18 }), controls: defaultControls({ zoom: false }) });
  const renderer = createDigitizeLayerRenderer(map);
  const select = new Select({ layers: [renderer.editableLayer] });
  const modify = new Modify({ source: renderer.editableSource });
  const editableSnap = new Snap({ source: renderer.editableSource, pixelTolerance: 14 });
  const referenceSnap = new Snap({ source: renderer.referenceSource, pixelTolerance: 14 });
  const report = (error: unknown) => callbacks.setStatus(error instanceof Error ? error.message : '数字化编辑失败。');
  const viewport = createDigitizeViewportAdapter(map, container, report);
  map.addInteraction(select);
  map.addInteraction(modify);
  select.setActive(false);
  modify.setActive(false);

  function cancel(restore = true) {
    if (disposed || cancelling) return;
    cancelling = true;
    try {
      const hadSession = session !== null;
      const hadAoiSketch = sketch !== null && session === null;
      if (session) callbacks.edits.cancel(session);
      session = null;
      sketch = null;
      boundaryCache = null;
      draw?.abortDrawing();
      if (restore && hadSession && ready) renderer.restoreEditable();
      if (restore && hadAoiSketch) restoreAoi();
      select.getFeatures().clear();
    } finally { cancelling = false; }
  }

  function restoreAoi() {
    renderer.aoiSource.clear();
    if (state.rasterAoi) renderer.aoiSource.addFeature(renderer.codec.readAoi(state.rasterAoi));
  }

  function removeDraw() {
    unByKey(drawKeys);
    drawKeys = [];
    if (draw) {
      map.removeInteraction(draw);
      draw.dispose();
      draw = null;
    }
  }

  function syncSnapping(force = false) {
    const enabled = visible && state.editingActive && ready && state.snapEnabled;
    if (!force && enabled === snapping) return;
    snapping = enabled;
    map.removeInteraction(referenceSnap);
    map.removeInteraction(editableSnap);
    if (enabled) {
      map.addInteraction(referenceSnap);
      map.addInteraction(editableSnap);
    }
  }

  function beginEdit() {
    if (!ready || !visible || !state.editingActive || !input?.editableLayer) throw new Error('当前没有可用的编辑目标。');
    const next = callbacks.edits.beginEdit();
    if (next.layerId !== input.editableLayer.id || next.base !== input.editableLayer.geojson) {
      callbacks.edits.cancel(next);
      throw new Error('编辑图层正在同步，请在地图更新后重试。');
    }
    session = next;
  }

  function commit(message: string) {
    const current = session;
    session = null;
    boundaryCache = null;
    if (!current) return;
    try {
      const result = callbacks.edits.commit(current, renderer.codec.write(renderer.editableSource.getFeatures()));
      callbacks.setFeatureCount(result.features.length);
      callbacks.setStatus(message);
    } catch (error) {
      callbacks.edits.cancel(current);
      renderer.restoreEditable();
      callbacks.setFeatureCount(renderer.editableSource.getFeatures().length);
      report(error);
    }
  }

  const modifyKeys = [
    modify.on('modifystart', () => {
      if (!modify.getActive() || disposed) return;
      try { beginEdit(); } catch (error) { cancel(); report(error); }
    }),
    modify.on('modifyend', () => {
      if (disposed || !visible || !modify.getActive()) return;
      if (!session) { if (ready) renderer.restoreEditable(); return; }
      commit('节点修改已提交。');
    }),
  ];

  function configure() {
    const active = visible && state.editingActive && ready;
    const tool = input?.editableLayer?.geometryType ?? state.activeTool;
    const key = !active ? 'inactive' : state.rasterAoiActive
      ? `aoi:${state.rasterAoiRevision}:${input?.raster?.id ?? ''}`
      : `${input?.editableLayer?.id ?? ''}:${state.modifyEnabled ? 'modify' : tool}:${state.traceEnabled}`;
    if (key === interactionKey) { syncSnapping(); return; }
    cancel();
    removeDraw();
    interactionKey = key;
    const modifying = active && state.modifyEnabled && !state.rasterAoiActive && Boolean(input?.editableLayer);
    select.setActive(modifying);
    modify.setActive(modifying);
    if (!active) { syncSnapping(); return; }
    if (state.rasterAoiActive && !input?.raster) {
      callbacks.setStatus('请先选择栅格图层，再绘制 AOI。');
      syncSnapping();
      return;
    }
    if (!state.rasterAoiActive && !input?.editableLayer) {
      callbacks.setStatus('请选择内容列表中的矢量图层作为当前编辑图层。');
      syncSnapping();
      return;
    }
    if (!modifying) {
      const aoi = state.rasterAoiActive;
      const currentDraw = new Draw({ type: aoi ? 'Polygon' : tool });
      draw = currentDraw;
      drawKeys = [
        currentDraw.on('drawstart', event => {
          if (disposed || draw !== currentDraw || !visible) return;
          try {
            sketch = event.feature as Feature<Geometry>;
            if (aoi) {
              renderer.aoiSource.clear();
              callbacks.setStatus('AOI 绘制中，双击结束多边形。');
            } else {
              beginEdit();
              boundaryCache = state.traceEnabled && tool === 'Polygon'
                ? createBoundaryCache(getBoundaryRings([...renderer.editableSource.getFeatures(), ...renderer.referenceSource.getFeatures()])) : null;
              callbacks.setStatus(getDrawingStatus(tool, state.traceEnabled, state.snapEnabled));
            }
          } catch (error) { cancel(); report(error); }
        }),
        currentDraw.on('drawend', event => {
          if (disposed || draw !== currentDraw || !visible || !state.editingActive || !ready) return;
          const feature = event.feature as Feature<Geometry>;
          if (feature !== sketch) return;
          sketch = null;
          if (aoi) {
            try {
              const polygon = renderer.codec.writeAoi(feature);
              renderer.aoiSource.clear();
              renderer.aoiSource.addFeature(feature);
              callbacks.setRasterAoi(polygon);
            } catch (error) { restoreAoi(); report(error); }
            return;
          }
          if (!session) return;
          try {
            let completed = false;
            const geometry = feature.getGeometry();
            if (boundaryCache && geometry instanceof Polygon) {
              const coordinates = geometry.getCoordinates();
              const ring = completeSharedBoundary(coordinates[0] ?? [], boundaryCache, (map.getView().getResolution() ?? 1) * 18);
              if (ring) {
                geometry.setCoordinates([ring, ...coordinates.slice(1)]);
                synchronizeSharedBoundaries(renderer.editableSource.getFeatures(), feature);
                completed = true;
              }
            }
            renderer.editableSource.addFeature(feature);
            commit(completed ? '面已添加，并自动补齐公共边。' : `${labelForTool(tool)}已添加，可继续绘制或切换工具。`);
          } catch (error) { cancel(); report(error); }
        }),
        currentDraw.on('drawabort', () => {
          if (cancelling || draw !== currentDraw) return;
          cancel();
          callbacks.setStatus('本次绘制已取消，未提交变更。');
        }),
      ];
      map.addInteraction(currentDraw);
    }
    syncSnapping(true);
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !visible || !state.editingActive) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    cancel();
    callbacks.setStatus('当前编辑手势已取消，已提交的数据保持不变。');
  };
  window.addEventListener('keydown', onKeyDown);

  return {
    sync(next) {
      if (disposed || (ready && next === input)) return;
      const changed = !input || next.editableLayer?.id !== input.editableLayer?.id || next.editableLayer?.geojson !== input.editableLayer?.geojson || next.editableLayer?.geometryType !== input.editableLayer?.geometryType;
      const referencesChanged = !input || !sameReferenceGeometry(input, next);
      if (changed || referencesChanged) cancel();
      try {
        renderer.sync(next);
        input = next;
        ready = true;
        if (changed) {
          select.getFeatures().clear();
          callbacks.setFeatureCount(next.editableLayer?.geojson.features.length ?? 0);
        }
        configure();
      } catch (error) {
        cancel();
        ready = false;
        renderer.invalidate();
        configure();
        report(error);
      }
    },
    setState(next) {
      if (disposed) return;
      const aoiChanged = state.rasterAoi !== next.rasterAoi || state.rasterAoiRevision !== next.rasterAoiRevision;
      const valuesChanged = state.rasterPixelValuesVisible !== next.rasterPixelValuesVisible;
      state = next;
      if (aoiChanged) {
        renderer.aoiSource.clear();
        if (next.rasterAoi) renderer.aoiSource.addFeature(renderer.codec.readAoi(next.rasterAoi));
      }
      if (aoiChanged || valuesChanged) {
        const summary = renderer.setAoiHighlight(next.rasterAoi, next.rasterPixelValuesVisible);

        if (aoiChanged && next.rasterAoi) {
          callbacks.setStatus(!input?.raster
            ? '请先选择栅格图层，再绘制 AOI。'
            : describeAoiHighlight(summary, next.rasterPixelValuesVisible));
        }
      }
      configure();
    },
    setHost: viewport.setHost,
    setVisible(next) {
      if (disposed || visible === next) return;
      visible = next;
      viewport.setVisible(next);
      configure();
    },
    locate: viewport.locate, resetNorth: viewport.resetNorth, syncFromMapLibre: viewport.syncFromMapLibre,
    zoomIn: viewport.zoomIn, zoomOut: viewport.zoomOut,
    cancel,
    dispose() {
      if (disposed) return;
      cancel(false);
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      viewport.dispose();
      removeDraw();
      unByKey(modifyKeys);
      [select, modify, editableSnap, referenceSnap].forEach(interaction => { map.removeInteraction(interaction); interaction.dispose(); });
      renderer.dispose();
      map.setTarget(undefined);
      map.dispose();
    },
  };
}

function describeAoiHighlight(
  summary: { count: number; labelled: number; outlined: boolean; skipped: boolean; truncated: boolean },
  showValues: boolean,
) {
  if (summary.skipped) return 'AOI 覆盖的像元过多，已跳过像元高亮，可缩小框选范围。';
  if (!summary.count) return 'AOI 内没有有效像元，可重新框选。';

  const base = `AOI 命中 ${summary.count.toLocaleString()} 个像元`;

  if (summary.truncated) return `${base}（已达统计上限），可缩小框选范围。`;
  if (!summary.outlined) return `${base}；像元过多未逐格描边（上限 ${MAX_AOI_OUTLINE_CELLS.toLocaleString()}），可缩小框选范围。`;
  if (!showValues) return `${base}，可输入像元值并执行栅格修改。`;
  if (summary.labelled) return `${base}，已标注像元值。`;

  return `${base}；像元值最多标注 ${MAX_AOI_VALUE_LABELS} 个，请缩小框选范围。`;
}

function sameReferenceGeometry(first: DigitizeMapInput, second: DigitizeMapInput) {
  if (first.vectorOverlay?.geojson !== second.vectorOverlay?.geojson || first.layerVisibility.vectorOverlay !== second.layerVisibility.vectorOverlay) return false;
  if (isDigitizeLayerVisible(first, 'vectorOverlay', first.layerVisibility.vectorOverlay) !== isDigitizeLayerVisible(second, 'vectorOverlay', second.layerVisibility.vectorOverlay)) return false;
  if (first.raster?.id !== second.raster?.id) return false;
  const references = (input: DigitizeMapInput) => input.layers.filter(layer => layer.id !== input.editableLayer?.id && isDigitizeLayerVisible(input, `uploaded:${layer.id}`, input.uploadedLayerVisibility[layer.id] ?? true));
  const before = references(first);
  const after = references(second);
  return before.length === after.length && before.every((layer, index) => layer.id === after[index].id && layer.geojson === after[index].geojson);
}
