import JSZip from 'jszip';
import shp from 'shpjs';
import initGeoLibre, { GeoTiffReader, transform_bbox_epsg, transform_points_epsg, vector_info, vector_to_geojson_reproject } from 'geolibre-wasm';
import { readGeoParquetFileWithMetadata } from './geoParquet';
import { sourceCrsFromDefinition, sourceCrsFromEpsg, sourceCrsFromGeoJson, type SourceCrs } from './coordinateReferenceSystem';
import { decodeTextBytes, isUtf8Compatible } from './uploadTextDecoding';
import type { GeoJsonFeatureCollection } from './gisStore';
import type { UploadDataKind, UploadRasterData, UploadWorkerRequest, UploadWorkerResponse } from './uploadDataWorkerTypes';

self.addEventListener('message', (event: MessageEvent<UploadWorkerRequest>) => {
  void processUpload(event.data);
});

async function processUpload(request: UploadWorkerRequest) {
  try {
    const bytes = new Uint8Array(request.bytes);
    const result = await readUpload(request.kind, request.fileName, bytes);
    const transferables: Transferable[] = 'raster' in result
      ? [result.raster.pixels.buffer, ...(result.raster.display ? [result.raster.display.pixels.buffer] : [])]
      : [];
    postMessage({ id: request.id, ok: true, ...result } satisfies UploadWorkerResponse, { transfer: transferables });
  } catch (error) {
    postMessage({ id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) } satisfies UploadWorkerResponse);
  }
}

async function readUpload(kind: UploadDataKind, fileName: string, bytes: Uint8Array) {
  if (kind === 'shapefile') {
    const geojson = normalizeGeoJson(await shp(await ensureShapefileTextEncoding(bytes)));
    const sourceCrs = await readShapefileCrs(bytes);
    return { geojson, sourceCrs };
  }

  if (kind === 'geojson') {
    const parsed = JSON.parse(decodeTextBytes(bytes)) as unknown;
    const sourceCrs = sourceCrsFromGeoJson(parsed);
    const geojson = normalizeGeoJson(parsed);
    return { geojson: await toWgs84(geojson, sourceCrs), sourceCrs };
  }

  if (kind === 'csv') {
    return readCsv(decodeTextBytes(bytes));
  }

  if (kind === 'geopackage') {
    await initGeoLibre();
    const sourceCrs = sourceCrsFromVectorInfo(bytes, 'geopackage');
    const geojson = normalizeGeoJson(JSON.parse(vector_to_geojson_reproject(bytes, 'geopackage', 4326, 0)));
    return { geojson, sourceCrs };
  }

  if (kind === 'geoparquet') {
    const fileBytes = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(fileBytes).set(bytes);
    const file = new File([fileBytes], fileName);
    return readGeoParquetFileWithMetadata(file);
  }

  return readGeoTiff(bytes);
}

async function readShapefileCrs(bytes: Uint8Array): Promise<SourceCrs> {
  const archive = await JSZip.loadAsync(bytes);
  const prjName = Object.keys(archive.files).find((name) => /\.prj$/i.test(name));

  if (!prjName) {
    return sourceCrsFromEpsg(4326, true);
  }

  const definition = await archive.files[prjName].async('text');
  return {
    ...sourceCrsFromDefinition(definition),
    name: 'Shapefile .prj',
  };
}

/**
 * shpjs 的 DBF 解析在没有 .cpg 时默认按 UTF-8 解码，国内 GBK 属性表会乱码。
 * 这里检测各 .dbf：若无法按严格 UTF-8 解码且缺少同名 .cpg，就往压缩包里补一个
 * 内容为 GBK 的 .cpg，让 shpjs 按正确编码解析。
 */
