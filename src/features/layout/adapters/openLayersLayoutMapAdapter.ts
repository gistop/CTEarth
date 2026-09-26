import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Rotate from 'ol/control/Rotate.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { createEmpty, extend, isEmpty } from 'ol/extent.js';
import Graticule from 'ol/layer/Graticule.js';
import ImageLayer from 'ol/layer/Image.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import type OSM from 'ol/source/OSM.js';
import type XYZ from 'ol/source/XYZ.js';
import type { EventsKey } from 'ol/events.js';
import type Geometry from 'ol/geom/Geometry.js';
import { fromLonLat, getPointResolution } from 'ol/proj.js';
import { unByKey } from 'ol/Observable.js';
import { Fill, Stroke, Text } from 'ol/style.js';
import { createOpenLayersLayerAdapter, type OpenLayersBasemapLayer } from '../../layers/adapters/openLayersLayerAdapter';
import { layoutPreviewCenter, layoutPreviewZoom } from '../constants';
import type { LayoutMapInput, LayoutMapOptions, LayoutMapRuntime } from './layoutMapTypes';
import { createLayoutUploadedLayerStyle, createLayoutVectorOverlayStyle, formatLayoutNumber, isPointLikeLayoutFeature, layoutRasterExtent } from './layoutMapStyles';
import { assertExportActive } from '../services/layoutExportController';
import { compositeMapCanvases, waitForMapRender } from './mapCanvasCapture';

