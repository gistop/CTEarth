import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import initGeoLibre, {
  GeoTiffReader,
  transform_points_epsg,
  version as geolibreVersion,
} from 'geolibre-wasm';
import { initTools, runTool } from 'geolibre-wasm/tools';
import JSZip from 'jszip';
import shp from 'shpjs';

export type PointFeature = {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: Record<string, unknown>;
};

export type PointCollection = {
  type: 'FeatureCollection';
  features: PointFeature[];
};

export type RasterOverlay = {
  imageUrl: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  width: number;
  height: number;
  min: number;
  max: number;
  epsg?: number;
};

export type VectorOverlay = {
  name: string;
  geojson: {
    type: 'FeatureCollection';
    features: unknown[];
  };
};

export type IdwParameters = {
  field: string;
  outputName: string;
  cellSize: string;
  weight: string;
  radius: string;
  minPoints: string;
};

export type BufferParameters = {
  outputName: string;
  distance: string;
  quadrantSegments: string;
  capStyle: string;
  joinStyle: string;
  dissolve: boolean;
};

export type GisToolExecutionResult = {
  ok: boolean;
  status: 'success' | 'blocked' | 'failed';
  tool: 'idw_interpolation' | 'buffer_vector';
  message: string;
  qa: {
    passed: boolean;
    checks: string[];
  };
  output?: Record<string, unknown>;
};

export type LayerVisibilityId = 'basemap' | 'raster' | 'vectorOverlay';

export type LayerVisibility = Record<LayerVisibilityId, boolean>;

export type LayerOrderId = LayerVisibilityId | `uploaded:${string}`;

export type ShapefileInput = {
  inputName: string;
  files: Record<string, Uint8Array>;
};

export type UploadedLayer = {
  id: string;
  fileName: string;
  toolInput: ShapefileInput;
  geojson: {
    type: 'FeatureCollection';
    features: unknown[];
  };
  points: PointCollection;
  numericFields: string[];
  selectedField: string;
};

export type UploadedLayerStyle = {
  pointColor: string;
  pointRadius: number;
  pointOpacity: number;
  pointStrokeColor: string;
  pointStrokeWidth: number;
  lineColor: string;
  lineWidth: number;
  lineOpacity: number;
  fillColor: string;
  fillOpacity: number;
};

export type RasterLayerStyle = {
  opacity: number;
};

export type VectorOverlayStyle = {
  fillColor: string;
  fillOpacity: number;
  lineColor: string;
  lineWidth: number;
};

export type BasemapLayerStyle = {
  opacity: number;
};

type GisContextValue = {
  layer: UploadedLayer | null;
  layers: UploadedLayer[];
  activeLayerId: string | null;
  raster: RasterOverlay | null;
  vectorOverlay: VectorOverlay | null;
  basemapStyle: BasemapLayerStyle;
  rasterStyle: RasterLayerStyle;
  vectorOverlayStyle: VectorOverlayStyle;
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  layerVisibility: LayerVisibility;
  uploadedLayerVisibility: Record<string, boolean>;
  layerOrder: LayerOrderId[];
  toolsReady: boolean;
  isRunning: boolean;
  message: string;
  uploadShapefileZip: (file: File) => Promise<void>;
  uploadGeoJson: (file: File) => Promise<void>;
  setLayerVisibility: (id: LayerVisibilityId, visible: boolean) => void;
  setUploadedLayerVisibility: (id: string, visible: boolean) => void;
  setAllLayerVisibility: (visible: boolean) => void;
  setBasemapStyle: (patch: Partial<BasemapLayerStyle>) => void;
  setRasterStyle: (patch: Partial<RasterLayerStyle>) => void;
  setVectorOverlayStyle: (patch: Partial<VectorOverlayStyle>) => void;
  setUploadedLayerStyle: (id: string, patch: Partial<UploadedLayerStyle>) => void;
  moveLayerOrder: (draggedId: LayerOrderId, targetId: LayerOrderId) => void;
  setActiveLayer: (id: string) => void;
  setSelectedField: (field: string) => void;
  runIdwInterpolation: (params: IdwParameters) => Promise<void>;
  runBufferAnalysis: (params: BufferParameters) => Promise<void>;
};