async function ensureShapefileTextEncoding(bytes: Uint8Array): Promise<Uint8Array> {
  const archive = await JSZip.loadAsync(bytes);
  const names = Object.keys(archive.files).filter((name) => !archive.files[name].dir);
  const cpgNames = new Set(names.map((name) => name.toLowerCase()).filter((name) => name.endsWith('.cpg')));
  let changed = false;

  for (const name of names) {
    if (!/\.dbf$/i.test(name) || cpgNames.has(`${name.slice(0, -4).toLowerCase()}.cpg`)) {
      continue;
    }

    const dbf = new Uint8Array(await archive.files[name].async('arraybuffer'));
    // 跳过 32 字节文件头（含二进制标志位），校验字段描述与记录区的文本字节
    if (isUtf8Compatible(dbf.subarray(32))) {
      continue;
    }

    archive.file(`${name.slice(0, -4)}.cpg`, 'GBK');
    changed = true;
  }

  return changed ? new Uint8Array(await archive.generateAsync({ type: 'uint8array' })) : bytes;
}

function sourceCrsFromVectorInfo(bytes: Uint8Array, format: string): SourceCrs {
  const info = JSON.parse(vector_info(bytes, format)) as { epsg?: number };
  return info.epsg ? sourceCrsFromEpsg(info.epsg) : sourceCrsFromEpsg(4326, true);
}

async function toWgs84(geojson: GeoJsonFeatureCollection, sourceCrs: SourceCrs): Promise<GeoJsonFeatureCollection> {
  if (!sourceCrs.epsg || sourceCrs.epsg === 4326) {
    if (!sourceCrs.assumed && sourceCrs.definition && !sourceCrs.epsg) {
      throw new Error('GeoJSON 的 CRS 定义无法识别为 EPSG，无法安全转换。');
    }

    return geojson;
  }

  await initGeoLibre();
  const positions: number[][] = [];
  geojson.features.forEach((feature) => collectGeometryPositions((feature as { geometry?: unknown }).geometry, positions));

  if (!positions.length) {
    return geojson;
  }

  const transformed = transform_points_epsg(sourceCrs.epsg, 4326, new Float64Array(positions.flatMap((position) => position.slice(0, 2))));
  let index = 0;

  return {
    type: 'FeatureCollection',
    features: geojson.features.map((feature) => ({
      ...(feature as Record<string, unknown>),
      geometry: transformGeometry((feature as { geometry?: unknown }).geometry, () => {
        const next = [transformed[index * 2], transformed[index * 2 + 1]];
        index += 1;
        return next;
      }),
    })),
  };
}

async function readGeoTiff(bytes: Uint8Array) {
  await initGeoLibre();
  const reader = new GeoTiffReader(bytes);
  const pixels = reader.read_band_f64(0);
  const epsg = reader.epsg;
  const geoTransform = Array.from(reader.geo_transform());
  const sourceCrs = epsg ? sourceCrsFromEpsg(epsg) : sourceCrsFromEpsg(4326, true);
  const corners = [
    pixelToMap(geoTransform, 0, 0),
    pixelToMap(geoTransform, reader.width, 0),
    pixelToMap(geoTransform, reader.width, reader.height),
    pixelToMap(geoTransform, 0, reader.height),
  ] as UploadRasterData['coordinates'];
  const coordinates = epsg && epsg !== 4326 ? transformCorners(corners, epsg) : corners;
  let min = Infinity;
  let max = -Infinity;

  for (const value of pixels) {
    if (!Number.isFinite(value) || value === reader.nodata) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error('GeoTIFF 没有有效像元。');
  }

  const display = epsg && epsg !== 4326
    ? reprojectRasterForDisplay(pixels, reader.width, reader.height, geoTransform, epsg, reader.nodata)
    : undefined;

  return {
    sourceCrs,
    raster: { width: reader.width, height: reader.height, epsg, geoTransform, nodata: reader.nodata, pixels, min, max, coordinates, display },
  };
}

