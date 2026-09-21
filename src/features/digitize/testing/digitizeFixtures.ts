import type { RasterOverlay, UploadedLayer } from '../../../gisStore';
import type { DigitizeDataPort, DigitizeEditableLayer, DigitizeFeatureCollection } from '../types';
import type { DigitizeMapInput } from '../adapters/digitizeMapTypes';

export function createPointFeature(id = 'point-1') {
  return { type: 'Feature' as const, id, geometry: { type: 'Point' as const, coordinates: [10, 50] as [number, number] }, properties: { name: id, value: 42 } };
}

export function createEditableLayer(id = 'points'): UploadedLayer {
  const geojson = { type: 'FeatureCollection' as const, features: [createPointFeature()] };
  return { id, fileName: `${id}.geojson`, geojson, geometryType: 'Point', toolInput: { inputName: `${id}.geojson`, files: {} }, points: geojson, fields: ['name', 'value'], numericFields: ['value'], selectedField: 'value', selectedFeatureIndexes: [] };
}

export function createDigitizeInput(layer = createEditableLayer()): DigitizeMapInput {
  return {
    editableLayer: layer, layers: [layer], uploadedLayerVisibility: {}, uploadedLayerStyles: {},
    defaultStyle: { pointColor: '#f6c445', pointRadius: 6, pointOpacity: 1, pointStrokeColor: '#17202a', pointStrokeWidth: 1.5, lineColor: '#2f6da5', lineWidth: 2, lineOpacity: 1, fillColor: '#6b9bd2', fillOpacity: 0.22 },
    layerVisibility: { basemap: true, raster: true, vectorOverlay: true }, raster: null, rasterStyles: {}, rasterLayerVisibility: {},
    vectorOverlay: null, vectorOverlayStyle: { fillColor: '#31a354', fillOpacity: 0.28, lineColor: '#16753b', lineWidth: 2 },
    mapGroups: { initialized: true, entries: [] },
  };
}

export function createDigitizeRaster(): RasterOverlay {
  return {
    id: 'raster', name: 'elevation.tif', toolInput: { inputName: 'elevation.tif', files: {} },
    imageUrl: 'data:image/png;base64,', coordinates: [[10, 51], [11, 51], [11, 50], [10, 50]],
    width: 1, height: 1, min: 0, max: 0, geoTransform: [10, 1, 0, 51, 0, -1], pixels: new Float64Array([0]),
  };
}

export function createMemoryDigitizePort(initial: DigitizeEditableLayer[] = [createEditableLayer()]) {
  const layers = new Map(initial.map(layer => [layer.id, layer]));
  let activeId: string | null = initial[0]?.id ?? null;
  const writes: { layerId: string; geojson: DigitizeFeatureCollection }[] = [];
  const port: DigitizeDataPort = {
    getActiveLayer: () => activeId ? layers.get(activeId) ?? null : null,
    getLayer: layerId => layers.get(layerId) ?? null,
    replaceFeatures(layerId, geojson, expected) {
      const layer = layers.get(layerId);
      if (!layer || layer.geojson !== expected) throw new Error('Data conflict');
      layers.set(layerId, { ...layer, geojson });
      writes.push({ layerId, geojson });
    },
  };
  return { port, writes, put: (layer: DigitizeEditableLayer) => layers.set(layer.id, layer), remove: (id: string) => layers.delete(id), activate: (id: string | null) => { activeId = id; } };
}
