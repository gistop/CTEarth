import type {
  BufferParameters, GisOperationResult, IdwParameters, LayerVisibility, RasterOverlay,
  SelectByLocationParameters, SelectByValueParameters, SelectionResult,
  TerrainParameters, TerrainToolId, UploadedLayer, VectorOverlay,
} from '../../../gisStore';

export type AiGisSnapshot = {
  layer: UploadedLayer | null;
  layers: UploadedLayer[];
  raster: RasterOverlay | null;
  vectorOverlay: VectorOverlay | null;
  toolsReady: boolean;
  isRunning: boolean;
  message: string;
  layerVisibility: LayerVisibility;
  uploadedLayerVisibility: Record<string, boolean>;
};

export interface AiGisPort {
  getSnapshot(): AiGisSnapshot;
  selectByValue(params: SelectByValueParameters): Promise<SelectionResult | null>;
  selectByLocation(params: SelectByLocationParameters): Promise<SelectionResult | null>;
  runBufferAnalysis(params: BufferParameters): Promise<GisOperationResult<VectorOverlay>>;
  runIdwInterpolation(params: IdwParameters): Promise<GisOperationResult<RasterOverlay>>;
  runTerrainAnalysis(tool: TerrainToolId, params: TerrainParameters): Promise<GisOperationResult<RasterOverlay>>;
}