function reprojectRasterForDisplay(
  sourcePixels: Float64Array,
  sourceWidth: number,
  sourceHeight: number,
  sourceGeoTransform: number[],
  sourceEpsg: number,
  nodata: number | undefined,
) {
  const sourceCorners = [
    pixelToMap(sourceGeoTransform, 0, 0),
    pixelToMap(sourceGeoTransform, sourceWidth, 0),
    pixelToMap(sourceGeoTransform, sourceWidth, sourceHeight),
    pixelToMap(sourceGeoTransform, 0, sourceHeight),
  ];
  const sourceBounds = [
    Math.min(...sourceCorners.map(([x]) => x)),
    Math.min(...sourceCorners.map(([, y]) => y)),
    Math.max(...sourceCorners.map(([x]) => x)),
    Math.max(...sourceCorners.map(([, y]) => y)),
  ];
  const displayBounds = Array.from(transform_bbox_epsg(sourceEpsg, 4326, new Float64Array(sourceBounds))) as [number, number, number, number];
  const [west, south, east, north] = displayBounds;
  const displayPixels = new Float64Array(sourceWidth * sourceHeight);
  const westX = webMercatorX(west);
  const eastX = webMercatorX(east);
  const southY = webMercatorY(south);
  const northY = webMercatorY(north);
  const determinant = sourceGeoTransform[1] * sourceGeoTransform[5] - sourceGeoTransform[2] * sourceGeoTransform[4];
  const invalidValue = nodata ?? NaN;

  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-15) {
    throw new Error('GeoTIFF 的 GeoTransform 无法求逆，不能重投影显示。');
  }

  const rowsPerChunk = Math.max(1, Math.floor(500_000 / sourceWidth));

  for (let rowStart = 0; rowStart < sourceHeight; rowStart += rowsPerChunk) {
    const rowEnd = Math.min(sourceHeight, rowStart + rowsPerChunk);
    const outputCoordinates = new Float64Array((rowEnd - rowStart) * sourceWidth * 2);

    for (let row = rowStart; row < rowEnd; row += 1) {
      const projectedY = northY - ((row + 0.5) / sourceHeight) * (northY - southY);
      for (let column = 0; column < sourceWidth; column += 1) {
        const index = ((row - rowStart) * sourceWidth + column) * 2;
        const projectedX = westX + ((column + 0.5) / sourceWidth) * (eastX - westX);
        outputCoordinates[index] = webMercatorLongitude(projectedX);
        outputCoordinates[index + 1] = webMercatorLatitude(projectedY);
      }
    }

    const sourceCoordinates = transform_points_epsg(4326, sourceEpsg, outputCoordinates);
    for (let index = 0; index < sourceCoordinates.length; index += 2) {
      const deltaX = sourceCoordinates[index] - sourceGeoTransform[0];
      const deltaY = sourceCoordinates[index + 1] - sourceGeoTransform[3];
      const column = Math.floor((sourceGeoTransform[5] * deltaX - sourceGeoTransform[2] * deltaY) / determinant);
      const sourceRow = Math.floor((-sourceGeoTransform[4] * deltaX + sourceGeoTransform[1] * deltaY) / determinant);
      const displayIndex = rowStart * sourceWidth + index / 2;
      displayPixels[displayIndex] = sourceRow >= 0 && sourceRow < sourceHeight && column >= 0 && column < sourceWidth
        ? sourcePixels[sourceRow * sourceWidth + column]
        : invalidValue;
    }
  }

  return {
    width: sourceWidth,
    height: sourceHeight,
    pixels: displayPixels,
    coordinates: [[west, north], [east, north], [east, south], [west, south]] as [[number, number], [number, number], [number, number], [number, number]],
  };
}

const WEB_MERCATOR_RADIUS = 6378137;
const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

function webMercatorX(longitude: number) {
  return WEB_MERCATOR_RADIUS * longitude * DEGREES_TO_RADIANS;
}

function webMercatorY(latitude: number) {
  const latitudeRadians = latitude * DEGREES_TO_RADIANS;
  return WEB_MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2));
}

