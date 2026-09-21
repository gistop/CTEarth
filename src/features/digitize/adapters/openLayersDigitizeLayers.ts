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
import { createEditableStyle, createRasterAoiStyle, createReferenceStyle, type DigitizeFeatureStyle } from './digitizeMapStyles';
import type { DigitizeMapInput } from './digitizeMapTypes';

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
  const editableLayer = new VectorLayer({ source: editableSource, style: createEditableStyle(), zIndex: 3 });
  const referenceLayer = new VectorLayer({ source: referenceSource, style: feature => previous ? createReferenceStyle(metadata.get(feature) ?? {}, previous.defaultStyle) : undefined, zIndex: 2 });
  const aoiLayer = new VectorLayer({ source: aoiSource, style: createRasterAoiStyle(), zIndex: 4 });
  const rasterLayer = new ImageLayer<ImageStatic>({ visible: false, zIndex: 1 });
  const basemaps = new globalThis.Map<string, OpenLayersBasemapLayer>();
  const adapter = createOpenLayersLayerAdapter();
  let previous: DigitizeMapInput | null = null;
  [rasterLayer, referenceLayer, editableLayer, aoiLayer].forEach(layer => map.addLayer(layer));

  const restoreEditable = () => {
    const features = previous?.editableLayer ? codec.read(previous.editableLayer.geojson) : [];
    editableSource.clear();
    editableSource.addFeatures(features);
  };

  return {
    codec, editableSource, referenceSource, aoiSource, editableLayer, restoreEditable,
    sync(input: DigitizeMapInput) {
      if (input === previous) return;
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
        rasterLayer.setSource(input.raster && positions ? new ImageStatic({
          imageExtent: transformExtent([Math.min(...positions.map(position => position[0])), Math.min(...positions.map(position => position[1])), Math.max(...positions.map(position => position[0])), Math.max(...positions.map(position => position[1]))], 'EPSG:4326', 'EPSG:3857'),
          url: input.raster.imageUrl, projection: 'EPSG:3857',
        }) : null);
      }
      rasterLayer.setOpacity(input.raster ? input.rasterStyles[input.raster.id]?.opacity ?? 0.82 : 1);
      rasterLayer.setVisible(Boolean(input.raster && isDigitizeLayerVisible(input, `raster:${input.raster.id}`, input.rasterLayerVisibility[input.raster.id] ?? input.layerVisibility.raster)));
      if (editableChanged) { editableSource.clear(); if (editable) editableSource.addFeatures(editable); }
      if (referenceChanged) { referenceSource.clear(); referenceSource.addFeatures(references); }
      previous = input;
    },
    invalidate() { previous = null; },
    dispose() {
      basemaps.forEach(layer => { map.removeLayer(layer); layer.dispose(); });
      basemaps.clear();
      [editableSource, referenceSource, aoiSource].forEach(source => source.clear());
      [rasterLayer, referenceLayer, editableLayer, aoiLayer].forEach(layer => { map.removeLayer(layer); layer.dispose(); });
      previous = null;
    },
  };
}
