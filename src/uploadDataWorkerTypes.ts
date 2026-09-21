import type { GeoJsonFeatureCollection } from './gisStore';
import type { SourceCrs } from './coordinateReferenceSystem';

export type UploadDataKind = 'shapefile' | 'geojson' | 'csv' | 'geopackage' | 'geoparquet' | 'geotiff';

export type UploadRasterData = {
  width: number;
  height: number;
  epsg?: number;
  geoTransform: number[];
  nodata?: number;
  pixels: Float64Array;
  min: number;
  max: number;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  display?: {
    width: number;
    height: number;
    pixels: Float64Array;
    coordinates: [[number, number], [number, number], [number, number], [number, number]];
  };
};

export type UploadWorkerRequest = {
  id: number;
  kind: UploadDataKind;
  fileName: string;
  bytes: ArrayBuffer;
};

export type UploadWorkerResponse = {
  id: number;
  ok: true;
  sourceCrs: SourceCrs;
  geojson?: GeoJsonFeatureCollection;
  raster?: UploadRasterData;
} | {
  id: number;
  ok: false;
  message: string;
};