function webMercatorLongitude(x: number) {
  return x / WEB_MERCATOR_RADIUS * RADIANS_TO_DEGREES;
}

function webMercatorLatitude(y: number) {
  return (2 * Math.atan(Math.exp(y / WEB_MERCATOR_RADIUS)) - Math.PI / 2) * RADIANS_TO_DEGREES;
}
function transformCorners(corners: UploadRasterData['coordinates'], epsg: number): UploadRasterData['coordinates'] {
  const transformed = transform_points_epsg(epsg, 4326, new Float64Array(corners.flat()));
  return [[transformed[0], transformed[1]], [transformed[2], transformed[3]], [transformed[4], transformed[5]], [transformed[6], transformed[7]]];
}

function pixelToMap(geoTransform: number[], column: number, row: number): [number, number] {
  return [
    geoTransform[0] + column * geoTransform[1] + row * geoTransform[2],
    geoTransform[3] + column * geoTransform[4] + row * geoTransform[5],
  ];
}

function collectGeometryPositions(geometry: unknown, positions: number[][]) {
  if (!isRecord(geometry)) return;
  if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    geometry.geometries.forEach((item) => collectGeometryPositions(item, positions));
    return;
  }
  collectPositions(geometry.coordinates, positions);
}

function collectPositions(value: unknown, positions: number[][]) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    positions.push(value as number[]);
    return;
  }
  value.forEach((item) => collectPositions(item, positions));
}

function transformGeometry(geometry: unknown, nextPosition: () => number[]): unknown {
  if (!isRecord(geometry)) return geometry;
  if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    return { ...geometry, geometries: geometry.geometries.map((item) => transformGeometry(item, nextPosition)) };
  }
  return { ...geometry, coordinates: transformPositions(geometry.coordinates, nextPosition) };
}

function transformPositions(value: unknown, nextPosition: () => number[]): unknown {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') return [...nextPosition(), ...value.slice(2)];
  return value.map((item) => transformPositions(item, nextPosition));
}

function normalizeGeoJson(data: unknown): GeoJsonFeatureCollection {
  if (Array.isArray(data)) return { type: 'FeatureCollection', features: data.flatMap((item) => isFeatureCollectionLike(item) ? item.features : []) };
  if (isFeatureCollectionLike(data)) return data;
  throw new Error('无法读取矢量数据。');
}

function isFeatureCollectionLike(value: unknown): value is GeoJsonFeatureCollection {
  return isRecord(value) && value.type === 'FeatureCollection' && Array.isArray(value.features);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

type CsvResult = { geojson: GeoJsonFeatureCollection; sourceCrs: SourceCrs };

function readCsv(text: string): CsvResult {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((row) => row.trim()).map((row) => row.split(/[;,\t]/).map((cell) => cell.trim()));
  const headers = rows.shift() ?? [];
  const xIndex = headers.findIndex((header) => /^(x|lon|lng|longitude)$/i.test(header));
  const yIndex = headers.findIndex((header) => /^(y|lat|latitude)$/i.test(header));
  if (xIndex < 0 || yIndex < 0) throw new Error('CSV 未找到经纬度字段。');
  const points = rows.map((row) => [Number(row[xIndex]), Number(row[yIndex])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const webMercator = points.some(([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 90);
  const features = points.map(([x, y], index) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: webMercator ? webMercatorToLonLat(x, y) : [x, y] }, properties: Object.fromEntries(headers.map((header, column) => [header || `field_${column + 1}`, rows[index]?.[column] ?? ''])) }));
  return { geojson: { type: 'FeatureCollection', features }, sourceCrs: sourceCrsFromEpsg(webMercator ? 3857 : 4326, !webMercator) };
}

function webMercatorToLonLat(x: number, y: number): [number, number] {
  return [x / 20037508.34 * 180, (Math.atan(Math.exp(y / 20037508.34 * Math.PI)) * 360 / Math.PI) - 90];
}
