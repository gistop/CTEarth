import type { OverlayToolId, TerrainToolId } from '../../../../gisStore';

export type AnalysisToolId =
  | 'idw'
  | 'buffer'
  | 'extractByMask'
  | 'rasterCalculator'
  | 'rasterReclassify'
  | 'rasterResample'
  | OverlayToolId
  | TerrainToolId;
