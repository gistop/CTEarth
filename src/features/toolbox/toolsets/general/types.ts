import type { OverlayToolId, TerrainToolId } from '../../../../gisStore';

export type AnalysisToolId =
  | 'idw'
  | 'buffer'
  | 'extractByMask'
  | OverlayToolId
  | TerrainToolId;
