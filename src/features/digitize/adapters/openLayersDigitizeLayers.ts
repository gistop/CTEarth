import type Map from 'ol/Map.js';
import type Feature from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import ImageLayer from 'ol/layer/Image.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import { transformExtent } from 'ol/proj.js';
import { createOpenLayersLayerAdapter, type OpenLayersBasemapLayer } from '../../layers/adapters/openLayersLayerAdapter';
import { createDigitizeFeatureCodec } from './openLayersDigitizeCodec';
import { createEditableStyle, createRasterAoiOutlineStyle, createRasterAoiStyle, createRasterPixelValueStyle, createReferenceStyle, resolveStyleLabelText, type DigitizeFeatureStyle } from './digitizeMapStyles';
import type { DigitizeMapInput } from './digitizeMapTypes';
import type { RasterAoiPolygon } from '../types';
import { collectRasterAoiPixels } from '../services/rasterAoiPixels';
import {
  createRasterAoiOutlineFeature,
  createRasterAoiValueFeatures,
  type RasterExtent3857,
} from './rasterAoiHighlight';

export function isDigitizeLayerVisible(input: DigitizeMapInput, layerId: string, fallback: boolean) {
  const entries = input.mapGroups.entries.filter(entry => entry.layerId === layerId);
  return fallback && (entries.length === 0 || entries.some(entry => entry.visible));
}