const GisContext = createContext<GisContextValue | null>(null);
const defaultLayerVisibility: LayerVisibility = {
  basemap: true,
  raster: true,
  vectorOverlay: true,
};
const defaultLayerOrder: LayerOrderId[] = ['basemap'];
export const defaultUploadedLayerStyle: UploadedLayerStyle = {
  pointColor: '#f6c445',
  pointRadius: 6,
  pointOpacity: 1,
  pointStrokeColor: '#17202a',
  pointStrokeWidth: 1.5,
  lineColor: '#2f6da5',
  lineWidth: 2,
  lineOpacity: 1,
  fillColor: '#6b9bd2',
  fillOpacity: 0.22,
};
export const defaultRasterStyle: RasterLayerStyle = {
  opacity: 0.82,
};
export const defaultVectorOverlayStyle: VectorOverlayStyle = {
  fillColor: '#31a354',
  fillOpacity: 0.28,
  lineColor: '#16753b',
  lineWidth: 2,
};
export const defaultBasemapStyle: BasemapLayerStyle = {
  opacity: 1,
};

export function GisProvider({ children }: { children: React.ReactNode }) {
  const [layers, setLayers] = useState<UploadedLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [raster, setRaster] = useState<RasterOverlay | null>(null);
  const [vectorOverlay, setVectorOverlay] = useState<VectorOverlay | null>(null);
  const [basemapStyle, setBasemapStyleState] = useState<BasemapLayerStyle>(defaultBasemapStyle);
  const [rasterStyle, setRasterStyleState] = useState<RasterLayerStyle>(defaultRasterStyle);
  const [vectorOverlayStyle, setVectorOverlayStyleState] = useState<VectorOverlayStyle>(defaultVectorOverlayStyle);
  const [uploadedLayerStyles, setUploadedLayerStyles] = useState<Record<string, UploadedLayerStyle>>({});
  const [layerVisibility, setLayerVisibilityState] = useState<LayerVisibility>(defaultLayerVisibility);
  const [uploadedLayerVisibility, setUploadedLayerVisibilityState] = useState<Record<string, boolean>>({});
  const [layerOrder, setLayerOrder] = useState<LayerOrderId[]>(defaultLayerOrder);
  const [toolsReady, setToolsReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState('WASM 工具正在加载');

  const layer = useMemo(
    () => layers.find((item) => item.id === activeLayerId) ?? layers.at(-1) ?? null,
    [activeLayerId, layers],
  );

  const setLayerVisibility = useCallback((id: LayerVisibilityId, visible: boolean) => {
    setLayerVisibilityState((current) => ({ ...current, [id]: visible }));
  }, []);

  const setUploadedLayerVisibility = useCallback((id: string, visible: boolean) => {
    setUploadedLayerVisibilityState((current) => ({ ...current, [id]: visible }));
  }, []);

  const setAllLayerVisibility = useCallback((visible: boolean) => {
    setLayerVisibilityState({
      basemap: visible,
      raster: visible,
      vectorOverlay: visible,
    });
    setUploadedLayerVisibilityState((current) => (
      Object.fromEntries(Object.keys(current).map((id) => [id, visible]))
    ));
  }, []);

  const setBasemapStyle = useCallback((patch: Partial<BasemapLayerStyle>) => {
    setBasemapStyleState((current) => ({ ...current, ...patch }));
  }, []);

  const setRasterStyle = useCallback((patch: Partial<RasterLayerStyle>) => {
    setRasterStyleState((current) => ({ ...current, ...patch }));
  }, []);

  const setVectorOverlayStyle = useCallback((patch: Partial<VectorOverlayStyle>) => {
    setVectorOverlayStyleState((current) => ({ ...current, ...patch }));
  }, []);

  const setUploadedLayerStyle = useCallback((id: string, patch: Partial<UploadedLayerStyle>) => {
    setUploadedLayerStyles((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? defaultUploadedLayerStyle),
        ...patch,
      },
    }));
  }, []);

  const moveLayerOrder = useCallback((draggedId: LayerOrderId, targetId: LayerOrderId) => {
    if (draggedId === targetId) {
      return;
    }

    setLayerOrder((current) => {
      const withoutDragged = current.filter((id) => id !== draggedId);
      const targetIndex = withoutDragged.indexOf(targetId);

      if (targetIndex < 0) {
        return current;
      }

      return [
        ...withoutDragged.slice(0, targetIndex),
        draggedId,
        ...withoutDragged.slice(targetIndex),
      ];
    });
  }, []);

  const setActiveLayer = useCallback((id: string) => {
    setActiveLayerId(id);
  }, []);

  useEffect(() => {
    let active = true;

    Promise.all([initGeoLibre(), initTools()])
      .then(() => {
        if (!active) {
          return;
        }

        setToolsReady(true);
        setMessage(`GeoLibre WASM ${geolibreVersion()} 已就绪`);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setMessage(errorMessage(error));
      });

    return () => {
      active = false;
    };
  }, []);

  const uploadShapefileZip = useCallback(async (file: File) => {
    try {
      setMessage('正在读取 Shapefile 压缩包');
      setRaster(null);
      setVectorOverlay(null);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const shapefileInput = await zipToToolInput(bytes);
      const geojson = normalizeGeoJson(await shp(bytes));
      const points = geojson.features.filter(isPointFeature);
      const numericFields = getNumericFields(points);
      const nextLayer: UploadedLayer = {
        id: createLayerId(file.name),
        fileName: file.name,
        toolInput: shapefileInput,
        geojson,
        points: {
          type: 'FeatureCollection',
          features: points,
        },
        numericFields,
        selectedField: numericFields[0] ?? '',
      };

      setLayerVisibilityState((current) => ({
        ...current,
        raster: true,
        vectorOverlay: true,
      }));
      setUploadedLayerVisibilityState((current) => ({ ...current, [nextLayer.id]: true }));
      setUploadedLayerStyles((current) => ({ ...current, [nextLayer.id]: defaultUploadedLayerStyle }));
      setLayers((current) => [...current, nextLayer]);
      setLayerOrder((current) => [`uploaded:${nextLayer.id}`, ...current]);
      setActiveLayerId(nextLayer.id);
      setMessage(`已加载 ${geojson.features.length} 个要素：${file.name}`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, []);

  const uploadGeoJson = useCallback(async (file: File) => {
    try {
      setMessage('正在读取 GeoJSON');
      setRaster(null);
      setVectorOverlay(null);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder().decode(bytes);
      const geojson = normalizeGeoJson(JSON.parse(text));
      const points = geojson.features.filter(isPointFeature);
      const numericFields = getNumericFields(points);

      const inputName = ensureGeoJsonName(file.name || 'input.geojson');
      const nextLayer: UploadedLayer = {
        id: createLayerId(file.name),
        fileName: file.name,
        toolInput: {
          inputName,
          files: { [inputName]: bytes },
        },
        geojson,
        points: {
          type: 'FeatureCollection',
          features: points,
        },
        numericFields,
        selectedField: numericFields[0] ?? '',
      };

      setLayerVisibilityState((current) => ({
        ...current,
        raster: true,
        vectorOverlay: true,
      }));
      setUploadedLayerVisibilityState((current) => ({ ...current, [nextLayer.id]: true }));
      setUploadedLayerStyles((current) => ({ ...current, [nextLayer.id]: defaultUploadedLayerStyle }));
      setLayers((current) => [...current, nextLayer]);
      setLayerOrder((current) => [`uploaded:${nextLayer.id}`, ...current]);
      setActiveLayerId(nextLayer.id);
      setMessage(`已加载 ${geojson.features.length} 个 GeoJSON 要素：${file.name}`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, []);

  const setSelectedField = useCallback((field: string) => {
    setLayers((current) => current.map((item) => {
      if (item.id !== activeLayerId || !item.numericFields.includes(field)) {
        return item;
      }

      return { ...item, selectedField: field };
    }));
  }, [activeLayerId]);

  const runIdwInterpolation = useCallback(async (params: IdwParameters) => {
    if (!toolsReady) {
      setMessage('WASM 工具仍在加载，请稍后再运行。');
      return;
    }

    if (!layer) {
      setMessage('请先在左侧上传点 Shapefile 压缩包或点 GeoJSON。');
      return;
    }

    if (layer.points.features.length === 0) {
      setMessage('反距离加权插值需要点图层。');
      return;
    }

    if (layer.numericFields.length === 0) {
      setMessage('反距离加权插值需要至少一个数值字段。');
      return;
    }

    try {
      setIsRunning(true);
      setMessage('正在浏览器 WASM 中运行反距离加权插值');
      setRaster(null);

      const cellSize = positiveNumber(params.cellSize, '输出像元大小');
      const weight = positiveNumber(params.weight, '幂');
      const radius = nonNegativeNumber(params.radius || '0', '搜索半径');
      const minPoints = nonNegativeInteger(params.minPoints || '0', '点数');
      const outputName = ensureTifName(params.outputName || 'idw-interpolation.tif');
      const field = params.field || layer.selectedField;

      const result = await runTool('idw_interpolation', {
        args: [
          `--points=/work/${layer.toolInput.inputName}`,
          `--field_name=${field}`,
          `--output=/work/${outputName}`,
          `--cell_size=${cellSize}`,
          `--weight=${weight}`,
          `--radius=${radius}`,
          `--min_points=${minPoints}`,
          '--use_z=false',
        ],
        input: layer.toolInput.files,
      });

      if (result.exitCode !== 0) {
        throw new Error(result.stdout.join('\n') || `工具运行失败，退出码 ${result.exitCode}`);
      }

      const tiffBytes = result.files[outputName];

      if (!tiffBytes) {
        throw new Error(`没有获得 GeoTIFF 输出。工具输出：${result.stdout.join('\n')}`);
      }

      const nextRaster = readRasterOverlay(tiffBytes);
      setRaster(nextRaster);
      setLayerVisibilityState((current) => ({ ...current, raster: true }));
      setLayerOrder((current) => ['raster', ...current.filter((id) => id !== 'raster')]);
      setLayers((current) => current.map((item) => (
        item.id === layer.id ? { ...item, selectedField: field } : item
      )));
      setMessage(`插值完成：${nextRaster.width} x ${nextRaster.height}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }, [layer, toolsReady]);

  const runBufferAnalysis = useCallback(async (params: BufferParameters) => {
    if (!toolsReady) {
      setMessage('WASM 工具仍在加载，请稍后再运行。');
      return;
    }

    if (!layer) {
      setMessage('请先在左侧上传 Shapefile 压缩包或 GeoJSON。');
      return;
    }

    try {
      setIsRunning(true);
      setMessage('正在浏览器 WASM 中运行缓冲区分析');
      setVectorOverlay(null);

      const distance = positiveNumber(params.distance, '缓冲距离');
      const quadrantSegments = positiveInteger(params.quadrantSegments || '8', '圆弧段数');
      const outputName = ensureGeoJsonName(params.outputName || 'buffer.geojson');

      const result = await runTool('buffer_vector', {
        args: [
          `--input=/work/${layer.toolInput.inputName}`,
          `--output=/work/${outputName}`,
          `--distance=${distance}`,
          `--quadrant_segments=${quadrantSegments}`,
          `--cap_style=${params.capStyle || 'round'}`,
          `--join_style=${params.joinStyle || 'round'}`,
          `--dissolve=${params.dissolve}`,
        ],
        input: layer.toolInput.files,
      });

      if (result.exitCode !== 0) {
        throw new Error(result.stdout.join('\n') || `工具运行失败，退出码 ${result.exitCode}`);
      }

      const outputBytes = result.files[outputName];

      if (!outputBytes) {
        throw new Error(`没有获得缓冲区输出。工具输出：${result.stdout.join('\n')}`);
      }

      const geojson = JSON.parse(new TextDecoder().decode(outputBytes));

      if (!isFeatureCollectionLike(geojson)) {
        throw new Error('缓冲区输出不是有效的 GeoJSON FeatureCollection。');
      }

      setVectorOverlay({ name: outputName, geojson });
      setLayerVisibilityState((current) => ({ ...current, vectorOverlay: true }));
      setLayerOrder((current) => ['vectorOverlay', ...current.filter((id) => id !== 'vectorOverlay')]);
      setMessage(`缓冲区完成：${geojson.features.length} 个面要素`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }, [layer, toolsReady]);

  const value = useMemo<GisContextValue>(() => ({
    layer,
    layers,
    activeLayerId,
    raster,
    vectorOverlay,
    basemapStyle,
    rasterStyle,
    vectorOverlayStyle,
    uploadedLayerStyles,
    layerVisibility,
    uploadedLayerVisibility,
    layerOrder,
    toolsReady,
    isRunning,
    message,
    uploadShapefileZip,
    uploadGeoJson,
    setLayerVisibility,
    setUploadedLayerVisibility,
    setAllLayerVisibility,
    setBasemapStyle,
    setRasterStyle,
    setVectorOverlayStyle,
    setUploadedLayerStyle,
    moveLayerOrder,
    setActiveLayer,
    setSelectedField,
    runIdwInterpolation,
    runBufferAnalysis,
  }), [activeLayerId, basemapStyle, isRunning, layer, layerOrder, layerVisibility, layers, message, moveLayerOrder, raster, rasterStyle, runBufferAnalysis, runIdwInterpolation, setActiveLayer, setAllLayerVisibility, setBasemapStyle, setLayerVisibility, setRasterStyle, setSelectedField, setUploadedLayerStyle, setUploadedLayerVisibility, setVectorOverlayStyle, toolsReady, uploadGeoJson, uploadedLayerStyles, uploadedLayerVisibility, uploadShapefileZip, vectorOverlay, vectorOverlayStyle]);

  return <GisContext.Provider value={value}>{children}</GisContext.Provider>;
}

export function useGis() {
  const value = useContext(GisContext);

  if (!value) {
    throw new Error('useGis must be used inside GisProvider');
  }

  return value;
}

export function getPointBounds(points: PointFeature[]) {
  return points.reduce(
    (bounds, feature) => {
      const [lon, lat] = feature.geometry.coordinates;
      return [
        Math.min(bounds[0], lon),
        Math.min(bounds[1], lat),
        Math.max(bounds[2], lon),
        Math.max(bounds[3], lat),
      ] as [number, number, number, number];
    },
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );
}

function readRasterOverlay(tiffBytes: Uint8Array): RasterOverlay {
  const reader = new GeoTiffReader(tiffBytes);
  const pixels = reader.read_band_f64(0);
  const nodata = reader.nodata;
  let min = Infinity;
  let max = -Infinity;

  for (const value of pixels) {
    if (!Number.isFinite(value) || value === nodata) {
      continue;
    }

    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error('插值输出没有有效像元。');
  }

  const raster = {
    width: reader.width,
    height: reader.height,
    epsg: reader.epsg,
    nodata,
    geoTransform: Array.from(reader.geo_transform()),
    pixels,
    min,
    max,
  };

  return {
    imageUrl: rasterToCanvas(raster).toDataURL('image/png'),
    coordinates: rasterCoordinates4326(raster),
    width: raster.width,
    height: raster.height,
    min: raster.min,
    max: raster.max,
    epsg: raster.epsg,
  };
}

function rasterToCanvas(raster: {
  width: number;
  height: number;
  nodata?: number;
  pixels: Float64Array;
  min: number;
  max: number;
}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('无法创建栅格渲染画布。');
  }

  canvas.width = raster.width;
  canvas.height = raster.height;

  const image = context.createImageData(raster.width, raster.height);

  for (let index = 0; index < raster.pixels.length; index += 1) {
    const value = raster.pixels[index];

    if (!Number.isFinite(value) || (raster.nodata !== undefined && value === raster.nodata)) {
      image.data[index * 4 + 3] = 0;
      continue;
    }

    const color = colorRamp((value - raster.min) / Math.max(raster.max - raster.min, 1e-12));
    image.data[index * 4] = color[0];
    image.data[index * 4 + 1] = color[1];
    image.data[index * 4 + 2] = color[2];
    image.data[index * 4 + 3] = 188;
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

function rasterCoordinates4326(raster: {
  width: number;
  height: number;
  epsg?: number;
  geoTransform: number[];
}): RasterOverlay['coordinates'] {
  const corners = [
    pixelToMap(raster.geoTransform, 0, 0),
    pixelToMap(raster.geoTransform, raster.width, 0),
    pixelToMap(raster.geoTransform, raster.width, raster.height),
    pixelToMap(raster.geoTransform, 0, raster.height),
  ] as RasterOverlay['coordinates'];

  if (!raster.epsg || raster.epsg === 4326) {
    return corners;
  }

  const transformed = transform_points_epsg(raster.epsg, 4326, new Float64Array(corners.flat()));

  return [
    [transformed[0], transformed[1]],
    [transformed[2], transformed[3]],
    [transformed[4], transformed[5]],
    [transformed[6], transformed[7]],
  ];
}

function pixelToMap(gt: number[], col: number, row: number): [number, number] {
  return [gt[0] + col * gt[1] + row * gt[2], gt[3] + col * gt[4] + row * gt[5]];
}

async function zipToToolInput(zipBytes: Uint8Array): Promise<ShapefileInput> {
  const zip = await JSZip.loadAsync(zipBytes);
  const input: Record<string, Uint8Array> = {};
  const shpEntries: string[] = [];

  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) {
      continue;
    }

    const name = basename(entryPath);
    const extension = extensionOf(name);

    if (!['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(extension)) {
      continue;
    }

    input[name] = new Uint8Array(await entry.async('arraybuffer'));

    if (extension === 'shp') {
      shpEntries.push(name);
    }
  }

  if (shpEntries.length === 0) {
    throw new Error('压缩包中没有 .shp 文件。');
  }

  if (shpEntries.length > 1) {
    throw new Error('压缩包中包含多个 .shp 文件，请每次只上传一个图层。');
  }

  const base = shpEntries[0].replace(/\.shp$/i, '');

  for (const required of ['shp', 'shx', 'dbf']) {
    if (!input[`${base}.${required}`]) {
      throw new Error(`压缩包中缺少 ${base}.${required}。`);
    }
  }

  return { inputName: `${base}.shp`, files: input };
}

function normalizeGeoJson(data: unknown): { type: 'FeatureCollection'; features: unknown[] } {
  if (Array.isArray(data)) {
    return {
      type: 'FeatureCollection',
      features: data.flatMap((item) => (
        isFeatureCollectionLike(item) ? item.features : []
      )),
    };
  }

  if (isFeatureCollectionLike(data)) {
    return data;
  }

  throw new Error('无法读取 Shapefile 压缩包。');
}

function isFeatureCollectionLike(value: unknown): value is { type: 'FeatureCollection'; features: unknown[] } {
  return isRecord(value) && value.type === 'FeatureCollection' && Array.isArray(value.features);
}

function isPointFeature(value: unknown): value is PointFeature {
  if (!isRecord(value) || value.type !== 'Feature' || !isRecord(value.geometry)) {
    return false;
  }

  const coordinates = value.geometry.coordinates;

  return (
    value.geometry.type === 'Point'
    && Array.isArray(coordinates)
    && coordinates.length >= 2
    && Number.isFinite(Number(coordinates[0]))
    && Number.isFinite(Number(coordinates[1]))
  );
}

function getNumericFields(features: PointFeature[]) {
  const fields = new Set<string>();

  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
      if (Number.isFinite(Number(value))) {
        fields.add(key);
      }
    }
  }

  return [...fields].sort();
}

function colorRamp(t: number) {
  const stops = [
    [41, 98, 168],
    [34, 168, 132],
    [248, 224, 88],
    [214, 76, 54],
  ];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;

  return stops[index].map((value, channel) => (
    Math.round(value + (stops[index + 1][channel] - value) * local)
  ));
}

function basename(value: string) {
  return value.replace(/\\/g, '/').split('/').pop() ?? value;
}

function createLayerId(fileName: string) {
  const safeName = fileName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'layer';
  return `${safeName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function extensionOf(value: string) {
  const match = /\.([^.]+)$/.exec(value);
  return match ? match[1].toLowerCase() : '';
}

function ensureTifName(value: string) {
  return /\.tiff?$/i.test(value) ? value : `${value}.tif`;
}

function ensureGeoJsonName(value: string) {
  return /\.geojson$/i.test(value) ? value : `${value}.geojson`;
}

function positiveNumber(value: string, name: string) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name}必须大于 0。`);
  }

  return number;
}

function positiveInteger(value: string, name: string) {
  const number = positiveNumber(value, name);

  if (!Number.isInteger(number)) {
    throw new Error(`${name}必须是整数。`);
  }

  return number;
}

function nonNegativeNumber(value: string, name: string) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${name}不能小于 0。`);
  }

  return number;
}

function nonNegativeInteger(value: string, name: string) {
  const number = nonNegativeNumber(value, name);

  if (!Number.isInteger(number)) {
    throw new Error(`${name}必须是整数。`);
  }

  return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
