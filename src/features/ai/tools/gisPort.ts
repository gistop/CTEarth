import type {
  BufferParameters, EditableGeometryType, GisOperationResult, IdwParameters, LayerVisibility, OverlayParameters, OverlayToolId,
  RasterCalculatorParameters, RasterOverlay, RasterReclassifyOutput, RasterReclassifyParameters,
  RasterResampleOutput, RasterResampleParameters,
  SelectByLocationParameters, SelectByValueParameters, SelectionResult,
  TerrainParameters, TerrainToolId, UploadedLayer, VectorOverlay,
} from '../../../gisStore';

export type AiGisSnapshot = {
  layer: UploadedLayer | null;
  layers: UploadedLayer[];
  raster: RasterOverlay | null;
  rasters: RasterOverlay[];
  vectorOverlay: VectorOverlay | null;
  toolsReady: boolean;
  isRunning: boolean;
  message: string;
  layerVisibility: LayerVisibility;
  uploadedLayerVisibility: Record<string, boolean>;
};

export interface AiGisPort {
  getSnapshot(): AiGisSnapshot;
  createBlankGeoJsonLayer(params: { fileName?: string; geometryType: EditableGeometryType }): {
    layerId: string;
    fileName: string;
    geometryType: EditableGeometryType;
  };
  selectByValue(params: SelectByValueParameters): Promise<SelectionResult | null>;
  selectByLocation(params: SelectByLocationParameters): Promise<SelectionResult | null>;
  runBufferAnalysis(params: BufferParameters): Promise<GisOperationResult<UploadedLayer>>;
  runOverlayAnalysis(tool: OverlayToolId, params: OverlayParameters): Promise<GisOperationResult<UploadedLayer>>;
  runIdwInterpolation(params: IdwParameters): Promise<GisOperationResult<RasterOverlay>>;
  runRasterCalculator(params: RasterCalculatorParameters): Promise<GisOperationResult<RasterOverlay>>;
  runRasterReclassify(params: RasterReclassifyParameters): Promise<GisOperationResult<RasterReclassifyOutput>>;
  runRasterResample(params: RasterResampleParameters): Promise<GisOperationResult<RasterResampleOutput>>;
  runTerrainAnalysis(tool: TerrainToolId, params: TerrainParameters): Promise<GisOperationResult<RasterOverlay>>;
}
