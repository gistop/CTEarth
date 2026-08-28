import {
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetReadObjects,
  toJson,
  type AsyncBuffer,
  type FileMetaData,
  type LogicalType,
} from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import initGeoLibre, { transform_points_epsg } from 'geolibre-wasm';

type GeoJsonGeometry = {
  type: string;
  coordinates?: unknown;
  geometries?: unknown[];
};

type GeoJsonFeature = {
  type: 'Feature';
  geometry: GeoJsonGeometry | null;
  properties: Record<string, unknown>;
};

type GeoParquetSourceProjection =
  | { kind: 'epsg'; epsg: number }
  | { kind: 'transverseMercator'; crsName: string; parameters: TransverseMercatorParameters };

type TransverseMercatorParameters = {
  semiMajorAxis: number;
  inverseFlattening: number;
  latitudeOfOrigin: number;
  longitudeOfOrigin: number;
  scaleFactor: number;
  falseEasting: number;
  falseNorthing: number;
};

export type GeoParquetFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

const geoJsonGeometryTypes = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
]);
const wgs84Epsg = 4326;

export async function readGeoParquetFile(file: File): Promise<GeoParquetFeatureCollection> {
  return readGeoParquetBuffer(fileToAsyncBuffer(file));
}

export async function readGeoParquetUrl(url: string): Promise<GeoParquetFeatureCollection> {
  return readGeoParquetBuffer(await asyncBufferFromUrl({ url }));
}

async function readGeoParquetBuffer(file: AsyncBuffer): Promise<GeoParquetFeatureCollection> {
  const metadata = await parquetMetadataAsync(file);
  const geometryField = metadata.schema.find((field) => isGeometryLogicalType(field.logical_type));
  const rows = await parquetReadObjects({
    file,
    metadata,
    compressors,
    rowFormat: 'object',
  });
  const geometryColumn = geometryField?.name ?? findGeometryColumn(rows);
  const sourceProjection = sourceProjectionForGeometryColumn(metadata, geometryColumn);

  const geojson = rowsToGeoJson(rows, geometryColumn);

  if (!sourceProjection) {
    if (!coordinatesWithinLngLat(geojson)) {
      throw new Error('GeoParquet 几何列声明了未知 CRS，且坐标不在经纬度范围内；请先转为 EPSG:4326，或在 GeoParquet CRS 元数据中写入可识别的 EPSG 编码。');
    }

    return geojson;
  }

  if (sourceProjection.kind === 'epsg' && sourceProjection.epsg === wgs84Epsg) {
    if (!coordinatesWithinLngLat(geojson)) {
      throw new Error('GeoParquet 坐标超出经纬度范围，但未在 CRS 元数据中识别到可转换的 EPSG 编码；请检查 GeoParquet 的 geo.columns.<geometry>.crs 是否声明了实际投影坐标系。');
    }

    return geojson;
  }

  return reprojectFeatureCollection(geojson, sourceProjection);
}

function rowsToGeoJson(rows: Record<string, unknown>[], preferredGeometryColumn?: string): GeoParquetFeatureCollection {
  const geometryColumn = preferredGeometryColumn ?? findGeometryColumn(rows);

  if (!geometryColumn && rows.length > 0) {
    throw new Error('GeoParquet 中没有可识别的几何列。');
  }

  return {
    type: 'FeatureCollection',
    features: rows.map((row) => {
      const properties: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(row)) {
        if (key !== geometryColumn) {
          properties[key] = toJson(value);
        }
      }

      const geometry = geometryColumn ? row[geometryColumn] : null;

      return {
        type: 'Feature',
        geometry: isGeoJsonGeometry(geometry) ? geometry : null,
        properties,
      };
    }),
  };
}

function findGeometryColumn(rows: Record<string, unknown>[]) {
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (isGeoJsonGeometry(value)) {
        return key;
      }
    }
  }

  return undefined;
}

