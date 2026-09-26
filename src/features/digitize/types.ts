export type DigitizeGeometryType = 'Point' | 'LineString' | 'Polygon';
export type DigitizeCoordinate = number[];
export type RasterAoiPolygon = { type: 'Polygon'; coordinates: [number, number][][] };
export type DigitizeFeatureCollection = { type: 'FeatureCollection'; features: unknown[]; [key: string]: unknown };

export type DigitizeState = {
  activeTool: DigitizeGeometryType;
  editingActive: boolean;
  featureCount: number;
  modifyEnabled: boolean;
  rasterAoi: RasterAoiPolygon | null;
  rasterAoiActive: boolean;
  rasterAoiRevision: number;
  rasterPixelValuesVisible: boolean;
  snapEnabled: boolean;
  status: string;
  traceEnabled: boolean;
};

export type DigitizeCommand =
  | { type: 'set-tool'; tool: DigitizeGeometryType }
  | { type: 'set-editing'; active: boolean }
  | { type: 'toggle-modify' }
  | { type: 'set-snap'; enabled: boolean }
  | { type: 'set-trace'; enabled: boolean }
  | { type: 'set-status'; status: string }
  | { type: 'set-feature-count'; count: number }
  | { type: 'start-aoi' }
  | { type: 'set-aoi'; polygon: RasterAoiPolygon | null }
  | { type: 'clear-aoi' }
  | { type: 'set-raster-values'; visible: boolean };

export type DigitizeEditableLayer = {
  id: string;
  fileName: string;
  geometryType?: DigitizeGeometryType;
  geojson: DigitizeFeatureCollection;
};

export interface DigitizeDataPort {
  getActiveLayer(): DigitizeEditableLayer | null;
  getLayer(layerId: string): DigitizeEditableLayer | null;
  replaceFeatures(layerId: string, next: DigitizeFeatureCollection, expected: DigitizeFeatureCollection): void;
}

export type DigitizeEditSession = Readonly<{
  layerId: string;
  base: DigitizeFeatureCollection;
  geometryType?: DigitizeGeometryType;
}>;

export type DigitizeMapHandle = {
  locate(): void;
  resetNorth(): void;
  syncFromMapLibre(): void;
  zoomIn(): void;
  zoomOut(): void;
};