export function createOpenLayersLayoutMap(container: HTMLElement, initialOptions: LayoutMapOptions): LayoutMapRuntime {
  let options = initialOptions;
  let previous: LayoutMapInput | null = null;
  let synchronized = false;
  let disposed = false;
  let captureController: AbortController | null = null;
  let restoreCapture: (() => void) | null = null;
  let lastExtent = '';
  const view = new View({ center: fromLonLat(layoutPreviewCenter), zoom: layoutPreviewZoom, minZoom: 2, maxZoom: 18 });
  const rasterLayer = new ImageLayer<ImageStatic>({ visible: false });
  const vectorSource = new VectorSource<Feature<Geometry>>();
  const vectorLayer = new VectorLayer({ source: vectorSource, visible: false });
  const graticule = new Graticule({ showLabels: true, strokeStyle: new Stroke({ color: 'rgba(255, 120, 0, 0.8)', width: 1.25, lineDash: [5, 5] }), visible: options.graticuleVisible, wrapX: false });
  let exportGraticule: Graticule | null = null;
  const map = new Map({ target: container, view, layers: [graticule, rasterLayer, vectorLayer], controls: defaultControls({ attribution: false, rotate: false, zoom: false }) });
  const basemaps = new globalThis.Map<string, OpenLayersBasemapLayer>();
  const uploaded = new globalThis.Map<string, { source: VectorSource<Feature<Geometry>>; layer: VectorLayer<VectorSource<Feature<Geometry>>> }>();
  const layerAdapter = createOpenLayersLayerAdapter();
  let scaleControl: ScaleLine | null = null;
  let northControl: Rotate | null = null;
  let northTarget: HTMLElement | null = null;
  let scaleTarget: HTMLElement | null = null;
  let resizeFrame = 0;
  const sourceWatches = new globalThis.Map<OSM | XYZ | ImageStatic, { keys: EventsKey[]; failed: Set<object> }>();

  function updateSourceWatches() {
    const sources = [...basemaps.values()].map((layer) => layer.getSource()).filter((source): source is OSM | XYZ => source !== null);
    const imageSource = rasterLayer.getSource();
    const expected = new Set<OSM | XYZ | ImageStatic>(imageSource ? [...sources, imageSource] : sources);
    sourceWatches.forEach((watch, source) => { if (!expected.has(source)) { unByKey(watch.keys); sourceWatches.delete(source); } });
    expected.forEach((source) => {
      if (sourceWatches.has(source)) return;
      const failed = new Set<object>();
      const keys = source instanceof ImageStatic
        ? [source.on('imageloaderror', (event) => failed.add(event.image)), source.on('imageloadend', (event) => failed.delete(event.image))]
        : [source.on('tileloaderror', (event) => failed.add(event.tile)), source.on('tileloadend', (event) => failed.delete(event.tile))];
      sourceWatches.set(source, { keys, failed });
    });
  }

  function hasFailedVisibleSource() {
    return [...basemaps.values(), rasterLayer].some((layer) => {
      const source = layer.getSource();
      return layer.getVisible() && source && (sourceWatches.get(source)?.failed.size ?? 0) > 0;
    });
  }

  function scaleMapStyles(scale: number) {
    if (!previous) return;
    vectorLayer.setStyle(createLayoutVectorOverlayStyle(previous.vectorOverlayStyle, scale));
    const input = previous;
    uploaded.forEach((entry, id) => entry.layer.setStyle(createLayoutUploadedLayerStyle(input.uploadedLayerStyles[id] ?? input.defaultUploadedStyle, scale)));
    if (exportGraticule) {
      map.removeLayer(exportGraticule);
      exportGraticule.dispose();
      exportGraticule = null;
    }
    graticule.setVisible(scale === 1 && options.graticuleVisible);
    if (scale !== 1 && options.graticuleVisible) {
      const text = { font: '12px Calibri,sans-serif', scale, fill: new Fill({ color: '#000000' }), stroke: new Stroke({ color: '#ffffff', width: 3 }) };
      exportGraticule = new Graticule({
        showLabels: true, wrapX: false, targetSize: 100 * scale,
        strokeStyle: new Stroke({ color: 'rgba(255, 120, 0, 0.8)', width: 1.25 * scale, lineDash: [5 * scale, 5 * scale] }),
        lonLabelStyle: new Text({ ...text, textBaseline: 'bottom' }), latLabelStyle: new Text({ ...text, textAlign: 'right' }),
      });
      exportGraticule.setZIndex(graticule.getZIndex() ?? 0);
      map.addLayer(exportGraticule);
    }
  }

  function publishView() {
    if (disposed || captureController) return;
    const center = view.getCenter();
    const resolution = view.getResolution();
    if (!center || !resolution) return;
    const next = { center3857: [center[0], center[1]] as [number, number], resolutionPerMm: resolution * options.pxPerMm, rotation: view.getRotation() };
    const current = options.view;
    if (current && Math.abs(current.center3857[0] - next.center3857[0]) < 1e-6 && Math.abs(current.center3857[1] - next.center3857[1]) < 1e-6
      && Math.abs(current.resolutionPerMm - next.resolutionPerMm) < 1e-8 && Math.abs(current.rotation - next.rotation) < 1e-9) return;
    options.onViewChange(next);
  }
  const moveKey = map.on('moveend', publishView);
  const resize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (!disposed && !captureController) map.updateSize(); });
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(container);
  resize();

  function visible(input: LayoutMapInput, id: string, fallback: boolean) {
    const entries = input.mapGroups.entries.filter((entry) => entry.layerId === id);
    return fallback && (entries.length === 0 || entries.some((entry) => entry.visible));
  }

  function fitData(input: LayoutMapInput, force = false, apply = true) {
    const extent = createEmpty();
    if (input.raster && rasterLayer.getVisible()) extend(extent, layoutRasterExtent(input.raster.coordinates));
    const vectorExtent = vectorSource.getExtent();
    if (vectorLayer.getVisible() && vectorExtent && !isEmpty(vectorExtent)) extend(extent, vectorExtent);
    uploaded.forEach((entry) => {
      const layerExtent = entry.source.getExtent();
      if (entry.layer.getVisible() && layerExtent && !isEmpty(layerExtent)) extend(extent, layerExtent);
    });
    const key = extent.join(',');
    if (!force && key === lastExtent) return;
    lastExtent = key;
    if (!apply) return;
    map.updateSize();
    if (isEmpty(extent)) {
      view.setCenter(fromLonLat(layoutPreviewCenter));
      view.setZoom(layoutPreviewZoom);
    } else {
      view.fit(extent, { duration: 0, maxZoom: 16, padding: [14, 14, 14, 14] });
    }
    view.setRotation(0);
    publishView();
  }

  const runtime: LayoutMapRuntime = {
    sync(input) {
      if (disposed || (synchronized && input === previous)) return;
      captureController?.abort();
      restoreCapture?.();
      synchronized = false;
      try {
        if (input.mapGroups !== previous?.mapGroups || input.layerVisibility.basemap !== previous?.layerVisibility.basemap) {
          layerAdapter.sync({ map, entries: input.mapGroups.entries, basemapLayers: basemaps, basemapLayerIdPrefix: 'layout-basemap', basemapVisible: input.layerVisibility.basemap, stacking: 'ordered', crossOrigin: 'anonymous', orderTargets: { rasterLayer, rasterId: input.raster?.id, vectorOverlayLayer: vectorLayer } });
        }
        const rasterVisible = Boolean(input.raster && visible(input, `raster:${input.raster.id}`, input.rasterLayerVisibility[input.raster.id] ?? input.layerVisibility.raster));
        rasterLayer.setVisible(rasterVisible);
        rasterLayer.setOpacity(input.raster ? input.rasterStyles[input.raster.id]?.opacity ?? 0.82 : 1);
        if (input.raster !== previous?.raster) rasterLayer.setSource(input.raster ? new ImageStatic({ imageExtent: layoutRasterExtent(input.raster.coordinates), url: input.raster.imageUrl, projection: 'EPSG:3857', crossOrigin: 'anonymous', interpolate: false }) : null);
        vectorLayer.setVisible(Boolean(input.vectorOverlay && visible(input, 'vectorOverlay', input.layerVisibility.vectorOverlay)));
        if (input.vectorOverlayStyle !== previous?.vectorOverlayStyle) vectorLayer.setStyle(createLayoutVectorOverlayStyle(input.vectorOverlayStyle));
        if (input.vectorOverlay !== previous?.vectorOverlay) {
          vectorSource.clear();
          if (input.vectorOverlay) vectorSource.addFeatures(new GeoJSON().readFeatures(input.vectorOverlay.geojson, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }) as Feature<Geometry>[]);
        }
        const expectedIds = new Set(input.layers.map((layer) => layer.id));
        uploaded.forEach((entry, id) => { if (!expectedIds.has(id)) { map.removeLayer(entry.layer); entry.source.clear(); uploaded.delete(id); } });
        const format = new GeoJSON();
        input.layers.forEach((data) => {
          const style = input.uploadedLayerStyles[data.id] ?? input.defaultUploadedStyle;
          let entry = uploaded.get(data.id);
          if (!entry) {
            const source = new VectorSource<Feature<Geometry>>();
            entry = { source, layer: new VectorLayer({ source, style: createLayoutUploadedLayerStyle(style) }) };
            uploaded.set(data.id, entry);
            map.addLayer(entry.layer);
          }
          const before = previous?.layers.find((layer) => layer.id === data.id);
          if (before !== data) {
            const features = format.readFeatures(data.geojson, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }) as Feature<Geometry>[];
            const selected = new Set(data.selectedFeatureIndexes);
            features.forEach((feature, index) => {
              feature.setProperties({ _featureIndex: index, _layerId: data.id, _selected: selected.has(index), _value: data.selectedField && isPointLikeLayoutFeature(feature) ? formatLayoutNumber(Number(feature.get(data.selectedField))) : '' });
            });
            entry.source.clear();
            entry.source.addFeatures(features);
          }
          if (style !== (previous?.uploadedLayerStyles[data.id] ?? previous?.defaultUploadedStyle)) entry.layer.setStyle(createLayoutUploadedLayerStyle(style));
          entry.layer.setVisible(visible(input, `uploaded:${data.id}`, input.uploadedLayerVisibility[data.id] ?? true));
        });
        const order = new globalThis.Map(input.mapGroups.entries.map((entry, index) => [entry.id, input.mapGroups.entries.length - index]));
        let basemapTop = 0;
        input.mapGroups.entries.forEach((entry) => { if (entry.basemapId) basemapTop = Math.max(basemapTop, order.get(entry.id) ?? 0); });
        graticule.setZIndex(basemapTop + 0.5);
        rasterLayer.setZIndex(order.get(input.raster ? `raster:${input.raster.id}` : '') ?? 0);
        vectorLayer.setZIndex(order.get('vectorOverlay') ?? 0);
        uploaded.forEach((entry, id) => entry.layer.setZIndex(order.get(`uploaded:${id}`) ?? input.mapGroups.entries.length + 1));
        updateSourceWatches();
        const firstSync = previous === null;
        previous = input;
        if (firstSync && options.view) {
          fitData(input, false, false);
          runtime.setOptions(options);
        } else {
          fitData(input);
        }
        synchronized = true;
      } catch (error) {
        previous = null;
        lastExtent = '';
        throw error;
      }
    },
    setOptions(next) {
      if (disposed) return;
      const prior = options;
      options = next;
      if (captureController) return;
      graticule.setVisible(next.graticuleVisible);
      if (next.view) {
        view.setCenter([...next.view.center3857]);
        view.setResolution(next.view.resolutionPerMm / next.pxPerMm);
        view.setRotation(next.view.rotation);
      } else if (previous && prior.view) {
        fitData(previous, true);
      }
      resize();
    },
    setTargets(northArrow, scaleBar) {
      if (disposed) return;
      if (scaleTarget !== scaleBar) {
        if (scaleControl) map.removeControl(scaleControl);
        scaleControl = scaleBar ? new ScaleLine({ bar: true, minWidth: 120, steps: 4, target: scaleBar, text: true, units: 'metric' }) : null;
        if (scaleControl) map.addControl(scaleControl);
        scaleTarget = scaleBar;
      }
      if (northTarget !== northArrow) {
        if (northControl) map.removeControl(northControl);
        const label = document.createElement('span');
        label.className = 'layout-north-arrow-label';
        label.textContent = 'N';
        northControl = northArrow ? new Rotate({ autoHide: false, className: 'layout-north-arrow-control', label, target: northArrow }) : null;
        if (northControl) map.addControl(northControl);
        northTarget = northArrow;
      }
    },
    async capture(width, height, signal) {
      assertExportActive(signal);
      if (disposed || !synchronized) throw new Error('布局地图尚未就绪，请检查图层数据后重试。');
      if (captureController) throw new Error('地图快照正在生成。');
      if (![width, height].every((value) => Number.isInteger(value) && value > 0) || width * height > 25000000) throw new Error('地图快照尺寸无效。');
      map.updateSize();
      const size = map.getSize();
      const resolution = view.getResolution();
      const center = view.getCenter();
      if (!size || !size[0] || !size[1] || !resolution || !center) throw new Error('地图视口尚未准备好。');
      const rotation = view.getRotation();
      const groundMetersPerMm = getPointResolution(view.getProjection(), resolution, center, 'm') * options.pxPerMm;
      const controller = new AbortController();
      const minZoom = view.getMinZoom();
      const maxZoom = view.getMaxZoom();
      captureController = controller;
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        if (!disposed) {
          scaleMapStyles(1);
          map.setSize(size);
          view.setMinZoom(minZoom);
          view.setMaxZoom(maxZoom);
          view.setCenter(center);
          view.setResolution(resolution);
          view.setRotation(rotation);
        }
        if (captureController === controller) captureController = null;
        if (restoreCapture === restore) restoreCapture = null;
        if (!disposed) runtime.setOptions(options);
      };
      restoreCapture = restore;
      try {
        if (hasFailedVisibleSource()) throw new Error('地图资源加载失败，无法保证导出完整；请刷新数据源后重试。');
        const targetResolution = resolution * size[0] / width;
        const targetZoom = view.getZoomForResolution(targetResolution);
        if (targetZoom === undefined || !Number.isFinite(targetZoom)) throw new Error('无法计算导出地图的分辨率。');
        view.setMinZoom(Math.min(minZoom, targetZoom - 1));
        view.setMaxZoom(Math.max(maxZoom, targetZoom + 1));
        scaleMapStyles(width / size[0]);
        map.setSize([width, height]);
        view.setResolution(targetResolution);
        await waitForMapRender((complete) => { const key = map.once('rendercomplete', complete); return () => unByKey(key); }, () => map.renderSync(), controller.signal);
        assertExportActive(controller.signal);
        if (hasFailedVisibleSource()) throw new Error('地图资源加载失败，未导出不完整地图。');
        return { canvas: compositeMapCanvases(map.getViewport(), width, height), rotation, groundMetersPerMm };
      } finally {
        signal?.removeEventListener('abort', abort);
        restore();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      captureController?.abort();
      cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      unByKey(moveKey);
      sourceWatches.forEach((watch) => unByKey(watch.keys));
      sourceWatches.clear();
      exportGraticule?.dispose();
      exportGraticule = null;
      graticule.dispose();
      if (scaleControl) map.removeControl(scaleControl);
      if (northControl) map.removeControl(northControl);
      uploaded.forEach((entry) => entry.source.clear());
      uploaded.clear();
      basemaps.clear();
      map.setTarget(undefined);
      map.dispose();
    },
  };
  runtime.setOptions(options);
  return runtime;
}