export function createDigitizeLayerRenderer(map: Map) {
  const codec = createDigitizeFeatureCodec();
  const metadata = new WeakMap<object, DigitizeFeatureStyle>();
  const editableSource = new VectorSource<Feature<Geometry>>();
  const referenceSource = new VectorSource<Feature<Geometry>>();
  const aoiSource = new VectorSource<Feature<Geometry>>();
  const editableLayer = new VectorLayer({ source: editableSource, style: feature => createEditableStyle(resolveStyleLabelText(previous?.editableLayer ? previous.uploadedLayerStyles[previous.editableLayer.id] : undefined, feature)), zIndex: 3 });
  const referenceLayer = new VectorLayer({ source: referenceSource, style: feature => previous ? createReferenceStyle(metadata.get(feature) ?? {}, previous.defaultStyle, feature as Feature<Geometry>) : undefined, zIndex: 2 });
  const aoiLayer = new VectorLayer({ source: aoiSource, style: createRasterAoiStyle(), zIndex: 4 });
  const rasterLayer = new ImageLayer<ImageStatic>({ visible: false, zIndex: 1 });
  const aoiValueSource = new VectorSource<Feature<Geometry>>();
  const aoiOutlineSource = new VectorSource<Feature<Geometry>>();
  // 命中像元轮廓夹在栅格图与矢量参考图层之间；像元值标注压在最上层，避免被其他图层盖住
  const aoiHighlightLayer = new VectorLayer({ source: aoiOutlineSource, style: createRasterAoiOutlineStyle(), zIndex: 1.5 });
  const aoiValueLayer = new VectorLayer({
    source: aoiValueSource,
    style: feature => createRasterPixelValueStyle(String(feature.get('value') ?? '')),
    declutter: true,
    zIndex: 5,
  });
  const basemaps = new globalThis.Map<string, OpenLayersBasemapLayer>();
  const adapter = createOpenLayersLayerAdapter();
  let previous: DigitizeMapInput | null = null;
  let rasterExtent: RasterExtent3857 | null = null;
  let highlightAoi: RasterAoiPolygon | null = null;
  let highlightShowValues = false;
  [rasterLayer, aoiHighlightLayer, referenceLayer, editableLayer, aoiLayer, aoiValueLayer].forEach(layer => map.addLayer(layer));

  function clearAoiHighlight() {
    aoiOutlineSource.clear();
    aoiValueSource.clear();
  }

  /** 按当前 AOI 与栅格重算「命中像元轮廓 + 像元值标注」，返回统计结果供状态栏使用 */
  function refreshAoiHighlight() {
    clearAoiHighlight();

    const raster = previous?.raster ?? null;

    if (!highlightAoi || !raster || !rasterExtent) {
      return { count: 0, labelled: 0, outlined: false, skipped: false, truncated: false };
    }

    const match = collectRasterAoiPixels(highlightAoi, raster);

    if (match.skipped || match.count === 0) {
      return { count: 0, labelled: 0, outlined: false, skipped: match.skipped, truncated: false };
    }

    const outline = createRasterAoiOutlineFeature(match, rasterExtent, raster.width, raster.height);

    if (outline) {
      aoiOutlineSource.addFeature(outline);
    }

    const valueFeatures = highlightShowValues
      ? createRasterAoiValueFeatures(match, rasterExtent, raster.width, raster.height)
      : [];

    if (valueFeatures.length) {
      aoiValueSource.addFeatures(valueFeatures);
    }

    return {
      count: match.count,
      labelled: valueFeatures.length,
      outlined: Boolean(outline),
      skipped: false,
      truncated: match.truncated,
    };
  }

  const restoreEditable = () => {
    const features = previous?.editableLayer ? codec.read(previous.editableLayer.geojson) : [];
    editableSource.clear();
    editableSource.addFeatures(features);
  };

  return {
    codec, editableSource, referenceSource, aoiSource, editableLayer, restoreEditable,
    sync(input: DigitizeMapInput) {
      if (input === previous) return;
      let rasterChanged = false;
      const editableChanged = !previous || input.editableLayer?.id !== previous.editableLayer?.id || input.editableLayer?.geojson !== previous.editableLayer?.geojson;
      const editable = editableChanged && input.editableLayer ? codec.read(input.editableLayer.geojson) : null;
      const referenceChanged = editableChanged || !previous || input.layers !== previous.layers || input.uploadedLayerStyles !== previous.uploadedLayerStyles || input.defaultStyle !== previous.defaultStyle || input.uploadedLayerVisibility !== previous.uploadedLayerVisibility || input.mapGroups !== previous.mapGroups || input.vectorOverlay !== previous.vectorOverlay || input.vectorOverlayStyle !== previous.vectorOverlayStyle || input.layerVisibility.vectorOverlay !== previous.layerVisibility.vectorOverlay;
      const references: Feature<Geometry>[] = [];
      if (referenceChanged) {
        input.layers.forEach(layer => {
          if (layer.id === input.editableLayer?.id || !isDigitizeLayerVisible(input, `uploaded:${layer.id}`, input.uploadedLayerVisibility[layer.id] ?? true)) return;
          const features = codec.read(layer.geojson);
          const selected = new Set(layer.selectedFeatureIndexes);
          features.forEach((feature, index) => metadata.set(feature, { uploadedStyle: input.uploadedLayerStyles[layer.id] ?? input.defaultStyle, selected: selected.has(index) }));
          references.push(...features);
        });
        if (input.vectorOverlay && isDigitizeLayerVisible(input, 'vectorOverlay', input.layerVisibility.vectorOverlay)) {
          const features = codec.read(input.vectorOverlay.geojson);
          features.forEach(feature => metadata.set(feature, { bufferStyle: input.vectorOverlayStyle }));
          references.push(...features);
        }
      }
      if (!previous || input.mapGroups !== previous.mapGroups || input.layerVisibility.basemap !== previous.layerVisibility.basemap) {
        adapter.sync({ map, entries: input.mapGroups.entries, basemapLayers: basemaps, basemapLayerIdPrefix: 'digitize-basemap', basemapVisible: input.layerVisibility.basemap, stacking: 'background' });
      }
      if (input.raster !== previous?.raster) {
        const positions = input.raster?.coordinates;
        rasterExtent = positions ? transformExtent([
          Math.min(...positions.map(position => position[0])),
          Math.min(...positions.map(position => position[1])),
          Math.max(...positions.map(position => position[0])),
          Math.max(...positions.map(position => position[1])),
        ], 'EPSG:4326', 'EPSG:3857') as RasterExtent3857 : null;
        rasterLayer.setSource(input.raster && rasterExtent ? new ImageStatic({
          imageExtent: rasterExtent,
          url: input.raster.imageUrl, projection: 'EPSG:3857',
          interpolate: false,
        }) : null);
        rasterChanged = true;
      }
      rasterLayer.setOpacity(input.raster ? input.rasterStyles[input.raster.id]?.opacity ?? 0.82 : 1);
      rasterLayer.setVisible(Boolean(input.raster && isDigitizeLayerVisible(input, `raster:${input.raster.id}`, input.rasterLayerVisibility[input.raster.id] ?? input.layerVisibility.raster)));
      if (editableChanged) { editableSource.clear(); if (editable) editableSource.addFeatures(editable); }
      if (referenceChanged) { referenceSource.clear(); referenceSource.addFeatures(references); }
      // 标注等样式变化时触发编辑图层重新求值样式函数
      if (!previous || input.uploadedLayerStyles !== previous.uploadedLayerStyles) editableLayer.changed();
      previous = input;
      if (rasterChanged) refreshAoiHighlight();
    },
    setAoiHighlight(aoi: RasterAoiPolygon | null, showValues: boolean) {
      highlightAoi = aoi;
      highlightShowValues = showValues;
      return refreshAoiHighlight();
    },
    invalidate() { previous = null; rasterExtent = null; clearAoiHighlight(); },
    dispose() {
      basemaps.forEach(layer => { map.removeLayer(layer); layer.dispose(); });
      basemaps.clear();
      [editableSource, referenceSource, aoiSource, aoiValueSource].forEach(source => source.clear());
      [rasterLayer, aoiHighlightLayer, referenceLayer, editableLayer, aoiLayer, aoiValueLayer].forEach(layer => { map.removeLayer(layer); layer.dispose(); });
      previous = null;
      rasterExtent = null;
    },
  };
}
