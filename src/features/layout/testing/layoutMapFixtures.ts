import type { UploadedLayer } from '../../../gisStore';
import type { LayoutMapInput } from '../adapters/layoutMapTypes';

export function createLayoutMapInput(): LayoutMapInput {
  return {
    layers: [], raster: null, vectorOverlay: null,
    layerVisibility: { basemap: true, raster: true, vectorOverlay: true },
    rasterLayerVisibility: {}, rasterStyles: {},
    uploadedLayerStyles: {}, uploadedLayerVisibility: {},
    vectorOverlayStyle: { fillColor: '#31a354', fillOpacity: 0.28, lineColor: '#16753b', lineWidth: 2 },
    defaultUploadedStyle: { pointColor: '#f6c445', pointRadius: 6, pointOpacity: 1, pointStrokeColor: '#17202a', pointStrokeWidth: 1.5, lineColor: '#2f6da5', lineWidth: 2, lineOpacity: 1, fillColor: '#6b9bd2', fillOpacity: 0.22 },
    mapGroups: { initialized: true, entries: [] },
  };
}

export function createLayoutPointLayer(): UploadedLayer {
  const geojson = { type: 'FeatureCollection' as const, features: [
    { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [10, 50] as [number, number] }, properties: { value: 42 } },
  ] };
  return {
    id: 'points', fileName: 'points.geojson', toolInput: { inputName: 'points.geojson', files: {} },
    geojson, points: geojson, fields: ['value'], numericFields: ['value'], selectedField: 'value', selectedFeatureIndexes: [0],
  };
}
