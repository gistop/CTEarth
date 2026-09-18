import { vi } from 'vitest';
import type { GisOperationResult, OverlayToolId, RasterOverlay, RasterReclassifyOutput, RasterResampleOutput, SelectionResult, UploadedLayer, VectorOverlay } from '../../../gisStore';
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
  const generatedLayer: UploadedLayer = { ...layer, id: 'buffer-result', fileName: overlay.name, selectedFeatureIndexes: [] };
  let snapshot: AiGisSnapshot = {
    layer, layers: [layer], raster, rasters: [raster], vectorOverlay: null,
    toolsReady: true, isRunning: false, message: '',
    layerVisibility: { basemap: true, raster: true, vectorOverlay: true },
    uploadedLayerVisibility: {},
  };
  const selection: SelectionResult = { layerId: layer.id, layerName: 'roads', totalCount: 1, selectedCount: 1, matchedCount: 1 };
  const port = {
    getSnapshot: () => snapshot,
    selectByValue: vi.fn(async (): Promise<SelectionResult | null> => selection),
    selectByLocation: vi.fn(async (): Promise<SelectionResult | null> => selection),
    runBufferAnalysis: vi.fn(async (): Promise<GisOperationResult<UploadedLayer>> => ({ ok: true, output: generatedLayer })),
    runOverlayAnalysis: vi.fn(async (tool: OverlayToolId): Promise<GisOperationResult<UploadedLayer>> => ({ ok: true, output: { ...generatedLayer, id: `${tool}-result`, fileName: `${tool}.geojson` } })),
    runIdwInterpolation: vi.fn(async (): Promise<GisOperationResult<RasterOverlay>> => ({ ok: true, output: raster })),
    runRasterCalculator: vi.fn(async (): Promise<GisOperationResult<RasterOverlay>> => ({
      ok: true,
      output: { ...raster, id: 'raster-calculator-result', name: 'raster-calculator.tif', pixels: new Float64Array([2, 4, 6, 8]) },
    })),
    runTerrainAnalysis: vi.fn(async (): Promise<GisOperationResult<RasterOverlay>> => ({ ok: true, output: raster })),
    runRasterReclassify: vi.fn(async (params: { method: RasterReclassifyOutput['method'] }): Promise<GisOperationResult<RasterReclassifyOutput>> => ({
      ok: true,
      output: {
        raster: { ...raster, id: 'raster-reclassify-result', name: 'raster-reclassify.tif', pixels: new Float64Array([1, 1, 2, 2]) },
        method: params.method,
        breaks: [2.5, 3.5],
        classCount: 3,
        histogram: [1, 1, 2],
      },
    })),
    runRasterResample: vi.fn(async (params: { method: RasterResampleOutput['method'] }): Promise<GisOperationResult<RasterResampleOutput>> => ({
      ok: true,
      output: {
        raster: { ...raster, id: 'raster-resample-result', name: 'raster-resample.tif', pixels: new Float64Array([1, 2, 3, 4]) },
        method: params.method,
        inputCellSize: 0.5,
        outputCellSize: 1,
        validCount: 4,
      },
    })),
  } satisfies AiGisPort;

  return { port, layer, raster, overlay, generatedLayer, selection, setSnapshot(next: Partial<AiGisSnapshot>) { snapshot = { ...snapshot, ...next }; } };
}
