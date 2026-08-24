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
  name: string;
  toolInput: RasterToolInput;
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

export type TerrainToolId = 'hillshade' | 'slope' | 'aspect';

export type SlopeUnits = 'degrees' | 'radians' | 'percent';

export type TerrainParameters = {
  outputName: string;
  zFactor: string;
  altitude: string;
  azimuth: string;
  units: SlopeUnits;
};

export type SelectionMode = 'new' | 'add' | 'remove' | 'subset';

export type SelectByValueOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'greaterOrEqual'
  | 'lessThan'
  | 'lessOrEqual'
  | 'isEmpty'
  | 'isNotEmpty';

export type SelectByValueParameters = {
  layerId?: string;
  field: string;
  operator: SelectByValueOperator;
  value: string;
  caseSensitive: boolean;
  selectionMode: SelectionMode;
};

export type SelectByLocationRelation = 'intersects' | 'within' | 'contains' | 'disjoint';

export type SelectByLocationParameters = {
  targetLayerId?: string;
  referenceLayerId: string;
  relation: SelectByLocationRelation;
  selectionMode: SelectionMode;
};

export type SelectionResult = {
  layerId: string;
  layerName: string;
  matchedCount: number;
  selectedCount: number;
  totalCount: number;
};

export type GisToolExecutionResult = {
  ok: boolean;
  status: 'success' | 'blocked' | 'failed';
  tool: 'idw_interpolation' | 'buffer_vector' | 'select_by_value' | 'select_by_location';
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

export type RasterToolInput = {
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
  fields: string[];
  numericFields: string[];
  selectedField: string;
  selectedFeatureIndexes: number[];
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
  uploadGeoTiff: (file: File) => Promise<void>;
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
  setLayerSelection: (layerId: string, indexes: number[]) => void;
  clearSelection: (layerId?: string) => void;
  selectByValue: (params: SelectByValueParameters) => Promise<SelectionResult | null>;
  selectByLocation: (params: SelectByLocationParameters) => Promise<SelectionResult | null>;
  runIdwInterpolation: (params: IdwParameters) => Promise<void>;
  runBufferAnalysis: (params: BufferParameters) => Promise<void>;
  runTerrainAnalysis: (tool: TerrainToolId, params: TerrainParameters) => Promise<void>;
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
      const fields = getFields(geojson.features);
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
        fields,
        numericFields,
        selectedField: numericFields[0] ?? '',
        selectedFeatureIndexes: [],
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
      const fields = getFields(geojson.features);
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
        fields,
        numericFields,
        selectedField: numericFields[0] ?? '',
        selectedFeatureIndexes: [],
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

  const uploadGeoTiff = useCallback(async (file: File) => {
    try {
      setMessage('正在读取 GeoTIFF');
      setVectorOverlay(null);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const inputName = file.name || 'raster.tif';
      const nextRaster = readRasterOverlay(bytes, inputName, inputName);

      setRaster(nextRaster);
      setLayerVisibilityState((current) => ({
        ...current,
        raster: true,
        vectorOverlay: true,
      }));
      setLayerOrder((current) => ['raster', ...current.filter((id) => id !== 'raster')]);
      setMessage(`已加载 GeoTIFF：${file.name}（${nextRaster.width} x ${nextRaster.height}）`);
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

  const setLayerSelection = useCallback((layerId: string, indexes: number[]) => {
    const selectedFeatureIndexes = [...new Set(indexes)]
      .filter((index) => Number.isInteger(index) && index >= 0)
      .sort((left, right) => left - right);

    setLayers((current) => current.map((item) => (
      item.id === layerId ? { ...item, selectedFeatureIndexes } : item
    )));
    setActiveLayerId(layerId);
  }, []);

  const clearSelection = useCallback((layerId?: string) => {
    const targetId = layerId ?? layer?.id;

    if (!targetId) {
      setMessage('没有可清除选择的活动图层。');
      return;
    }

    setLayers((current) => current.map((item) => (
      item.id === targetId ? { ...item, selectedFeatureIndexes: [] } : item
    )));
    setMessage('已清除选择集。');
  }, [layer]);

  const selectByValue = useCallback(async (params: SelectByValueParameters): Promise<SelectionResult | null> => {
    const targetLayer = findLayer(layers, params.layerId) ?? layer;

    if (!targetLayer) {
      setMessage('请先上传或选择一个矢量图层。');
      return null;
    }

    if (!params.field || !targetLayer.fields.includes(params.field)) {
      setMessage('请选择当前图层中的属性字段。');
      return null;
    }

    const matchedIndexes = targetLayer.geojson.features.flatMap((feature, index) => (
      matchesValue(feature, params) ? [index] : []
    ));
    const selectedFeatureIndexes = applySelectionMode(
      targetLayer.selectedFeatureIndexes,
      matchedIndexes,
      params.selectionMode,
    );
    const result: SelectionResult = {
      layerId: targetLayer.id,
      layerName: targetLayer.fileName,
      matchedCount: matchedIndexes.length,
      selectedCount: selectedFeatureIndexes.length,
      totalCount: targetLayer.geojson.features.length,
    };

    setLayers((current) => current.map((item) => (
      item.id === targetLayer.id ? { ...item, selectedFeatureIndexes } : item
    )));
    setActiveLayerId(targetLayer.id);
    setMessage(`按属性选择完成：命中 ${result.matchedCount} 个，当前选择 ${result.selectedCount} 个。`);

    return result;
  }, [layer, layers]);

  const selectByLocation = useCallback(async (params: SelectByLocationParameters): Promise<SelectionResult | null> => {
    const targetLayer = findLayer(layers, params.targetLayerId) ?? layer;
    const referenceLayer = findSpatialReference(layers, vectorOverlay, params.referenceLayerId);

    if (!targetLayer) {
      setMessage('请先上传或选择目标图层。');
      return null;
    }

    if (!referenceLayer) {
      setMessage('请选择一个参考图层或先运行缓冲区等空间分析工具。');
      return null;
    }

    const matchedIndexes = targetLayer.geojson.features.flatMap((feature, index) => (
      matchesLocation(feature, referenceLayer.geojson.features, params.relation) ? [index] : []
    ));
    const selectedFeatureIndexes = applySelectionMode(
      targetLayer.selectedFeatureIndexes,
      matchedIndexes,
      params.selectionMode,
    );
    const result: SelectionResult = {
      layerId: targetLayer.id,
      layerName: targetLayer.fileName,
      matchedCount: matchedIndexes.length,
      selectedCount: selectedFeatureIndexes.length,
      totalCount: targetLayer.geojson.features.length,
    };

    setLayers((current) => current.map((item) => (
      item.id === targetLayer.id ? { ...item, selectedFeatureIndexes } : item
    )));
    setActiveLayerId(targetLayer.id);
    setMessage(`按位置选择完成：命中 ${result.matchedCount} 个，当前选择 ${result.selectedCount} 个。`);

    return result;
  }, [layer, layers, vectorOverlay]);

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

      const nextRaster = readRasterOverlay(tiffBytes, outputName);
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

  const runTerrainAnalysis = useCallback(async (tool: TerrainToolId, params: TerrainParameters) => {
    if (!toolsReady) {
      setMessage('WASM 工具仍在加载，请稍后再运行。');
      return;
    }

    if (!raster) {
      setMessage('请先添加一个 DEM GeoTIFF，或先生成一个栅格结果。');
      return;
    }

    try {
      setIsRunning(true);
      setMessage(`正在浏览器 WASM 中运行${terrainToolLabel(tool)}`);

      const outputName = ensureTifName(params.outputName || `${tool}.tif`);
      const args = [
        `--input=/work/${raster.toolInput.inputName}`,
        `--output=/work/${outputName}`,
      ];
      const zFactor = positiveNumber(params.zFactor || '1', 'Z 因子');

      args.push(`--z_factor=${zFactor}`);

      if (tool === 'hillshade') {
        args.push(`--altitude=${boundedNumber(params.altitude || '45', '太阳高度角', 0, 90)}`);
        args.push(`--azimuth=${boundedNumber(params.azimuth || '315', '太阳方位角', 0, 360)}`);
      }

      if (tool === 'slope') {
        args.push(`--units=${params.units || 'degrees'}`);
      }

      const result = await runTool(tool, {
        args,
        input: raster.toolInput.files,
      });

      if (result.exitCode !== 0) {
        throw new Error(result.stdout.join('\n') || `工具运行失败，退出码 ${result.exitCode}`);
      }

      const outputBytes = result.files[outputName];

      if (!outputBytes) {
        throw new Error(`没有获得${terrainToolLabel(tool)}输出。工具输出：${result.stdout.join('\n')}`);
      }

      const nextRaster = readRasterOverlay(outputBytes, outputName, outputName);
      setRaster(nextRaster);
      setLayerVisibilityState((current) => ({ ...current, raster: true }));
      setLayerOrder((current) => ['raster', ...current.filter((id) => id !== 'raster')]);
      setMessage(`${terrainToolLabel(tool)}完成：${nextRaster.width} x ${nextRaster.height}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }, [raster, toolsReady]);

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
    uploadGeoTiff,
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
    setLayerSelection,
    clearSelection,
    selectByValue,
    selectByLocation,
    runIdwInterpolation,
    runBufferAnalysis,
    runTerrainAnalysis,
  }), [activeLayerId, basemapStyle, clearSelection, isRunning, layer, layerOrder, layerVisibility, layers, message, moveLayerOrder, raster, rasterStyle, runBufferAnalysis, runIdwInterpolation, runTerrainAnalysis, selectByLocation, selectByValue, setActiveLayer, setAllLayerVisibility, setBasemapStyle, setLayerSelection, setLayerVisibility, setRasterStyle, setSelectedField, setUploadedLayerStyle, setUploadedLayerVisibility, setVectorOverlayStyle, toolsReady, uploadGeoJson, uploadGeoTiff, uploadedLayerStyles, uploadedLayerVisibility, uploadShapefileZip, vectorOverlay, vectorOverlayStyle]);

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

function readRasterOverlay(tiffBytes: Uint8Array, name: string, inputName = name): RasterOverlay {
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
    throw new Error('GeoTIFF 没有有效像元。');
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
    name,
    toolInput: {
      inputName,
      files: { [inputName]: tiffBytes },
    },
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

function getFields(features: unknown[]) {
  const fields = new Set<string>();

  for (const feature of features) {
    const properties = isRecord(feature) && isRecord(feature.properties) ? feature.properties : {};

    Object.keys(properties).forEach((key) => fields.add(key));
  }

  return [...fields].sort();
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

function findLayer(layers: UploadedLayer[], layerId?: string) {
  return layerId ? layers.find((item) => item.id === layerId) ?? null : null;
}

function findSpatialReference(
  layers: UploadedLayer[],
  vectorOverlay: VectorOverlay | null,
  referenceLayerId: string,
): { id: string; name: string; geojson: { type: 'FeatureCollection'; features: unknown[] } } | null {
  if (!referenceLayerId) {
    return null;
  }

  if (referenceLayerId === 'vectorOverlay' && vectorOverlay) {
    return { id: 'vectorOverlay', name: vectorOverlay.name, geojson: vectorOverlay.geojson };
  }

  const layer = layers.find((item) => item.id === referenceLayerId);

  return layer ? { id: layer.id, name: layer.fileName, geojson: layer.geojson } : null;
}

function applySelectionMode(currentIndexes: number[], matchedIndexes: number[], mode: SelectionMode) {
  const current = new Set(currentIndexes);
  const matched = new Set(matchedIndexes);
  let next: Set<number>;

  if (mode === 'add') {
    next = new Set([...current, ...matched]);
  } else if (mode === 'remove') {
    next = new Set([...current].filter((index) => !matched.has(index)));
  } else if (mode === 'subset') {
    next = new Set([...current].filter((index) => matched.has(index)));
  } else {
    next = matched;
  }

  return [...next].sort((left, right) => left - right);
}

function matchesValue(feature: unknown, params: SelectByValueParameters) {
  const properties = isRecord(feature) && isRecord(feature.properties) ? feature.properties : {};
  const featureValue = properties[params.field];

  if (params.operator === 'isEmpty') {
    return featureValue === undefined || featureValue === null || String(featureValue).trim() === '';
  }

  if (params.operator === 'isNotEmpty') {
    return featureValue !== undefined && featureValue !== null && String(featureValue).trim() !== '';
  }

  const expected = params.value ?? '';

  if (['greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual'].includes(params.operator)) {
    const left = Number(featureValue);
    const right = Number(expected);

    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return false;
    }

    if (params.operator === 'greaterThan') {
      return left > right;
    }

    if (params.operator === 'greaterOrEqual') {
      return left >= right;
    }

    if (params.operator === 'lessThan') {
      return left < right;
    }

    return left <= right;
  }

  const left = normalizeComparable(featureValue, params.caseSensitive);
  const right = normalizeComparable(expected, params.caseSensitive);

  if (params.operator === 'equals') {
    return left === right;
  }

  if (params.operator === 'notEquals') {
    return left !== right;
  }

  if (params.operator === 'startsWith') {
    return left.startsWith(right);
  }

  if (params.operator === 'endsWith') {
    return left.endsWith(right);
  }

  return left.includes(right);
}

function normalizeComparable(value: unknown, caseSensitive: boolean) {
  const text = value === undefined || value === null ? '' : String(value);

  return caseSensitive ? text : text.toLocaleLowerCase();
}

function matchesLocation(feature: unknown, referenceFeatures: unknown[], relation: SelectByLocationRelation) {
  const geometry = featureGeometry(feature);

  if (!geometry) {
    return relation === 'disjoint';
  }

  const relationMatches = (referenceFeature: unknown) => {
    const referenceGeometry = featureGeometry(referenceFeature);

    if (!referenceGeometry) {
      return false;
    }

    if (relation === 'within') {
      return geometryWithin(geometry, referenceGeometry);
    }

    if (relation === 'contains') {
      return geometryWithin(referenceGeometry, geometry);
    }

    const intersects = geometryIntersects(geometry, referenceGeometry);

    return relation === 'disjoint' ? !intersects : intersects;
  };

  if (relation === 'disjoint') {
    return referenceFeatures.every(relationMatches);
  }

  return referenceFeatures.some(relationMatches);
}

function featureGeometry(feature: unknown) {
  if (!isRecord(feature) || !isRecord(feature.geometry) || !('type' in feature.geometry)) {
    return null;
  }

  return feature.geometry as { type: string; coordinates?: unknown; geometries?: unknown[] };
}

function geometryWithin(
  geometry: { type: string; coordinates?: unknown; geometries?: unknown[] },
  container: { type: string; coordinates?: unknown; geometries?: unknown[] },
) {
  const geometryBounds = geometryBbox(geometry);
  const containerBounds = geometryBbox(container);

  if (!geometryBounds || !containerBounds || !bboxContains(containerBounds, geometryBounds)) {
    return false;
  }

  if (isPolygonGeometry(container)) {
    const points = geometryPoints(geometry);

    return points.length > 0 && points.every((point) => pointInPolygonGeometry(point, container));
  }

  return geometryIntersects(geometry, container);
}

function geometryIntersects(
  left: { type: string; coordinates?: unknown; geometries?: unknown[] },
  right: { type: string; coordinates?: unknown; geometries?: unknown[] },
): boolean {
  if (left.type === 'GeometryCollection') {
    return (left.geometries ?? []).some((geometry) => (
      isRecord(geometry) && geometryIntersects(geometry as { type: string; coordinates?: unknown; geometries?: unknown[] }, right)
    ));
  }

  if (right.type === 'GeometryCollection') {
    return (right.geometries ?? []).some((geometry) => (
      isRecord(geometry) && geometryIntersects(left, geometry as { type: string; coordinates?: unknown; geometries?: unknown[] })
    ));
  }

  const leftBounds = geometryBbox(left);
  const rightBounds = geometryBbox(right);

  if (!leftBounds || !rightBounds || !bboxIntersects(leftBounds, rightBounds)) {
    return false;
  }

  const leftPoints = geometryPoints(left);
  const rightPoints = geometryPoints(right);

  if (isPointGeometry(left) && isPointGeometry(right)) {
    return leftPoints.some((leftPoint) => rightPoints.some((rightPoint) => samePoint(leftPoint, rightPoint)));
  }

  if (isPolygonGeometry(left) && rightPoints.some((point) => pointInPolygonGeometry(point, left))) {
    return true;
  }

  if (isPolygonGeometry(right) && leftPoints.some((point) => pointInPolygonGeometry(point, right))) {
    return true;
  }

  const leftSegments = geometrySegments(left);
  const rightSegments = geometrySegments(right);

  if (leftSegments.some((leftSegment) => rightSegments.some((rightSegment) => segmentsIntersect(leftSegment, rightSegment)))) {
    return true;
  }

  if (isPointGeometry(left)) {
    return leftPoints.some((point) => rightSegments.some((segment) => pointOnSegment(point, segment)));
  }

  if (isPointGeometry(right)) {
    return rightPoints.some((point) => leftSegments.some((segment) => pointOnSegment(point, segment)));
  }

  return bboxIntersects(leftBounds, rightBounds);
}

function isPointGeometry(geometry: { type: string }) {
  return geometry.type === 'Point' || geometry.type === 'MultiPoint';
}

function isPolygonGeometry(geometry: { type: string }) {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}

function geometryBbox(geometry: { coordinates?: unknown; geometries?: unknown[] }): [number, number, number, number] | null {
  const points = geometryPoints(geometry);

  if (points.length === 0) {
    return null;
  }

  return points.reduce(
    (bounds, [x, y]) => [
      Math.min(bounds[0], x),
      Math.min(bounds[1], y),
      Math.max(bounds[2], x),
      Math.max(bounds[3], y),
    ] as [number, number, number, number],
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );
}

function geometryPoints(geometry: { coordinates?: unknown; geometries?: unknown[] }) {
  const points: [number, number][] = [];

  collectPoints(geometry.coordinates, points);
  (geometry.geometries ?? []).forEach((item) => {
    if (isRecord(item)) {
      collectPoints(item.coordinates, points);
    }
  });

  return points;
}

function collectPoints(value: unknown, points: [number, number][]) {
  if (!Array.isArray(value)) {
    return;
  }

  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    points.push([Number(value[0]), Number(value[1])]);
    return;
  }

  value.forEach((item) => collectPoints(item, points));
}

function geometrySegments(geometry: { type: string; coordinates?: unknown; geometries?: unknown[] }) {
  const segments: [[number, number], [number, number]][] = [];

  collectSegments(geometry.type, geometry.coordinates, segments);
  (geometry.geometries ?? []).forEach((item) => {
    if (isRecord(item) && typeof item.type === 'string') {
      collectSegments(item.type, item.coordinates, segments);
    }
  });

  return segments;
}

function collectSegments(type: string, coordinates: unknown, segments: [[number, number], [number, number]][]) {
  if (!Array.isArray(coordinates)) {
    return;
  }

  if (type === 'LineString') {
    addSegmentsFromPath(coordinates, segments);
    return;
  }

  if (type === 'MultiLineString' || type === 'Polygon') {
    coordinates.forEach((path) => addSegmentsFromPath(path, segments));
    return;
  }

  if (type === 'MultiPolygon') {
    coordinates.forEach((polygon) => {
      if (Array.isArray(polygon)) {
        polygon.forEach((ring) => addSegmentsFromPath(ring, segments));
      }
    });
  }
}

function addSegmentsFromPath(path: unknown, segments: [[number, number], [number, number]][]) {
  if (!Array.isArray(path)) {
    return;
  }

  const points = path
    .filter((point): point is unknown[] => Array.isArray(point))
    .map((point) => [Number(point[0]), Number(point[1])] as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

  for (let index = 1; index < points.length; index += 1) {
    segments.push([points[index - 1], points[index]]);
  }
}

function pointInPolygonGeometry(point: [number, number], geometry: { type: string; coordinates?: unknown }) {
  if (geometry.type === 'Polygon') {
    return pointInPolygonCoordinates(point, geometry.coordinates);
  }

  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.some((polygon) => pointInPolygonCoordinates(point, polygon));
  }

  return false;
}

function pointInPolygonCoordinates(point: [number, number], polygon: unknown) {
  if (!Array.isArray(polygon)) {
    return false;
  }

  const rings = polygon.filter(Array.isArray);
  const outerRing = rings[0];

  if (!outerRing || !pointInRing(point, outerRing)) {
    return false;
  }

  return !rings.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInRing(point: [number, number], ring: unknown[]) {
  let inside = false;
  const [x, y] = point;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const current = coordinatePair(ring[i]);
    const previous = coordinatePair(ring[j]);

    if (!current || !previous) {
      continue;
    }

    if (pointOnSegment(point, [previous, current])) {
      return true;
    }

    const intersects = ((current[1] > y) !== (previous[1] > y))
      && x < ((previous[0] - current[0]) * (y - current[1])) / (previous[1] - current[1]) + current[0];

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function coordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const point: [number, number] = [Number(value[0]), Number(value[1])];

  return Number.isFinite(point[0]) && Number.isFinite(point[1]) ? point : null;
}

function bboxIntersects(left: [number, number, number, number], right: [number, number, number, number]) {
  return left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1];
}

function bboxContains(container: [number, number, number, number], inner: [number, number, number, number]) {
  return container[0] <= inner[0] && container[1] <= inner[1] && container[2] >= inner[2] && container[3] >= inner[3];
}

function samePoint(left: [number, number], right: [number, number]) {
  return Math.abs(left[0] - right[0]) <= 1e-10 && Math.abs(left[1] - right[1]) <= 1e-10;
}

function pointOnSegment(point: [number, number], segment: [[number, number], [number, number]]) {
  const [[x1, y1], [x2, y2]] = segment;
  const [x, y] = point;
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);

  if (Math.abs(cross) > 1e-10) {
    return false;
  }

  return x >= Math.min(x1, x2) - 1e-10
    && x <= Math.max(x1, x2) + 1e-10
    && y >= Math.min(y1, y2) - 1e-10
    && y <= Math.max(y1, y2) + 1e-10;
}

function segmentsIntersect(
  left: [[number, number], [number, number]],
  right: [[number, number], [number, number]],
) {
  const [a, b] = left;
  const [c, d] = right;
  const d1 = orientation(a, b, c);
  const d2 = orientation(a, b, d);
  const d3 = orientation(c, d, a);
  const d4 = orientation(c, d, b);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return (Math.abs(d1) <= 1e-10 && pointOnSegment(c, left))
    || (Math.abs(d2) <= 1e-10 && pointOnSegment(d, left))
    || (Math.abs(d3) <= 1e-10 && pointOnSegment(a, right))
    || (Math.abs(d4) <= 1e-10 && pointOnSegment(b, right));
}

function orientation(a: [number, number], b: [number, number], c: [number, number]) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
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

function terrainToolLabel(tool: TerrainToolId) {
  if (tool === 'hillshade') {
    return '山体阴影';
  }

  if (tool === 'slope') {
    return '坡度';
  }

  return '坡向';
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

function boundedNumber(value: string, name: string, min: number, max: number) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name}必须在 ${min} 到 ${max} 之间。`);
  }

  return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