async function reprojectFeatureCollection(
  geojson: GeoParquetFeatureCollection,
  sourceProjection: GeoParquetSourceProjection,
): Promise<GeoParquetFeatureCollection> {
  const positions: number[][] = [];

  geojson.features.forEach((feature) => {
    collectGeometryPositions(feature.geometry, positions);
  });

  if (positions.length === 0) {
    return geojson;
  }

  if (sourceProjection.kind === 'transverseMercator') {
    return transformFeatureCollection(geojson, (position) => {
      const [longitude, latitude] = inverseTransverseMercator(Number(position[0]), Number(position[1]), sourceProjection.parameters);

      return [longitude, latitude, ...position.slice(2)];
    }, sourceProjection.crsName);
  }

  const sourceCoordinates = new Float64Array(positions.length * 2);

  positions.forEach((position, index) => {
    sourceCoordinates[index * 2] = Number(position[0]);
    sourceCoordinates[index * 2 + 1] = Number(position[1]);
  });

  let targetCoordinates: Float64Array;

  try {
    await initGeoLibre();
    targetCoordinates = transform_points_epsg(sourceProjection.epsg, wgs84Epsg, sourceCoordinates);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GeoParquet 坐标转换失败：无法从 EPSG:${sourceProjection.epsg} 转为 EPSG:${wgs84Epsg}。${message}`);
  }

  let coordinateIndex = 0;
  const sourceLabel = `EPSG:${sourceProjection.epsg}`;

  return transformFeatureCollection(geojson, (position) => {
    const next = [targetCoordinates[coordinateIndex * 2], targetCoordinates[coordinateIndex * 2 + 1], ...position.slice(2)];
    coordinateIndex += 1;

    return next;
  }, sourceLabel);
}

function transformFeatureCollection(
  geojson: GeoParquetFeatureCollection,
  transformPosition: (position: number[]) => number[],
  sourceLabel: string,
) {
  const transformed: GeoParquetFeatureCollection = {
    ...geojson,
    features: geojson.features.map((feature) => ({
      ...feature,
      geometry: reprojectGeometry(feature.geometry, transformPosition),
    })),
  };

  if (!coordinatesWithinLngLat(transformed)) {
    throw new Error(`GeoParquet 已按 ${sourceLabel} 转为 EPSG:${wgs84Epsg}，但结果仍超出经纬度范围；请检查文件 CRS 元数据是否与实际坐标一致。`);
  }

  return transformed;
}

function reprojectGeometry(
  geometry: GeoJsonGeometry | null,
  transformPosition: (position: number[]) => number[],
): GeoJsonGeometry | null {
  if (!geometry) {
    return null;
  }

  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: (geometry.geometries ?? []).map((item) => (
        isGeoJsonGeometry(item) ? reprojectGeometry(item, transformPosition) : item
      )),
    };
  }

  return {
    ...geometry,
    coordinates: mapCoordinates(geometry.coordinates, transformPosition),
  };
}

function mapCoordinates(value: unknown, transformPosition: (position: number[]) => number[]): unknown {
  if (isPosition(value)) {
    return transformPosition(value);
  }

  return Array.isArray(value)
    ? value.map((item) => mapCoordinates(item, transformPosition))
    : value;
}

function collectGeometryPositions(geometry: GeoJsonGeometry | null, positions: number[][]) {
  if (!geometry) {
    return;
  }

  if (geometry.type === 'GeometryCollection') {
    (geometry.geometries ?? []).forEach((item) => {
      if (isGeoJsonGeometry(item)) {
        collectGeometryPositions(item, positions);
      }
    });
    return;
  }

  collectPositions(geometry.coordinates, positions);
}

function collectPositions(value: unknown, positions: number[][]) {
  if (isPosition(value)) {
    positions.push(value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPositions(item, positions));
  }
}

function coordinatesWithinLngLat(geojson: GeoParquetFeatureCollection) {
  const positions: number[][] = [];

  geojson.features.forEach((feature) => {
    collectGeometryPositions(feature.geometry, positions);
  });

  return positions.every((position) => {
    const lon = Number(position[0]);
    const lat = Number(position[1]);

    return Number.isFinite(lon)
      && Number.isFinite(lat)
      && lon >= -180
      && lon <= 180
      && lat >= -90
      && lat <= 90;
  });
}

function sourceProjectionForGeometryColumn(metadata: FileMetaData, geometryColumn?: string): GeoParquetSourceProjection | undefined {
  if (!geometryColumn) {
    return { kind: 'epsg', epsg: wgs84Epsg };
  }

  const geometryField = metadata.schema.find((field) => field.name === geometryColumn);
  const logicalCrs = isGeometryLogicalType(geometryField?.logical_type)
    ? geometryField.logical_type.crs
    : undefined;
  const logicalEpsg = epsgFromCrs(logicalCrs);

  if (logicalEpsg) {
    return { kind: 'epsg', epsg: logicalEpsg };
  }

  const columnMetadata = geoMetadataColumn(metadata, geometryColumn);

  if (columnMetadata && 'crs' in columnMetadata && columnMetadata.crs === null) {
    return undefined;
  }

  const metadataEpsg = epsgFromCrs(columnMetadata?.crs);

  if (metadataEpsg) {
    return { kind: 'epsg', epsg: metadataEpsg };
  }

  const transverseMercator = transverseMercatorFromCrs(columnMetadata?.crs);

  if (transverseMercator) {
    return transverseMercator;
  }

  return { kind: 'epsg', epsg: wgs84Epsg };
}

function geoMetadataColumn(metadata: FileMetaData, geometryColumn: string) {
  const rawGeoMetadata = metadata.key_value_metadata?.find(({ key }) => key === 'geo')?.value;

  if (!rawGeoMetadata) {
    return undefined;
  }

  try {
    const geoMetadata = JSON.parse(rawGeoMetadata);
    const columns = isRecord(geoMetadata) && isRecord(geoMetadata.columns) ? geoMetadata.columns : {};
    const column = columns[geometryColumn];

    return isRecord(column) ? column : undefined;
  } catch {
    return undefined;
  }
}

function epsgFromCrs(crs: unknown): number | undefined {
  if (!crs) {
    return undefined;
  }

  if (typeof crs === 'string') {
    if (isCrs84String(crs)) {
      return wgs84Epsg;
    }

    return epsgFromString(crs);
  }

  if (!isRecord(crs)) {
    return undefined;
  }

  return epsgFromAuthorityId(crs)
    ?? epsgFromAuthorityId(crs.id)
    ?? epsgFromAuthorityId(crs.identifier)
    ?? epsgFromIds(crs.ids)
    ?? epsgFromIds(crs.identifiers)
    ?? epsgFromStringFields(crs)
    ?? (isCrs84Id(crs) || isCrs84Id(crs.id) ? wgs84Epsg : undefined);
}

function epsgFromIds(ids: unknown): number | undefined {
  if (!Array.isArray(ids)) {
    return undefined;
  }

  for (const id of ids) {
    const epsg = epsgFromAuthorityId(id);

    if (epsg) {
      return epsg;
    }
  }

  return undefined;
}

function epsgFromAuthorityId(id: unknown): number | undefined {
  if (typeof id === 'string') {
    return isCrs84String(id) ? wgs84Epsg : epsgFromString(id);
  }

  if (!isRecord(id)) {
    return undefined;
  }

  const authority = String(id.authority ?? '').toUpperCase();
  const code = Number(id.code);

  return authority === 'EPSG' && Number.isInteger(code) && code > 0 ? code : undefined;
}

function epsgFromString(value: string) {
  const match = /\bEPSG(?:::|:|\/0\/|\/)(\d{1,6})\b/i.exec(value)
    ?? /\bEPSG\b[^\d]{1,24}(\d{1,6})\b/i.exec(value);
  const code = match ? Number(match[1]) : NaN;

  return Number.isInteger(code) && code > 0 ? code : undefined;
}

function epsgFromStringFields(value: Record<string, unknown>): number | undefined {
  for (const key of ['name', 'code', 'href', '$schema']) {
    const epsg = typeof value[key] === 'string' ? epsgFromString(value[key]) : undefined;

    if (epsg) {
      return epsg;
    }
  }

  return undefined;
}

function transverseMercatorFromCrs(crs: unknown): GeoParquetSourceProjection | undefined {
  const projectedCrs = projectedCrsFromCrs(crs);

  if (!projectedCrs) {
    return undefined;
  }

  const conversion = isRecord(projectedCrs.conversion) ? projectedCrs.conversion : undefined;
  const method = isRecord(conversion?.method) ? conversion.method : undefined;
  const methodName = String(method?.name ?? conversion?.name ?? '');

  if (!/transverse\s+mercator|utm/i.test(methodName)) {
    return undefined;
  }

  const baseCrs = isRecord(projectedCrs.base_crs) ? projectedCrs.base_crs : undefined;
  const ellipsoid = ellipsoidFromCrs(baseCrs);
  const parameters = Array.isArray(conversion?.parameters) ? conversion.parameters.filter(isRecord) : [];
  const tmParameters: TransverseMercatorParameters = {
    semiMajorAxis: numberFromRecord(ellipsoid, 'semi_major_axis') ?? 6378137,
    inverseFlattening: numberFromRecord(ellipsoid, 'inverse_flattening') ?? 298.257223563,
    latitudeOfOrigin: parameterValue(parameters, ['latitude of natural origin', 'latitude of origin'], 0),
    longitudeOfOrigin: parameterValue(parameters, ['longitude of natural origin', 'central meridian'], 0),
    scaleFactor: parameterValue(parameters, ['scale factor at natural origin', 'scale factor'], 1),
    falseEasting: parameterValue(parameters, ['false easting'], 0),
    falseNorthing: parameterValue(parameters, ['false northing'], 0),
  };

  return {
    kind: 'transverseMercator',
    crsName: String(projectedCrs.name ?? 'Transverse Mercator CRS'),
    parameters: tmParameters,
  };
}

function projectedCrsFromCrs(crs: unknown): Record<string, unknown> | undefined {
  if (!isRecord(crs)) {
    return undefined;
  }

  if (String(crs.type ?? '').toLowerCase() === 'projectedcrs') {
    return crs;
  }

  if (Array.isArray(crs.components)) {
    return crs.components.find((component): component is Record<string, unknown> => (
      isRecord(component) && String(component.type ?? '').toLowerCase() === 'projectedcrs'
    ));
  }

  return undefined;
}

function ellipsoidFromCrs(crs: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const datum = isRecord(crs?.datum) ? crs.datum : undefined;
  const ellipsoid = isRecord(datum?.ellipsoid) ? datum.ellipsoid : undefined;

  return ellipsoid;
}

function parameterValue(parameters: Record<string, unknown>[], names: string[], fallback: number) {
  const normalizedNames = names.map(normalizeParameterName);
  const parameter = parameters.find((item) => normalizedNames.includes(normalizeParameterName(String(item.name ?? ''))));

  return numberFromRecord(parameter, 'value') ?? fallback;
}

function normalizeParameterName(name: string) {
  return name.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function numberFromRecord(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  const number = Number(value);

  return Number.isFinite(number) ? number : undefined;
}

function inverseTransverseMercator(
  x: number,
  y: number,
  parameters: TransverseMercatorParameters,
): [number, number] {
  const a = parameters.semiMajorAxis;
  const f = 1 / parameters.inverseFlattening;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const lat0 = degreesToRadians(parameters.latitudeOfOrigin);
  const lon0 = degreesToRadians(parameters.longitudeOfOrigin);
  const m0 = meridionalArc(lat0, a, e2);
  const m = m0 + (y - parameters.falseNorthing) / parameters.scaleFactor;
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const fp = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const c1 = ep2 * cosFp ** 2;
  const t1 = tanFp ** 2;
  const n1 = a / Math.sqrt(1 - e2 * sinFp ** 2);
  const r1 = (a * (1 - e2)) / (1 - e2 * sinFp ** 2) ** 1.5;
  const d = (x - parameters.falseEasting) / (n1 * parameters.scaleFactor);
  const latitude = fp - (n1 * tanFp / r1) * (
    d ** 2 / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720
  );
  const longitude = lon0 + (
    d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120
  ) / cosFp;

  return [radiansToDegrees(longitude), radiansToDegrees(latitude)];
}

function meridionalArc(latitude: number, semiMajorAxis: number, eccentricitySquared: number) {
  return semiMajorAxis * (
    (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256) * latitude
    - (3 * eccentricitySquared / 8 + 3 * eccentricitySquared ** 2 / 32 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(2 * latitude)
    + (15 * eccentricitySquared ** 2 / 256 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(4 * latitude)
    - (35 * eccentricitySquared ** 3 / 3072) * Math.sin(6 * latitude)
  );
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

function radiansToDegrees(value: number) {
  return value * 180 / Math.PI;
}

function isCrs84Id(id: unknown) {
  if (typeof id === 'string') {
    return isCrs84String(id);
  }

  if (!isRecord(id)) {
    return false;
  }

  return String(id.authority ?? '').toUpperCase() === 'OGC'
    && String(id.code ?? '').toUpperCase() === 'CRS84';
}

function isCrs84String(value: string) {
  return /\bOGC(?:::|:|\/)(CRS84)\b/i.test(value) || value.toUpperCase() === 'CRS84';
}

function fileToAsyncBuffer(file: File): AsyncBuffer {
  return {
    byteLength: file.size,
    slice: (start: number, end?: number) => file.slice(start, end).arrayBuffer(),
  };
}

function isGeoJsonGeometry(value: unknown): value is GeoJsonGeometry {
  if (!isRecord(value) || typeof value.type !== 'string' || !geoJsonGeometryTypes.has(value.type)) {
    return false;
  }

  return value.type === 'GeometryCollection'
    ? Array.isArray(value.geometries)
    : 'coordinates' in value;
}

function isGeometryLogicalType(value: LogicalType | undefined): value is Extract<LogicalType, { type: 'GEOMETRY' | 'GEOGRAPHY' }> {
  return value?.type === 'GEOMETRY' || value?.type === 'GEOGRAPHY';
}

function isPosition(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
