import { vi } from 'vitest';
import type { GisOperationResult, RasterOverlay, SelectionResult, UploadedLayer, VectorOverlay } from '../../../gisStore';
import type { AiGisPort, AiGisSnapshot } from '../tools/gisPort';

export function createGisFixture() {
  const layer: UploadedLayer = {
    id: 'roads',
    fileName: 'roads.geojson',
    toolInput: { inputName: 'roads.geojson', files: {} },
    geojson: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [120, 30] }, properties: { value: 5 } }],
    },
    points: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [120, 30] }, properties: { value: 5 } }],
    },
    fields: ['value', 'name'],
    numericFields: ['value'],
    selectedField: 'value',
    selectedFeatureIndexes: [0],
  };
  const raster: RasterOverlay = {
    id: 'dem', name: 'dem.tif', toolInput: { inputName: 'dem.tif', files: {} },
    imageUrl: 'blob:dem', width: 2, height: 2, min: 1, max: 4, epsg: 4326,
    coordinates: [[120, 31], [121, 31], [121, 30], [120, 30]],
    geoTransform: [120, 0.5, 0, 31, 0, -0.5], pixels: new Float64Array([1, 2, 3, 4]),
  };
  const overlay: VectorOverlay = { name: 'buffer.geojson', geojson: layer.geojson };
  let snapshot: AiGisSnapshot = {
    layer, layers: [layer], raster, vectorOverlay: null,
    toolsReady: true, isRunning: false, message: '',
    layerVisibility: { basemap: true, raster: true, vectorOverlay: true },
    uploadedLayerVisibility: {},
  };
  const selection: SelectionResult = { layerId: layer.id, layerName: 'roads', totalCount: 1, selectedCount: 1, matchedCount: 1 };
  const port = {
    getSnapshot: () => snapshot,
    selectByValue: vi.fn(async (): Promise<SelectionResult | null> => selection),
    selectByLocation: vi.fn(async (): Promise<SelectionResult | null> => selection),
    runBufferAnalysis: vi.fn(async (): Promise<GisOperationResult<VectorOverlay>> => ({ ok: true, output: overlay })),
    runIdwInterpolation: vi.fn(async (): Promise<GisOperationResult<RasterOverlay>> => ({ ok: true, output: raster })),
    runTerrainAnalysis: vi.fn(async (): Promise<GisOperationResult<RasterOverlay>> => ({ ok: true, output: raster })),
  } satisfies AiGisPort;

  return { port, layer, raster, overlay, selection, setSnapshot(next: Partial<AiGisSnapshot>) { snapshot = { ...snapshot, ...next }; } };
}
