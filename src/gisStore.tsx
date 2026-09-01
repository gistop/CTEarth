import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Feature } from 'geojson';
import initGeoLibre, {
  CogBuilder,
  CogStream,
  GeoTiffReader,
  transform_points_epsg,
  vector_to_geojson_reproject,
  version as geolibreVersion,
} from 'geolibre-wasm';
import { extractCogSubset, initTools, runTool } from 'geolibre-wasm/tools';
import type { RunToolOptions, ToolResult } from 'geolibre-wasm/tools';
import { FeatureColumn, GeoPackageDataType, GeometryType } from '@ngageoint/geopackage';
import geoPackageSqlWasmUrl from '@ngageoint/geopackage/dist/sql-wasm.wasm?url';
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
  id: string;
  name: string;
  toolInput: RasterToolInput;
  imageUrl: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  width: number;
  height: number;
  min: number;
  max: number;
  epsg?: number;
  geoTransform: number[];
  nodata?: number;
  pixels: Float64Array;
};

export type VectorOverlay = {
  name: string;
  geojson: {
    type: 'FeatureCollection';
    features: unknown[];
  };
};

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: unknown[];
};

export type EditableGeometryType = 'Point' | 'LineString' | 'Polygon';

export type IdwParameters = {
  layerId: string;
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

type VectorExportFormat = 'geojson' | 'geopackage';

export type OverlayToolId = 'intersect' | 'union' | 'erase';

export type OverlayParameters = {
  inputLayerId: string;
  overlayLayerId: string;
  outputName: string;
  snapTolerance: string;
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

export type ExtractByMaskParameters = {
  maskLayerId: string;
  outputName: string;
  maintainDimensions: boolean;
};

export type RasterAoiPolygon = {
  type: 'Polygon';
  coordinates: [number, number][][];
};

export type RasterEditParameters = {
  polygon: RasterAoiPolygon;
  value: string;
  outputName?: string;
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
  tool: 'idw_interpolation' | 'buffer_vector' | 'select_by_value' | 'select_by_location' | 'extract_by_mask' | OverlayToolId;
  message: string;
  qa: {
    passed: boolean;
    checks: string[];
  };
  output?: Record<string, unknown>;
};

export type LayerVisibilityId = 'basemap' | 'raster' | 'vectorOverlay';

export type LayerVisibility = Record<LayerVisibilityId, boolean>;

export type LayerOrderId = LayerVisibilityId | `uploaded:${string}` | `raster:${string}`;

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
  geometryType?: EditableGeometryType;
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
  layerZoomRequest: { layerId: string; requestId: number } | null;
  raster: RasterOverlay | null;
  rasters: RasterOverlay[];
  activeRasterId: string | null;
  vectorOverlay: VectorOverlay | null;
  basemapStyle: BasemapLayerStyle;
  rasterStyle: RasterLayerStyle;
  vectorOverlayStyle: VectorOverlayStyle;
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  layerVisibility: LayerVisibility;
  rasterLayerVisibility: Record<string, boolean>;
  uploadedLayerVisibility: Record<string, boolean>;
  layerOrder: LayerOrderId[];
  toolsReady: boolean;
  isRunning: boolean;
  message: string;
  uploadShapefileZip: (file: File) => Promise<void>;
  uploadGeoJson: (file: File) => Promise<void>;
  uploadGeoParquetFile: (file: File) => Promise<void>;
  uploadGeoParquetUrl: (url: string) => Promise<void>;
  uploadGeoPackage: (file: File) => Promise<void>;
  uploadGeoTiff: (file: File) => Promise<void>;
  uploadGeoTiffUrl: (url: string) => Promise<void>;
  createBlankGeoJsonLayer: (params: { fileName?: string; geometryType: EditableGeometryType }) => string;
  deleteUploadedLayer: (layerId?: string) => void;
  saveGeoJsonLayer: (layerId?: string, options?: { saveAs?: boolean; fileName?: string }) => Promise<void>;
  saveGeoPackageLayer: (layerId?: string, options?: { saveAs?: boolean; fileName?: string }) => Promise<void>;
  updateUploadedLayerGeoJson: (layerId: string, geojson: GeoJsonFeatureCollection) => void;
  setLayerVisibility: (id: LayerVisibilityId, visible: boolean) => void;
  setUploadedLayerVisibility: (id: string, visible: boolean) => void;
  setAllLayerVisibility: (visible: boolean) => void;
  setBasemapStyle: (patch: Partial<BasemapLayerStyle>) => void;
  setRasterStyle: (patch: Partial<RasterLayerStyle>) => void;
  setVectorOverlayStyle: (patch: Partial<VectorOverlayStyle>) => void;
  setUploadedLayerStyle: (id: string, patch: Partial<UploadedLayerStyle>) => void;
  setLayerDrawOrder: (order: LayerOrderId[]) => void;
  moveLayerOrder: (draggedId: LayerOrderId, targetId: LayerOrderId) => void;
  setActiveLayer: (id: string) => void;
  setActiveRaster: (id: string) => void;
  zoomToLayer: (layerId: string) => void;
  setRasterLayerVisibility: (id: string, visible: boolean) => void;
  setSelectedField: (field: string) => void;
  setLayerSelection: (layerId: string, indexes: number[]) => void;
  clearSelection: (layerId?: string) => void;
  selectByValue: (params: SelectByValueParameters) => Promise<SelectionResult | null>;
  selectByLocation: (params: SelectByLocationParameters) => Promise<SelectionResult | null>;
  runIdwInterpolation: (params: IdwParameters) => Promise<void>;
  runBufferAnalysis: (params: BufferParameters) => Promise<void>;
  runOverlayAnalysis: (tool: OverlayToolId, params: OverlayParameters) => Promise<void>;
  runTerrainAnalysis: (tool: TerrainToolId, params: TerrainParameters) => Promise<void>;
  runExtractByMask: (params: ExtractByMaskParameters) => Promise<void>;
  editRasterByAoi: (params: RasterEditParameters) => Promise<void>;
  saveRasterLayer: (options?: { fileName?: string }) => Promise<void>;
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
const maxIdwOutputCells = 50_000_000;

export function GisProvider({ children }: { children: React.ReactNode }) {
  const fileHandlesRef = useRef<Record<string, LocalSaveFileHandle>>({});
  const [layers, setLayers] = useState<UploadedLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [layerZoomRequest, setLayerZoomRequest] = useState<{ layerId: string; requestId: number } | null>(null);
  const [rasters, setRasters] = useState<RasterOverlay[]>([]);
  const [activeRasterId, setActiveRasterId] = useState<string | null>(null);
  const [vectorOverlay, setVectorOverlay] = useState<VectorOverlay | null>(null);
  const [basemapStyle, setBasemapStyleState] = useState<BasemapLayerStyle>(defaultBasemapStyle);
  const [rasterStyle, setRasterStyleState] = useState<RasterLayerStyle>(defaultRasterStyle);
  const [vectorOverlayStyle, setVectorOverlayStyleState] = useState<VectorOverlayStyle>(defaultVectorOverlayStyle);
  const [uploadedLayerStyles, setUploadedLayerStyles] = useState<Record<string, UploadedLayerStyle>>({});
  const [layerVisibility, setLayerVisibilityState] = useState<LayerVisibility>(defaultLayerVisibility);
  const [rasterLayerVisibility, setRasterLayerVisibilityState] = useState<Record<string, boolean>>({});
  const [uploadedLayerVisibility, setUploadedLayerVisibilityState] = useState<Record<string, boolean>>({});
  const [layerOrder, setLayerOrder] = useState<LayerOrderId[]>(defaultLayerOrder);
  const [toolsReady, setToolsReady] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [message, setMessage] = useState('WASM 工具正在加载');

  const layer = useMemo(
    () => layers.find((item) => item.id === activeLayerId) ?? layers.at(-1) ?? null,
    [activeLayerId, layers],
  );
  const raster = useMemo(
    () => rasters.find((item) => item.id === activeRasterId) ?? rasters[0] ?? null,
    [activeRasterId, rasters],
  );

  const setRaster = useCallback((nextRaster: RasterOverlay | null) => {
    if (!nextRaster) {
      setRasters([]);
      setActiveRasterId(null);
      setRasterLayerVisibilityState({});
      setLayerOrder((current) => current.filter((id) => id !== 'raster' && !id.startsWith('raster:')));
      return;
    }

    setRasters((current) => [nextRaster, ...current.filter((item) => item.id !== nextRaster.id)]);
    setActiveRasterId(nextRaster.id);
    setRasterLayerVisibilityState((current) => ({ ...current, [nextRaster.id]: true }));
    setLayerOrder((current) => [`raster:${nextRaster.id}`, ...current.filter((id) => id !== 'raster' && id !== `raster:${nextRaster.id}`)]);
  }, []);

  const setLayerVisibility = useCallback((id: LayerVisibilityId, visible: boolean) => {
    setLayerVisibilityState((current) => ({ ...current, [id]: visible }));
  }, []);

  const setUploadedLayerVisibility = useCallback((id: string, visible: boolean) => {
    setUploadedLayerVisibilityState((current) => ({ ...current, [id]: visible }));
  }, []);

  const setRasterLayerVisibility = useCallback((id: string, visible: boolean) => {
    setRasterLayerVisibilityState((current) => ({ ...current, [id]: visible }));
  }, []);

  const setAllLayerVisibility = useCallback((visible: boolean) => {
    setLayerVisibilityState({
      basemap: visible,
      raster: visible,
      vectorOverlay: visible,
    });
    setRasterLayerVisibilityState((current) => (
      Object.fromEntries(Object.keys(current).map((id) => [id, visible]))
    ));
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

  const setLayerDrawOrder = useCallback((order: LayerOrderId[]) => {
    setLayerOrder((current) => {
      const nextOrder = uniqueLayerOrder(order);

      return areLayerOrdersEqual(current, nextOrder) ? current : nextOrder;
    });
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

  const setActiveRaster = useCallback((id: string) => {
    setActiveRasterId(id);
  }, []);

  const zoomToLayer = useCallback((layerId: string) => {
    setLayerZoomRequest((current) => ({
      layerId,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }, []);

  const addGeoJsonLayer = useCallback((fileName: string, geojson: GeoJsonFeatureCollection, formatLabel: string) => {
    const points = geojson.features.filter(isPointFeature);
    const fields = getFields(geojson.features);
    const numericFields = getNumericFields(points);
    const nextLayer: UploadedLayer = {
      id: createLayerId(fileName),
      fileName,
      toolInput: createGeoJsonToolInput(geoJsonToolInputName(fileName), geojson),
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
    setMessage(`已加载 ${geojson.features.length} 个 ${formatLabel} 要素：${fileName}`);
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

  useEffect(() => {
    let active = true;

    readVectorDraft()
      .then((draft) => {
        if (!active) {
          return;
        }

        if (draft?.layers.length) {
          const nextLayers = draft.layers.map(draftLayerToUploadedLayer);
          const layerIds = new Set(nextLayers.map((item) => item.id));

          setLayers(nextLayers);
          setActiveLayerId(draft.activeLayerId && layerIds.has(draft.activeLayerId) ? draft.activeLayerId : nextLayers.at(-1)?.id ?? null);
          setUploadedLayerVisibilityState(draft.uploadedLayerVisibility ?? {});
          setUploadedLayerStyles(draft.uploadedLayerStyles ?? {});
          setLayerOrder([
            ...draft.layerOrder.filter((id) => id === 'basemap' || id === 'vectorOverlay' || layerIds.has(id.slice('uploaded:'.length))),
            ...nextLayers
              .map((item) => `uploaded:${item.id}` as const)
              .filter((id) => !draft.layerOrder.includes(id)),
            'basemap',
          ]);
          setMessage(`已恢复本地草稿：${nextLayers.length} 个 GeoJSON 图层`);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(errorMessage(error));
        }
      })
      .finally(() => {
        if (active) {
          setDraftLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftLoaded) {
      return undefined;
    }

    const handle = window.setTimeout(() => {
      if (layers.length === 0) {
        void deleteVectorDraft();
        return;
      }

      void writeVectorDraft({
        version: 1,
        savedAt: new Date().toISOString(),
        activeLayerId,
        layers: layers.map(layerToDraftLayer),
        uploadedLayerStyles,
        uploadedLayerVisibility,
        layerOrder,
      });
    }, 500);

    return () => window.clearTimeout(handle);
  }, [activeLayerId, draftLoaded, layerOrder, layers, uploadedLayerStyles, uploadedLayerVisibility]);

  const uploadShapefileZip = useCallback(async (file: File) => {
    try {
      setMessage('正在读取 Shapefile 压缩包');
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
      setVectorOverlay(null);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder().decode(bytes);
      const geojson = normalizeGeoJson(JSON.parse(text));
      addGeoJsonLayer(file.name || 'input.geojson', geojson, 'GeoJSON');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [addGeoJsonLayer]);

  const uploadGeoParquetFile = useCallback(async (file: File) => {
    try {
      setMessage('正在读取 GeoParquet');
      setVectorOverlay(null);

      const { readGeoParquetFile } = await import('./geoParquet');
      const geojson = await readGeoParquetFile(file);

      addGeoJsonLayer(file.name || 'input.geoparquet', geojson, 'GeoParquet');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [addGeoJsonLayer]);

  const uploadGeoParquetUrl = useCallback(async (url: string) => {
    try {
      const trimmedUrl = url.trim();

      if (!trimmedUrl) {
        setMessage('请输入 GeoParquet 远程地址。');
        return;
      }

      setMessage('正在读取远程 GeoParquet');
      setVectorOverlay(null);

      const { readGeoParquetUrl } = await import('./geoParquet');
      const geojson = await readGeoParquetUrl(trimmedUrl);

      addGeoJsonLayer(remoteGeoParquetFileName(trimmedUrl), geojson, 'GeoParquet');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [addGeoJsonLayer]);

  const uploadGeoPackage = useCallback(async (file: File) => {
    try {
      setMessage('正在读取 GeoPackage');
      setVectorOverlay(null);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const geojson = normalizeGeoJson(JSON.parse(vector_to_geojson_reproject(bytes, 'geopackage', 4326, 0)));

      addGeoJsonLayer(file.name || 'input.gpkg', geojson, 'GeoPackage');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [addGeoJsonLayer]);

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
      setLayerOrder((current) => current.filter((id) => id !== 'raster'));
      setMessage(`已加载 GeoTIFF：${file.name}（${nextRaster.width} x ${nextRaster.height}）`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, []);

  const uploadGeoTiffUrl = useCallback(async (url: string) => {
    try {
      const trimmedUrl = url.trim();

      if (!trimmedUrl) {
        setMessage('请输入 COG/GeoTIFF 远程地址。');
        return;
      }

      setIsRunning(true);
      setMessage('正在读取远程 COG/GeoTIFF');
      setVectorOverlay(null);

      const metadata = await readRemoteCogMetadata(trimmedUrl);
      const outputBytes = await extractCogSubset(trimmedUrl, {
        bbox: metadata.bounds,
        bboxCrs: 4326,
        level: metadata.level,
        outputCrs: 4326,
        initialHeaderBytes: metadata.headerBytes,
      });
      const inputName = remoteGeoTiffFileName(trimmedUrl);
      const nextRaster = readRasterOverlay(outputBytes, inputName, inputName);

      setRaster(nextRaster);
      setLayerVisibilityState((current) => ({
        ...current,
        raster: true,
        vectorOverlay: true,
      }));
      setLayerOrder((current) => current.filter((id) => id !== 'raster'));
      setMessage(`已加载远程 COG/GeoTIFF：${inputName}（${nextRaster.width} x ${nextRaster.height}）`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }, []);

  const createBlankGeoJsonLayer = useCallback((params: { fileName?: string; geometryType: EditableGeometryType }) => {
    const fileName = ensureGeoJsonName((params.fileName || `${params.geometryType.toLowerCase()}-layer.geojson`).trim() || 'new-layer.geojson');
    const geojson: GeoJsonFeatureCollection = { type: 'FeatureCollection', features: [] };
    const nextLayer: UploadedLayer = {
      id: createLayerId(fileName),
      fileName,
      geometryType: params.geometryType,
      toolInput: createGeoJsonToolInput(fileName, geojson),
      geojson,
      points: {
        type: 'FeatureCollection',
        features: [],
      },
      fields: [],
      numericFields: [],
      selectedField: '',
      selectedFeatureIndexes: [],
    };

    setRaster(null);
    setVectorOverlay(null);
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
    setMessage(`已新建空白 GeoJSON 图层：${fileName}`);

    return nextLayer.id;
  }, []);

  const deleteUploadedLayer = useCallback((layerId?: string) => {
    const targetLayer = findLayer(layers, layerId) ?? layer;

    if (!targetLayer) {
      setMessage('没有可删除的矢量图层。');
      return;
    }

    const targetId = targetLayer.id;
    const remainingLayers = layers.filter((item) => item.id !== targetId);
    const nextActiveLayerId = remainingLayers.at(-1)?.id ?? null;

    delete fileHandlesRef.current[targetId];
    setLayers(remainingLayers);
    setActiveLayerId((current) => {
      if (current && current !== targetId && remainingLayers.some((item) => item.id === current)) {
        return current;
      }

      return nextActiveLayerId;
    });
    setUploadedLayerVisibilityState((current) => {
      const { [targetId]: _removed, ...next } = current;
      return next;
    });
    setUploadedLayerStyles((current) => {
      const { [targetId]: _removed, ...next } = current;
      return next;
    });
    setLayerOrder((current) => current.filter((id) => id !== `uploaded:${targetId}`));
    setMessage(`已删除图层：${targetLayer.fileName}`);
  }, [layer, layers]);

  const saveGeoJsonLayer = useCallback(async (layerId?: string, options?: { saveAs?: boolean; fileName?: string }) => {
    const targetLayer: { id: string; fileName: string; geojson: GeoJsonFeatureCollection } | null = layerId === 'vectorOverlay'
      ? (vectorOverlay ? { id: 'vectorOverlay', fileName: vectorOverlay.name, geojson: vectorOverlay.geojson } : null)
      : (findLayer(layers, layerId) ?? layer ?? null);

    if (!targetLayer) {
      setMessage('没有可保存的 GeoJSON 图层。');
      return;
    }

    const fileName = ensureGeoJsonName(displayLayerName((options?.fileName || targetLayer.fileName || 'layer').trim() || 'layer'));
    const blob = geoJsonBlob(targetLayer.geojson);

    try {
      if (!options?.saveAs && fileHandlesRef.current[targetLayer.id]) {
        await writeFileHandle(fileHandlesRef.current[targetLayer.id], blob);
      } else if (options?.saveAs) {
        const handle = await pickSaveFile(fileName);

        if (handle) {
          await writeFileHandle(handle, blob);
          fileHandlesRef.current[targetLayer.id] = handle;
        } else {
          downloadBlob(blob, fileName);
        }
      } else {
        downloadBlob(blob, fileName);
      }

      setMessage(`已保存 GeoJSON：${fileName}`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [layer, layers, vectorOverlay]);

  const saveGeoPackageLayer = useCallback(async (layerId?: string, options?: { saveAs?: boolean; fileName?: string }) => {
    const targetLayer: { id: string; fileName: string; geojson: GeoJsonFeatureCollection } | null = layerId === 'vectorOverlay'
      ? (vectorOverlay ? { id: 'vectorOverlay', fileName: vectorOverlay.name, geojson: vectorOverlay.geojson } : null)
      : (findLayer(layers, layerId) ?? layer ?? null);

    if (!targetLayer) {
      setMessage('娌℃湁鍙繚瀛樼殑 GeoPackage 鍥惧眰銆?');
      return;
    }

    const baseName = displayLayerName((options?.fileName || targetLayer.fileName || 'layer').trim() || 'layer');
    const fileName = ensureGeoPackageName(baseName);
    const handleKey = `${targetLayer.id}:geopackage`;

    try {
      const outputBytes = await geoPackageBlob(targetLayer.geojson, baseName);
      const blob = new Blob([outputBytes], { type: 'application/geopackage+sqlite3' });

      if (!options?.saveAs && fileHandlesRef.current[handleKey]) {
        await writeFileHandle(fileHandlesRef.current[handleKey], blob);
      } else if (options?.saveAs) {
        const handle = await pickSaveFile(fileName, 'geopackage');

        if (handle) {
          await writeFileHandle(handle, blob);
          fileHandlesRef.current[handleKey] = handle;
        } else {
          downloadBlob(blob, fileName);
        }
      } else {
        downloadBlob(blob, fileName);
      }

      setMessage(`宸蹭繚瀛?GeoPackage锛?{fileName}`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [layer, layers, vectorOverlay]);

  const updateUploadedLayerGeoJson = useCallback((layerId: string, nextGeoJson: GeoJsonFeatureCollection) => {
    const geojson = normalizeGeoJson(nextGeoJson);
    const points = geojson.features.filter(isPointFeature);
    const fields = getFields(geojson.features);
    const numericFields = getNumericFields(points);

    setLayers((current) => current.map((item) => {
      if (item.id !== layerId) {
        return item;
      }

      const outputName = ensureGeoJsonName(item.fileName || 'edited-layer.geojson');
      const bytes = new TextEncoder().encode(JSON.stringify(geojson));
      const selectedField = numericFields.includes(item.selectedField)
        ? item.selectedField
        : numericFields[0] ?? '';

      return {
        ...item,
        toolInput: {
          inputName: outputName,
          files: { [outputName]: bytes },
        },
        geojson,
        points: {
          type: 'FeatureCollection',
          features: points,
        },
        fields,
        numericFields,
        selectedField,
        selectedFeatureIndexes: item.selectedFeatureIndexes.filter((index) => index < geojson.features.length),
      };
    }));
    setActiveLayerId(layerId);
    setMessage(`已更新编辑图层：${geojson.features.length} 个要素`);
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
    const analysis = createAnalysisLogContext('idw_interpolation');
    logAnalysisEvent(analysis, 'start', {
      rawParams: { ...params },
      activeLayer: summarizeUploadedLayerForAnalysis(layer),
      candidateLayerId: params.layerId,
    });
    if (!toolsReady) {
      logAnalysisEvent(analysis, 'blocked', { reason: 'tools_not_ready' });
      setMessage('WASM 工具仍在加载，请稍后再运行。');
      return;
    }

    const inputLayer = findLayer(layers, params.layerId) ?? layer;
    logAnalysisEvent(analysis, 'validated', {
      resolvedInputLayer: summarizeUploadedLayerForAnalysis(inputLayer),
    });

    if (!inputLayer) {
      logAnalysisEvent(analysis, 'blocked', { reason: 'input_layer_missing' });
      setMessage('请先在左侧上传点 Shapefile 压缩包或点 GeoJSON。');
      return;
    }

    if (inputLayer.points.features.length === 0) {
      logAnalysisEvent(analysis, 'blocked', {
        reason: 'not_a_point_layer',
        resolvedInputLayer: summarizeUploadedLayerForAnalysis(inputLayer),
      });
      setMessage('反距离加权插值需要选择点图层。');
      return;
    }

    if (inputLayer.numericFields.length === 0) {
      logAnalysisEvent(analysis, 'blocked', {
        reason: 'no_numeric_field',
        resolvedInputLayer: summarizeUploadedLayerForAnalysis(inputLayer),
      });
      setMessage('反距离加权插值需要至少一个数值字段。');
      return;
    }

    try {
      setIsRunning(true);
      setMessage('正在浏览器 WASM 中运行反距离加权插值');
      const requestedCellSize = positiveNumber(params.cellSize, '输出像元大小');
      const weight = positiveNumber(params.weight, '幂');
      const requestedRadius = nonNegativeNumber(params.radius || '0', '搜索半径');
      const minPoints = nonNegativeInteger(params.minPoints || '0', '点数');
      const outputName = ensureTifName(params.outputName || 'idw-interpolation.tif');
      const field = params.field || inputLayer.selectedField;
      const idwResolution = normalizeIdwResolution(requestedCellSize, requestedRadius, inputLayer);
      const args = [
        `--points=/work/${inputLayer.toolInput.inputName}`,
        `--field_name=${field}`,
        `--output=/work/${outputName}`,
        `--cell_size=${idwResolution.cellSize}`,
        `--weight=${weight}`,
        `--radius=${idwResolution.radius}`,
        `--min_points=${minPoints}`,
        '--use_z=false',
      ];

      if (!inputLayer.numericFields.includes(field)) {
        logAnalysisEvent(analysis, 'blocked', {
          reason: 'field_not_numeric',
          field,
          numericFields: [...inputLayer.numericFields],
          resolvedInputLayer: summarizeUploadedLayerForAnalysis(inputLayer),
        });
        throw new Error('请选择输入点图层中的数值字段。');
      }

      logAnalysisEvent(analysis, 'invoke', {
        normalizedParams: {
          cellSize: idwResolution.cellSize,
          requestedCellSize,
          cellSizeUnit: idwResolution.cellSizeUnit,
          weight,
          radius: idwResolution.radius,
          requestedRadius,
          radiusUnit: idwResolution.radiusUnit,
          minPoints,
          outputName,
          field,
          inputBbox: idwResolution.inputBbox,
          estimatedRasterSize: idwResolution.estimatedRasterSize,
        },
        inputLayer: summarizeUploadedLayerForAnalysis(inputLayer),
        wasmArgs: args,
        wasmInput: summarizeShapefileInput(inputLayer.toolInput),
      });

      const result = await runTool('idw_interpolation', {
        args,
        input: inputLayer.toolInput.files,
      });

      logAnalysisEvent(analysis, 'result', summarizeToolResultForAnalysis(result, outputName));

      if (result.exitCode !== 0) {
        logAnalysisError(analysis, 'error', new Error(`tool exit code ${result.exitCode}`), summarizeToolResultForAnalysis(result, outputName));
        throw new Error(result.stdout.join('\n') || `工具运行失败，退出码 ${result.exitCode}`);
      }

      const tiffBytes = result.files[outputName];

      if (!tiffBytes) {
        logAnalysisError(analysis, 'error', new Error('missing expected GeoTIFF output'), summarizeToolResultForAnalysis(result, outputName));
        throw new Error(`没有获得 GeoTIFF 输出。工具输出：${result.stdout.join('\n')}`);
      }

      const nextRaster = readRasterOverlay(tiffBytes, outputName);
      logAnalysisEvent(analysis, 'success', {
        outputName,
        raster: {
          width: nextRaster.width,
          height: nextRaster.height,
          epsg: nextRaster.epsg ?? null,
          min: nextRaster.min,
          max: nextRaster.max,
        },
      });
      setRaster(nextRaster);
      setLayerVisibilityState((current) => ({ ...current, raster: true }));
      setLayerOrder((current) => current.filter((id) => id !== 'raster'));
      setLayers((current) => current.map((item) => (
        item.id === inputLayer.id ? { ...item, selectedField: field } : item
      )));
      setActiveLayerId(inputLayer.id);
      setMessage(`插值完成：${nextRaster.width} x ${nextRaster.height}${idwResolution.note ? `（${idwResolution.note}）` : ''}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }, [layer, layers, toolsReady]);

  const runBufferAnalysis = useCallback(async (params: BufferParameters) => {
    const analysis = createAnalysisLogContext('buffer_vector');
    logAnalysisEvent(analysis, 'start', {
      rawParams: { ...params },
      activeLayer: summarizeUploadedLayerForAnalysis(layer),
    });
    if (!toolsReady) {
      logAnalysisEvent(analysis, 'blocked', { reason: 'tools_not_ready' });
      setMessage('WASM 工具仍在加载，请稍后再运行。');
      return;
    }

    if (!layer) {
      logAnalysisEvent(analysis, 'blocked', { reason: 'input_layer_missing' });
      setMessage('请先在左侧上传 Shapefile 压缩包或 GeoJSON。');
      return;
    }

    try {
      setIsRunning(true);
      setMessage('正在浏览器 WASM 中运行缓冲区分析');
      setVectorOverlay(null);

      const distance = positiveNumber(params.distance, '缓冲距离');
      const quadrantSegments = positiveInteger(params.quadrantSegments || '8', '圆弧段数');
      const outputName = ensureGeoJsonName(params.outputName || 'buffer');
      const args = [
        `--input=/work/${layer.toolInput.inputName}`,
        `--output=/work/${outputName}`,
        `--distance=${distance}`,
        `--quadrant_segments=${quadrantSegments}`,
        `--cap_style=${params.capStyle || 'round'}`,
        `--join_style=${params.joinStyle || 'round'}`,
        `--dissolve=${params.dissolve}`,
      ];

      logAnalysisEvent(analysis, 'invoke', {
        normalizedParams: {
          distance,
          quadrantSegments,
          outputName,
          capStyle: params.capStyle || 'round',
          joinStyle: params.joinStyle || 'round',
          dissolve: params.dissolve,
        },
        inputLayer: summarizeUploadedLayerForAnalysis(layer),
        wasmArgs: args,
        wasmInput: summarizeShapefileInput(layer.toolInput),
      });

      const result = await runTool('buffer_vector', {
        args,
        input: layer.toolInput.files,
      });

      logAnalysisEvent(analysis, 'result', summarizeToolResultForAnalysis(result, outputName));

      if (result.exitCode !== 0) {
        throw new Error(result.stdout.join('\n') || `工具运行失败，退出码 ${result.exitCode}`);
      }

      const outputBytes = result.files[outputName];

      if (!outputBytes) {
        logAnalysisError(analysis, 'error', new Error('missing expected GeoJSON output'), summarizeToolResultForAnalysis(result, outputName));
        throw new Error(`没有获得缓冲区输出。工具输出：${result.stdout.join('\n')}`);
      }

      const geojson = JSON.parse(new TextDecoder().decode(outputBytes));

      if (!isFeatureCollectionLike(geojson)) {
        logAnalysisError(analysis, 'error', new Error('invalid GeoJSON FeatureCollection output'), summarizeToolResultForAnalysis(result, outputName));
        throw new Error('缓冲区输出不是有效的 GeoJSON FeatureCollection。');
      }

      logAnalysisEvent(analysis, 'success', {
        outputName,
        geojson: summarizeGeoJsonForAnalysis(geojson),
      });
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

  const runOverlayAnalysis = useCallback(async (tool: OverlayToolId, params: OverlayParameters) => {
    const analysis = createAnalysisLogContext(tool);
    logAnalysisEvent(analysis, 'start', {
      rawParams: { ...params },
      activeLayer: summarizeUploadedLayerForAnalysis(layer),
      vectorOverlay: vectorOverlay ? {
        name: vectorOverlay.name,
        featureCount: vectorOverlay.geojson.features.length,
      } : null,
    });
    if (!toolsReady) {
      logAnalysisEvent(analysis, 'blocked', { reason: 'tools_not_ready' });
      setMessage('WASM 工具仍在加载，请稍后再运行。');
      return;
    }

    const inputLayer = findVectorToolInput(layers, vectorOverlay, params.inputLayerId)
      ?? (layer ? { id: layer.id, name: layer.fileName, toolInput: layer.toolInput } : null);
    const overlayLayer = findVectorToolInput(layers, vectorOverlay, params.overlayLayerId);
    logAnalysisEvent(analysis, 'validated', {
      inputLayer: summarizeVectorSelectionForAnalysis(inputLayer, layers, vectorOverlay),
      overlayLayer: summarizeVectorSelectionForAnalysis(overlayLayer, layers, vectorOverlay),
    });

    if (!inputLayer) {
      setMessage('请选择输入矢量图层。');
      return;
    }

    if (!overlayLayer) {
      logAnalysisEvent(analysis, 'blocked', { reason: 'overlay_layer_missing' });
      setMessage('请选择叠加矢量图层。');
      return;
    }

    if (!isOverlayPolygonLayerAvailable(layers, vectorOverlay, params.inputLayerId)
      || !isOverlayPolygonLayerAvailable(layers, vectorOverlay, params.overlayLayerId)) {
      logAnalysisEvent(analysis, 'blocked', {
        reason: 'non_polygon_layer',
        inputLayerId: params.inputLayerId,
        overlayLayerId: params.overlayLayerId,
      });
      setMessage('相交、联合、擦除只支持面图层，请选择 Polygon 或 MultiPolygon 图层。');
      return;
    }

    if (inputLayer.id === overlayLayer.id) {
      logAnalysisEvent(analysis, 'blocked', {
        reason: 'same_input_and_overlay_layer',
        inputLayerId: inputLayer.id,
      });
      setMessage('输入图层和叠加图层不能相同。');
      return;
    }

    try {
      setIsRunning(true);
      setMessage(`正在浏览器 WASM 中运行${overlayToolLabel(tool)}`);
      setVectorOverlay(null);

      const inputToolInput = namespaceVectorToolInput(inputLayer.toolInput, 'input');
      const overlayToolInput = namespaceVectorToolInput(overlayLayer.toolInput, 'overlay');
      const outputName = ensureGeoJsonName(params.outputName || `${tool}.geojson`);
      const args = [
        `--input=/work/${inputToolInput.inputName}`,
        `--overlay=/work/${overlayToolInput.inputName}`,
        `--output=/work/${outputName}`,
      ];

      if (params.snapTolerance.trim()) {
        args.push(`--snap_tolerance=${nonNegativeNumber(params.snapTolerance, '捕捉容差')}`);
      }

      logAnalysisEvent(analysis, 'invoke', {
        normalizedParams: {
          outputName,
          snapTolerance: params.snapTolerance.trim() || '',
        },
        inputLayer: summarizeVectorSelectionForAnalysis(inputLayer, layers, vectorOverlay),
        overlayLayer: summarizeVectorSelectionForAnalysis(overlayLayer, layers, vectorOverlay),
        wasmArgs: args,
        wasmInputs: {
          input: summarizeVectorToolInputForAnalysis(inputToolInput),
          overlay: summarizeVectorToolInputForAnalysis(overlayToolInput),
        },
      });
      const result = await runToolInWorker(tool, {
        args,
        input: {
          ...inputToolInput.files,
          ...overlayToolInput.files,
        },
      });

      logAnalysisEvent(analysis, 'result', summarizeToolResultForAnalysis(result, outputName));

      if (result.exitCode !== 0) {
        throw new Error(result.stdout.join('\n') || `工具运行失败，退出码 ${result.exitCode}`);
      }

      const outputBytes = result.files[outputName];

      if (!outputBytes) {
        throw new Error(`没有获得${overlayToolLabel(tool)}输出。工具输出：${result.stdout.join('\n')}`);
      }

      const geojson = normalizeGeoJson(JSON.parse(new TextDecoder().decode(outputBytes)));

      logAnalysisEvent(analysis, 'success', {
        outputName,
        geojson: summarizeGeoJsonForAnalysis(geojson),
      });
      setVectorOverlay({ name: outputName, geojson });
      setLayerVisibilityState((current) => ({ ...current, vectorOverlay: true }));
      setLayerOrder((current) => ['vectorOverlay', ...current.filter((id) => id !== 'vectorOverlay')]);
      setMessage(`${overlayToolLabel(tool)}完成：${geojson.features.length} 个要素`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }, [layer, layers, toolsReady, vectorOverlay]);

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
      setLayerOrder((current) => current.filter((id) => id !== 'raster'));
      setMessage(`${terrainToolLabel(tool)}完成：${nextRaster.width} x ${nextRaster.height}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }, [raster, toolsReady]);

  const runExtractByMask = useCallback(async (params: ExtractByMaskParameters) => {
    if (!toolsReady) {
      setMessage('WASM 工具仍在加载，请稍后再运行。');
      return;
    }

    if (!raster) {
      setMessage('请先添加一个 GeoTIFF 栅格图层。');
      return;
    }

    const maskLayer = findRasterMaskInput(layers, vectorOverlay, params.maskLayerId);

    if (!maskLayer) {
      setMessage('请选择一个面图层作为掩膜。');
      return;
    }

    try {
      setIsRunning(true);
      setMessage('正在使用 GeoLibre/Whitebox 按掩膜提取栅格');
      const outputName = ensureTifName(params.outputName || extractByMaskName(raster.name));

      const result = await runTool('clip_raster_to_polygon', {
        args: [
          `--input=/work/${raster.toolInput.inputName}`,
          `--polygons=/work/${maskLayer.toolInput.inputName}`,
          `--output=/work/${outputName}`,
          `--maintain_dimensions=${params.maintainDimensions}`,
        ],
        input: {
          ...raster.toolInput.files,
          ...maskLayer.toolInput.files,
        },
      });

      if (result.exitCode !== 0) {
        throw new Error(result.stdout.join('\n') || `工具运行失败，退出码 ${result.exitCode}`);
      }

      const outputBytes = result.files[outputName];

      if (!outputBytes) {
        throw new Error(`没有获得按掩膜提取输出。工具输出：${result.stdout.join('\n')}`);
      }

      const nextRaster = readRasterOverlay(outputBytes, outputName, outputName);

      setRaster(nextRaster);
      setLayerVisibilityState((current) => ({ ...current, raster: true }));
      setLayerOrder((current) => current.filter((id) => id !== 'raster'));
      setMessage(`按掩膜提取完成：${nextRaster.width} x ${nextRaster.height}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }, [layers, raster, toolsReady, vectorOverlay]);

  const editRasterByAoi = useCallback(async (params: RasterEditParameters) => {
    if (!raster) {
      setMessage('请先添加一个 GeoTIFF 栅格图层。');
      return;
    }

    const value = Number(params.value);

    if (!Number.isFinite(value)) {
      setMessage('请输入有效的像元值。');
      return;
    }

    try {
      setIsRunning(true);
      setMessage('正在按 AOI 修改栅格像元值');

      const rasterPolygon = polygonToRasterCrs(params.polygon, raster.epsg);
      const pixels = new Float64Array(raster.pixels);
      const editedCount = applyRasterEdit({
        geoTransform: raster.geoTransform,
        height: raster.height,
        nodata: raster.nodata,
        pixels,
        polygon: rasterPolygon,
        value,
        width: raster.width,
      });

      if (editedCount === 0) {
        setMessage('AOI 范围内没有命中有效像元。');
        return;
      }

      const outputName = ensureTifName(params.outputName || editedRasterName(raster.name));
      const outputBytes = writeRasterGeoTiff({
        epsg: raster.epsg,
        geoTransform: raster.geoTransform,
        height: raster.height,
        nodata: raster.nodata,
        pixels,
        width: raster.width,
      });
      const nextRaster = readRasterOverlay(outputBytes, outputName, outputName);

      setRaster(nextRaster);
      setLayerVisibilityState((current) => ({ ...current, raster: true }));
      setLayerOrder((current) => current.filter((id) => id !== 'raster'));
      setMessage(`栅格编辑完成：已更新 ${editedCount} 个像元，可导出 GeoTIFF。`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsRunning(false);
    }
  }, [raster]);

  const saveRasterLayer = useCallback(async (options?: { fileName?: string }) => {
    if (!raster) {
      setMessage('没有可导出的 GeoTIFF 栅格。');
      return;
    }

    const outputName = ensureTifName(options?.fileName || raster.name || 'edited-raster.tif');
    const outputBytes = raster.toolInput.files[raster.toolInput.inputName];

    if (!outputBytes) {
      setMessage('当前栅格缺少可导出的 GeoTIFF 数据。');
      return;
    }

    downloadBlob(new Blob([outputBytes.slice().buffer as ArrayBuffer], { type: 'image/tiff' }), outputName);
    setMessage(`已导出 GeoTIFF：${outputName}`);
  }, [raster]);

  const value = useMemo<GisContextValue>(() => ({
    layer,
    layers,
    activeLayerId,
    layerZoomRequest,
    raster,
    rasters,
    activeRasterId,
    vectorOverlay,
    basemapStyle,
    rasterStyle,
    vectorOverlayStyle,
    uploadedLayerStyles,
    layerVisibility,
    rasterLayerVisibility,
    uploadedLayerVisibility,
    layerOrder,
    toolsReady,
    isRunning,
    message,
    uploadShapefileZip,
    uploadGeoJson,
    uploadGeoParquetFile,
    uploadGeoParquetUrl,
    uploadGeoPackage,
    uploadGeoTiff,
    uploadGeoTiffUrl,
    createBlankGeoJsonLayer,
    deleteUploadedLayer,
    saveGeoJsonLayer,
    saveGeoPackageLayer,
    updateUploadedLayerGeoJson,
    setLayerVisibility,
    setUploadedLayerVisibility,
    setAllLayerVisibility,
    setBasemapStyle,
    setRasterStyle,
    setVectorOverlayStyle,
    setUploadedLayerStyle,
    setLayerDrawOrder,
    moveLayerOrder,
    setActiveLayer,
    setActiveRaster,
    zoomToLayer,
    setSelectedField,
    setLayerSelection,
    setRasterLayerVisibility,
    clearSelection,
    selectByValue,
    selectByLocation,
    runIdwInterpolation,
    runBufferAnalysis,
    runOverlayAnalysis,
    runTerrainAnalysis,
    runExtractByMask,
    editRasterByAoi,
    saveRasterLayer,
  }), [activeLayerId, activeRasterId, basemapStyle, clearSelection, createBlankGeoJsonLayer, deleteUploadedLayer, editRasterByAoi, isRunning, layer, layerOrder, layerVisibility, layerZoomRequest, layers, message, moveLayerOrder, raster, rasterLayerVisibility, rasterStyle, rasters, runBufferAnalysis, runExtractByMask, runIdwInterpolation, runOverlayAnalysis, runTerrainAnalysis, saveGeoJsonLayer, saveGeoPackageLayer, saveRasterLayer, selectByLocation, selectByValue, setActiveLayer, setActiveRaster, setAllLayerVisibility, setBasemapStyle, setLayerDrawOrder, setLayerSelection, setLayerVisibility, setRasterLayerVisibility, setRasterStyle, setSelectedField, setUploadedLayerStyle, setUploadedLayerVisibility, setVectorOverlayStyle, toolsReady, updateUploadedLayerGeoJson, uploadGeoJson, uploadGeoPackage, uploadGeoParquetFile, uploadGeoParquetUrl, uploadGeoTiff, uploadGeoTiffUrl, uploadedLayerStyles, uploadedLayerVisibility, uploadShapefileZip, vectorOverlay, vectorOverlayStyle, zoomToLayer]);

  return <GisContext.Provider value={value}>{children}</GisContext.Provider>;
}

export function useGis() {
  const value = useContext(GisContext);

  if (!value) {
    throw new Error('useGis must be used inside GisProvider');
  }

  return value;
}

function uniqueLayerOrder(order: LayerOrderId[]) {
  const seen = new Set<LayerOrderId>();
  const uniqueOrder: LayerOrderId[] = [];

  order.forEach((id) => {
    if (!seen.has(id)) {
      seen.add(id);
      uniqueOrder.push(id);
    }
  });

  return uniqueOrder;
}

function areLayerOrdersEqual(left: LayerOrderId[], right: LayerOrderId[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

type ToolWorkerResponse = {
  id: number;
  ok: true;
  result: ToolResult;
} | {
  id: number;
  ok: false;
  message: string;
};

let nextToolWorkerRequestId = 0;

function runToolInWorker(tool: string, options: RunToolOptions): Promise<ToolResult> {
  const id = nextToolWorkerRequestId + 1;

  nextToolWorkerRequestId = id;

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./gisToolWorker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => worker.terminate();

    worker.addEventListener('message', (event: MessageEvent<ToolWorkerResponse>) => {
      const message = event.data;

      if (message.id !== id) {
        return;
      }

      cleanup();

      if (message.ok) {
        resolve(message.result);
      } else {
        reject(new Error(message.message));
      }
    });
    worker.addEventListener('error', (event) => {
      cleanup();
      reject(new Error(event.message || 'WASM Worker 运行失败。'));
    });
    worker.postMessage({ id, tool, options });
  });
}

type LocalWritableFile = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type LocalSaveFileHandle = {
  createWritable: () => Promise<LocalWritableFile>;
};

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<LocalSaveFileHandle>;
};

type VectorDraftLayer = {
  id: string;
  fileName: string;
  geometryType?: EditableGeometryType;
  geojson: GeoJsonFeatureCollection;
  selectedField: string;
  selectedFeatureIndexes: number[];
};

type VectorDraft = {
  version: 1;
  savedAt: string;
  activeLayerId: string | null;
  layers: VectorDraftLayer[];
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  uploadedLayerVisibility: Record<string, boolean>;
  layerOrder: LayerOrderId[];
};

const vectorDraftDbName = 'ctearth-vector-drafts';
const vectorDraftStoreName = 'drafts';
const vectorDraftKey = 'current';

function createGeoJsonToolInput(inputName: string, geojson: GeoJsonFeatureCollection): ShapefileInput {
  const outputName = ensureGeoJsonName(inputName);

  return {
    inputName: outputName,
    files: { [outputName]: new TextEncoder().encode(JSON.stringify(geojson)) },
  };
}

function namespaceVectorToolInput(toolInput: ShapefileInput, prefix: 'input' | 'overlay'): ShapefileInput {
  const inputExtension = extensionOf(toolInput.inputName);
  const sourceBase = toolInput.inputName.replace(/\.[^.]+$/i, '');
  const targetBase = `${prefix}-${sourceBase.replace(/[^a-z0-9_-]+/gi, '-') || 'layer'}`;
  const files = Object.fromEntries(Object.entries(toolInput.files).map(([fileName, bytes]) => {
    const extension = extensionOf(fileName);
    const base = fileName.replace(/\.[^.]+$/i, '');
    const nextName = base === sourceBase && extension
      ? `${targetBase}.${extension}`
      : `${prefix}-${fileName}`;

    return [nextName, bytes];
  }));

  return {
    inputName: `${targetBase}.${inputExtension || 'geojson'}`,
    files,
  };
}

type AnalysisLogTool = 'idw_interpolation' | 'buffer_vector' | OverlayToolId;
type AnalysisLogPhase = 'start' | 'validated' | 'invoke' | 'result' | 'success' | 'blocked' | 'error';

type AnalysisLogContext = {
  runId: string;
  tool: AnalysisLogTool;
  label: string;
  startedAt: string;
};

let nextAnalysisRunId = 0;

function createAnalysisLogContext(tool: AnalysisLogTool) {
  const runId = `${tool}-${Date.now().toString(36)}-${(nextAnalysisRunId += 1).toString(36)}`;

  return {
    runId,
    tool,
    label: analysisToolLabel(tool),
    startedAt: new Date().toISOString(),
  };
}

function logAnalysisEvent(context: AnalysisLogContext, phase: AnalysisLogPhase, details: Record<string, unknown> = {}) {
  console.info('[CTEarth analysis]', {
    timestamp: new Date().toISOString(),
    runId: context.runId,
    tool: context.tool,
    label: context.label,
    phase,
    ...details,
  });
}

function logAnalysisError(context: AnalysisLogContext, phase: AnalysisLogPhase, error: unknown, details: Record<string, unknown> = {}) {
  console.error('[CTEarth analysis]', {
    timestamp: new Date().toISOString(),
    runId: context.runId,
    tool: context.tool,
    label: context.label,
    phase,
    error: errorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...details,
  });
}

function analysisToolLabel(tool: AnalysisLogTool) {
  if (tool === 'idw_interpolation') {
    return '反距离加权';
  }

  if (tool === 'buffer_vector') {
    return '缓冲区';
  }

  return overlayToolLabel(tool);
}

function summarizeUploadedLayerForAnalysis(layer: UploadedLayer | null | undefined) {
  if (!layer) {
    return null;
  }

  const geojson = summarizeGeoJsonForAnalysis(layer.geojson);

  return {
    id: layer.id,
    name: layer.fileName,
    geometryType: layer.geometryType ?? null,
    geojson,
    pointFeatureCount: layer.points.features.length,
    fields: [...layer.fields],
    numericFields: [...layer.numericFields],
    selectedField: layer.selectedField,
    selectedFeatureIndexCount: layer.selectedFeatureIndexes.length,
    toolInput: summarizeShapefileInput(layer.toolInput),
  };
}

function summarizeVectorToolInputForAnalysis(toolInput: ShapefileInput) {
  return {
    inputName: toolInput.inputName,
    fileCount: Object.keys(toolInput.files).length,
    fileNames: Object.keys(toolInput.files),
  };
}

function summarizeGeoJsonForAnalysis(geojson: GeoJsonFeatureCollection) {
  const geometryTypes = new Map<string, number>();
  let bbox: [number, number, number, number] | null = null;

  for (const feature of geojson.features) {
    const geometry = featureGeometry(feature);

    if (!geometry) {
      continue;
    }

    geometryTypes.set(geometry.type, (geometryTypes.get(geometry.type) ?? 0) + 1);
    bbox = mergeBbox(bbox, geometryBbox(geometry));
  }

  return {
    featureCount: geojson.features.length,
    geometryTypes: Object.fromEntries(geometryTypes),
    bbox,
  };
}

function summarizeToolResultForAnalysis(result: ToolResult, outputName?: string) {
  const outputFiles = Object.keys(result.files);

  return {
    exitCode: result.exitCode,
    stdoutLineCount: result.stdout.length,
    stdoutPreview: result.stdout.slice(0, 20),
    outputFiles,
    expectedOutputName: outputName,
    expectedOutputPresent: outputName ? Boolean(result.files[outputName]) : undefined,
    expectedOutputBytes: outputName ? result.files[outputName]?.byteLength ?? 0 : undefined,
  };
}

function summarizeShapefileInput(toolInput: ShapefileInput) {
  return {
    inputName: toolInput.inputName,
    fileCount: Object.keys(toolInput.files).length,
    fileNames: Object.keys(toolInput.files),
  };
}

function summarizeVectorSelectionForAnalysis(
  selection: { id: string; name: string; toolInput: ShapefileInput } | null,
  layers: UploadedLayer[],
  vectorOverlay: VectorOverlay | null,
) {
  if (!selection) {
    return null;
  }

  const sourceLayer = selection.id === 'vectorOverlay'
    ? null
    : layers.find((item) => item.id === selection.id) ?? null;

  return {
    id: selection.id,
    name: selection.name,
    geometryType: sourceLayer?.geometryType ?? null,
    geojson: selection.id === 'vectorOverlay'
      ? summarizeGeoJsonForAnalysis(vectorOverlay?.geojson ?? { type: 'FeatureCollection', features: [] })
      : sourceLayer
        ? summarizeGeoJsonForAnalysis(sourceLayer.geojson)
        : null,
    toolInput: summarizeShapefileInput(selection.toolInput),
  };
}

function mergeBbox(
  left: [number, number, number, number] | null,
  right: [number, number, number, number] | null,
) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return [
    Math.min(left[0], right[0]),
    Math.min(left[1], right[1]),
    Math.max(left[2], right[2]),
    Math.max(left[3], right[3]),
  ] as [number, number, number, number];
}

function geoJsonBlob(geojson: GeoJsonFeatureCollection) {
  return new Blob([`${JSON.stringify(geojson, null, 2)}\n`], { type: 'application/geo+json;charset=utf-8' });
}

async function geoPackageBlob(geojson: GeoJsonFeatureCollection, tableBaseName: string) {
  const { GeoPackageAPI, setSqljsWasmLocateFile } = await import('@ngageoint/geopackage');
  setSqljsWasmLocateFile(() => geoPackageSqlWasmUrl);

  const geoPackage = await GeoPackageAPI.create();
  const featureTableName = sanitizeGeoPackageTableName(tableBaseName);
  const features = geojson.features as Feature[];
  const columns = buildGeoPackageFeatureColumns(features, 'ctearthid');

  try {
    geoPackage.createFeatureTable(featureTableName, undefined, columns);
    await geoPackage.addGeoJSONFeaturesToGeoPackage(features, featureTableName, false);
    return new Uint8Array(await geoPackage.export());
  } finally {
    geoPackage.close();
  }
}

function buildGeoPackageFeatureColumns(features: Feature[], primaryKeyName: string) {
  const keys = new Set<string>();

  for (const feature of features) {
    Object.keys(feature.properties ?? {}).forEach((key) => keys.add(key));
  }

  const columns = [
    FeatureColumn.createPrimaryKeyColumn(0, primaryKeyName),
    FeatureColumn.createGeometryColumn(1, 'geometry', GeometryType.GEOMETRY, false),
  ];

  [...keys].sort().forEach((name, index) => {
    columns.push(FeatureColumn.createColumn(
      index + 2,
      name,
      GeoPackageDataType.fromName(inferGeoPackageDataType(features.map((feature) => feature.properties?.[name]))),
    ));
  });

  return columns;
}

function inferGeoPackageDataType(values: unknown[]) {
  const nonEmptyValues = values.filter((value) => value !== undefined && value !== null && String(value).trim() !== '');

  if (nonEmptyValues.length === 0) {
    return 'TEXT';
  }

  if (nonEmptyValues.every((value) => typeof value === 'boolean')) {
    return 'BOOLEAN';
  }

  if (nonEmptyValues.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return nonEmptyValues.every((value) => Number.isInteger(value)) ? 'INTEGER' : 'DOUBLE';
  }

  return 'TEXT';
}

async function pickSaveFile(suggestedName: string, format: VectorExportFormat = 'geojson') {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;

  if (!picker) {
    return null;
  }

  return picker({
    suggestedName,
    types: format === 'geopackage' ? [{
      description: 'GeoPackage',
      accept: {
        'application/geopackage+sqlite3': ['.gpkg'],
        'application/octet-stream': ['.gpkg'],
      },
    }] : [{
      description: 'GeoJSON',
      accept: {
        'application/geo+json': ['.geojson'],
        'application/json': ['.json'],
      },
    }],
  });
}

async function writeFileHandle(handle: LocalSaveFileHandle, blob: Blob) {
  const writable = await handle.createWritable();

  await writable.write(blob);
  await writable.close();
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function layerToDraftLayer(layer: UploadedLayer): VectorDraftLayer {
  return {
    id: layer.id,
    fileName: ensureGeoJsonName(layer.fileName || 'draft-layer.geojson'),
    geometryType: layer.geometryType,
    geojson: layer.geojson,
    selectedField: layer.selectedField,
    selectedFeatureIndexes: layer.selectedFeatureIndexes,
  };
}

function draftLayerToUploadedLayer(layer: VectorDraftLayer): UploadedLayer {
  const geojson = normalizeGeoJson(layer.geojson);
  const points = geojson.features.filter(isPointFeature);
  const fields = getFields(geojson.features);
  const numericFields = getNumericFields(points);

  return {
    id: layer.id,
    fileName: ensureGeoJsonName(layer.fileName || 'draft-layer.geojson'),
    geometryType: layer.geometryType,
    toolInput: createGeoJsonToolInput(layer.fileName || 'draft-layer.geojson', geojson),
    geojson,
    points: {
      type: 'FeatureCollection',
      features: points,
    },
    fields,
    numericFields,
    selectedField: numericFields.includes(layer.selectedField) ? layer.selectedField : numericFields[0] ?? '',
    selectedFeatureIndexes: layer.selectedFeatureIndexes.filter((index) => index < geojson.features.length),
  };
}

async function readVectorDraft(): Promise<VectorDraft | null> {
  const database = await openVectorDraftDb();

  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(vectorDraftStoreName, 'readonly');
    const request = transaction.objectStore(vectorDraftStoreName).get(vectorDraftKey);

    request.addEventListener('success', () => resolve(isVectorDraft(request.result) ? request.result : null));
    request.addEventListener('error', () => reject(request.error));
    transaction.addEventListener('complete', () => database.close());
  });
}

async function writeVectorDraft(draft: VectorDraft): Promise<void> {
  const database = await openVectorDraftDb();

  if (!database) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(vectorDraftStoreName, 'readwrite');

    transaction.objectStore(vectorDraftStoreName).put(draft, vectorDraftKey);
    transaction.addEventListener('complete', () => {
      database.close();
      resolve();
    });
    transaction.addEventListener('error', () => {
      database.close();
      reject(transaction.error);
    });
  });
}

async function deleteVectorDraft(): Promise<void> {
  const database = await openVectorDraftDb();

  if (!database) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(vectorDraftStoreName, 'readwrite');

    transaction.objectStore(vectorDraftStoreName).delete(vectorDraftKey);
    transaction.addEventListener('complete', () => {
      database.close();
      resolve();
    });
    transaction.addEventListener('error', () => {
      database.close();
      reject(transaction.error);
    });
  });
}

async function openVectorDraftDb(): Promise<IDBDatabase | null> {
  if (!('indexedDB' in window)) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(vectorDraftDbName, 1);

    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(vectorDraftStoreName)) {
        request.result.createObjectStore(vectorDraftStoreName);
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function isVectorDraft(value: unknown): value is VectorDraft {
  return isRecord(value)
    && value.version === 1
    && Array.isArray(value.layers)
    && Array.isArray(value.layerOrder)
    && isRecord(value.uploadedLayerStyles)
    && isRecord(value.uploadedLayerVisibility);
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
    id: createLayerId(name),
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
    geoTransform: raster.geoTransform,
    nodata: raster.nodata,
    pixels: raster.pixels,
  };
}

type RemoteCogMetadata = {
  bounds: [number, number, number, number];
  headerBytes: number;
  level: number;
};

type CogLevelInfo = {
  level: number;
  width: number;
  height: number;
};

async function readRemoteCogMetadata(url: string): Promise<RemoteCogMetadata> {
  const initialHeaderBytes = 256 * 1024;
  const maxHeaderBytes = 8 * 1024 * 1024;
  let headerBytes = initialHeaderBytes;
  let lastError: unknown = null;

  while (headerBytes <= maxHeaderBytes) {
    const header = await fetchRemoteCogHeader(url, headerBytes);

    try {
      const stream = new CogStream(header);

      try {
        const bounds = parseLonLatBounds(stream.bounds_lonlat());
        const levels = parseCogLevels(stream.levels_json());

        return {
          bounds,
          headerBytes,
          level: selectCogPreviewLevel(levels),
        };
      } finally {
        stream.free();
      }
    } catch (error) {
      lastError = error;

      if (!isMoreCogHeaderNeeded(error)) {
        throw error;
      }

      headerBytes *= 2;
    }
  }

  throw new Error(`COG 头部超过 ${formatBytes(maxHeaderBytes)}，无法解析远程影像。${lastError ? ` ${errorMessage(lastError)}` : ''}`);
}

async function fetchRemoteCogHeader(url: string, byteLength: number) {
  const response = await fetch(url, {
    headers: {
      Range: `bytes=0-${byteLength - 1}`,
    },
  });

  if (response.status !== 206) {
    throw new Error(`远程 COG 需要服务器支持 HTTP Range 请求；当前返回状态 ${response.status}。`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

function parseLonLatBounds(bounds: Float64Array): [number, number, number, number] {
  if (bounds.length < 4) {
    throw new Error('远程 COG 缺少可转换为经纬度的空间范围。');
  }

  const result = Array.from(bounds.slice(0, 4)) as [number, number, number, number];

  if (!result.every(Number.isFinite)) {
    throw new Error('远程 COG 的经纬度范围无效。');
  }

  return result;
}

function parseCogLevels(levelsJson: string): CogLevelInfo[] {
  const parsed = JSON.parse(levelsJson) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((level): level is CogLevelInfo => (
      isRecord(level)
      && Number.isFinite(level.level)
      && Number.isFinite(level.width)
      && Number.isFinite(level.height)
    ))
    .sort((left, right) => left.level - right.level);
}

function selectCogPreviewLevel(levels: CogLevelInfo[], maxPixels = 1_500_000) {
  if (!levels.length) {
    return 0;
  }

  return levels.find((level) => level.width * level.height <= maxPixels)?.level ?? levels[levels.length - 1].level;
}

function isMoreCogHeaderNeeded(error: unknown) {
  const message = errorMessage(error).toLowerCase();

  return message.includes('header')
    || message.includes('buffer')
    || message.includes('ifd')
    || message.includes('offset');
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${Math.round(value / (1024 * 1024))} MB`;
}

function writeRasterGeoTiff(raster: {
  width: number;
  height: number;
  epsg?: number;
  geoTransform: number[];
  nodata?: number;
  pixels: Float64Array;
}) {
  if (raster.geoTransform.length < 6) {
    throw new Error('GeoTIFF 缺少有效的 GeoTransform，无法导出修改结果。');
  }

  const builder = new CogBuilder(raster.width, raster.height, 1);

  try {
    builder.set_compression('deflate');
    builder.set_geo_transform(new Float64Array(raster.geoTransform));

    if (raster.epsg) {
      builder.set_epsg(raster.epsg);
    }

    if (raster.nodata !== undefined && Number.isFinite(raster.nodata)) {
      builder.set_nodata(raster.nodata);
    }

    return builder.write_f64(raster.pixels);
  } finally {
    builder.free();
  }
}

function polygonToRasterCrs(polygon: RasterAoiPolygon, rasterEpsg?: number) {
  if (!rasterEpsg) {
    throw new Error('GeoTIFF 缺少 EPSG 坐标系，无法把 AOI 转换到栅格坐标系。');
  }

  if (rasterEpsg === 4326) {
    return polygon.coordinates;
  }

  const points = polygon.coordinates.flatMap((ring) => ring);
  const transformed = transform_points_epsg(4326, rasterEpsg, new Float64Array(points.flat()));
  let offset = 0;

  return polygon.coordinates.map((ring) => (
    ring.map(() => {
      const point: [number, number] = [transformed[offset], transformed[offset + 1]];
      offset += 2;
      return point;
    })
  ));
}

function applyRasterEdit({
  geoTransform,
  height,
  nodata,
  pixels,
  polygon,
  value,
  width,
}: {
  geoTransform: number[];
  height: number;
  nodata?: number;
  pixels: Float64Array;
  polygon: [number, number][][];
  value: number;
  width: number;
}) {
  if (geoTransform.length < 6) {
    throw new Error('GeoTIFF 缺少有效的 GeoTransform，无法定位 AOI 像元。');
  }

  const inverse = invertGeoTransform(geoTransform);
  const bounds = polygonBounds(polygon);
  const pixelBounds = [
    mapToPixel(inverse, bounds[0], bounds[1]),
    mapToPixel(inverse, bounds[2], bounds[1]),
    mapToPixel(inverse, bounds[2], bounds[3]),
    mapToPixel(inverse, bounds[0], bounds[3]),
  ];
  const minCol = clampInteger(Math.floor(Math.min(...pixelBounds.map((point) => point[0])) - 1), 0, width - 1);
  const maxCol = clampInteger(Math.ceil(Math.max(...pixelBounds.map((point) => point[0])) + 1), 0, width - 1);
  const minRow = clampInteger(Math.floor(Math.min(...pixelBounds.map((point) => point[1])) - 1), 0, height - 1);
  const maxRow = clampInteger(Math.ceil(Math.max(...pixelBounds.map((point) => point[1])) + 1), 0, height - 1);
  let editedCount = 0;

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const index = row * width + col;
      const currentValue = pixels[index];

      if (!Number.isFinite(currentValue) || (nodata !== undefined && currentValue === nodata)) {
        continue;
      }

      const center = pixelToMap(geoTransform, col + 0.5, row + 0.5);

      if (!pointInPolygonRings(center, polygon)) {
        continue;
      }

      pixels[index] = value;
      editedCount += 1;
    }
  }

  return editedCount;
}

function invertGeoTransform(gt: number[]) {
  const determinant = gt[1] * gt[5] - gt[2] * gt[4];

  if (Math.abs(determinant) < 1e-18) {
    throw new Error('GeoTIFF GeoTransform 不可逆，无法定位 AOI 像元。');
  }

  return [
    gt[5] / determinant,
    -gt[2] / determinant,
    -gt[4] / determinant,
    gt[1] / determinant,
    gt[0],
    gt[3],
  ];
}

function mapToPixel(inverse: number[], x: number, y: number): [number, number] {
  const dx = x - inverse[4];
  const dy = y - inverse[5];

  return [
    inverse[0] * dx + inverse[1] * dy,
    inverse[2] * dx + inverse[3] * dy,
  ];
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function polygonBounds(polygon: [number, number][][]): [number, number, number, number] {
  const points = polygon.flatMap((ring) => ring);

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

function pointInPolygonRings(point: [number, number], rings: [number, number][][]) {
  const outerRing = rings[0];

  if (!outerRing || !pointInRing(point, outerRing)) {
    return false;
  }

  return !rings.slice(1).some((ring) => pointInRing(point, ring));
}

function editedRasterName(name: string) {
  return ensureTifName(name.replace(/\.tiff?$/i, '') + '-edited.tif');
}

function extractByMaskName(name: string) {
  return ensureTifName(name.replace(/\.tiff?$/i, '') + '-extract-mask.tif');
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

function hasPolygonOverlayFeatures(features: unknown[]) {
  return features.some((feature) => {
    if (!isRecord(feature) || !isRecord(feature.geometry)) {
      return false;
    }

    return feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';
  });
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

function findRasterMaskInput(
  layers: UploadedLayer[],
  vectorOverlay: VectorOverlay | null,
  maskLayerId: string,
): { id: string; name: string; toolInput: ShapefileInput } | null {
  if (!maskLayerId) {
    return null;
  }

  if (maskLayerId === 'vectorOverlay' && vectorOverlay) {
    return {
      id: 'vectorOverlay',
      name: vectorOverlay.name,
      toolInput: createGeoJsonToolInput(vectorOverlay.name || 'mask.geojson', vectorOverlay.geojson),
    };
  }

  const layer = layers.find((item) => item.id === maskLayerId);

  return layer ? { id: layer.id, name: layer.fileName, toolInput: layer.toolInput } : null;
}

function findVectorToolInput(
  layers: UploadedLayer[],
  vectorOverlay: VectorOverlay | null,
  layerId: string,
): { id: string; name: string; toolInput: ShapefileInput } | null {
  if (!layerId) {
    return null;
  }

  if (layerId === 'vectorOverlay' && vectorOverlay) {
    return {
      id: 'vectorOverlay',
      name: vectorOverlay.name,
      toolInput: createGeoJsonToolInput(vectorOverlay.name || 'vector-overlay.geojson', vectorOverlay.geojson),
    };
  }

  const layer = layers.find((item) => item.id === layerId);

  return layer ? { id: layer.id, name: layer.fileName, toolInput: layer.toolInput } : null;
}

function isOverlayPolygonLayerAvailable(
  layers: UploadedLayer[],
  vectorOverlay: VectorOverlay | null,
  layerId: string,
) {
  if (!layerId) {
    return false;
  }

  if (layerId === 'vectorOverlay') {
    if (!vectorOverlay) {
      return false;
    }

    return hasPolygonOverlayFeatures(vectorOverlay.geojson.features);
  }

  const layer = layers.find((item) => item.id === layerId);

  if (!layer) {
    return false;
  }

  return hasPolygonOverlayFeatures(layer.geojson.features);
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

export function displayLayerName(fileName: string) {
  let name = basename(fileName || 'layer').trim() || 'layer';

  while (true) {
    const next = name.replace(/\.(zip|geojson|json|shp|gpkg|geopackage|geoparquet|tif|tiff|geotiff)$/i, '');

    if (next === name) {
      return name;
    }

    name = next || 'layer';
  }
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

function ensureGeoPackageName(value: string) {
  return /\.gpkg$/i.test(value) ? value : `${value}.gpkg`;
}

function sanitizeGeoPackageTableName(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'layer';
}

function geoJsonToolInputName(fileName: string) {
  const baseName = basename(fileName || 'input')
    .replace(/\.(geo)?parquet$/i, '')
    .replace(/\.json$/i, '')
    .replace(/\.geojson$/i, '')
    .trim() || 'input';

  return ensureGeoJsonName(baseName);
}

function remoteGeoParquetFileName(url: string) {
  try {
    const parsedUrl = new URL(url);
    const pathName = decodeURIComponent(parsedUrl.pathname);
    const fileName = basename(pathName);

    return fileName || 'remote.geoparquet';
  } catch {
    return basename(url) || 'remote.geoparquet';
  }
}

function remoteGeoTiffFileName(url: string) {
  try {
    const parsedUrl = new URL(url);
    const pathName = decodeURIComponent(parsedUrl.pathname);
    const fileName = basename(pathName);

    return ensureTifName(fileName || 'remote-cog.tif');
  } catch {
    return ensureTifName(basename(url) || 'remote-cog.tif');
  }
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

function overlayToolLabel(tool: OverlayToolId) {
  if (tool === 'intersect') {
    return '相交';
  }

  if (tool === 'union') {
    return '联合';
  }

  return '擦除';
}

type IdwResolution = {
  cellSize: number;
  radius: number;
  cellSizeUnit: 'degrees' | 'meters' | 'map_units';
  radiusUnit: 'degrees' | 'meters' | 'map_units';
  inputBbox: [number, number, number, number] | null;
  estimatedRasterSize: { width: number; height: number; cells: number } | null;
  note: string;
};

function normalizeIdwResolution(
  requestedCellSize: number,
  requestedRadius: number,
  inputLayer: UploadedLayer,
): IdwResolution {
  const inputBbox = pointCollectionBbox(inputLayer.points);
  const geographic = Boolean(inputBbox && isLikelyLonLatBbox(inputBbox));
  const shouldConvertCellSize = geographic && inputBbox ? shouldTreatIdwValueAsMeters(requestedCellSize, inputBbox) : false;
  const shouldConvertRadius = geographic && inputBbox && requestedRadius > 0
    ? shouldTreatIdwValueAsMeters(requestedRadius, inputBbox)
    : false;
  const cellSize = shouldConvertCellSize && inputBbox
    ? metersToApproxDegrees(requestedCellSize, inputBbox)
    : requestedCellSize;
  const radius = shouldConvertRadius && inputBbox
    ? metersToApproxDegrees(requestedRadius, inputBbox)
    : requestedRadius;
  const estimatedRasterSize = inputBbox ? estimateRasterSize(inputBbox, cellSize) : null;

  if (estimatedRasterSize && estimatedRasterSize.cells > maxIdwOutputCells) {
    throw new Error(
      `IDW 输出栅格预计为 ${estimatedRasterSize.width} x ${estimatedRasterSize.height}，像元过多。请调大输出像元大小。`,
    );
  }

  const note = shouldConvertCellSize
    ? `${requestedCellSize} 米约 ${formatIdwNumber(cellSize)} 度`
    : '';

  return {
    cellSize,
    radius,
    cellSizeUnit: geographic ? (shouldConvertCellSize ? 'meters' : 'degrees') : 'map_units',
    radiusUnit: geographic ? (shouldConvertRadius ? 'meters' : 'degrees') : 'map_units',
    inputBbox,
    estimatedRasterSize,
    note,
  };
}

function pointCollectionBbox(points: PointCollection): [number, number, number, number] | null {
  if (points.features.length === 0) {
    return null;
  }

  return points.features.reduce(
    (bounds, feature) => {
      const [x, y] = feature.geometry.coordinates;

      return [
        Math.min(bounds[0], x),
        Math.min(bounds[1], y),
        Math.max(bounds[2], x),
        Math.max(bounds[3], y),
      ] as [number, number, number, number];
    },
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );
}

function isLikelyLonLatBbox(bbox: [number, number, number, number]) {
  return bbox[0] >= -180
    && bbox[2] <= 180
    && bbox[1] >= -90
    && bbox[3] <= 90
    && bbox[0] <= bbox[2]
    && bbox[1] <= bbox[3];
}

function shouldTreatIdwValueAsMeters(value: number, bbox: [number, number, number, number]) {
  const degreeExtent = Math.max(Math.abs(bbox[2] - bbox[0]), Math.abs(bbox[3] - bbox[1]));

  return value > degreeExtent;
}

function metersToApproxDegrees(meters: number, bbox: [number, number, number, number]) {
  const centerLatitude = (bbox[1] + bbox[3]) / 2;
  const metersPerLatitudeDegree = 111_320;
  const metersPerLongitudeDegree = Math.max(
    metersPerLatitudeDegree * Math.cos(centerLatitude * Math.PI / 180),
    1,
  );
  const metersPerDegree = Math.sqrt(metersPerLatitudeDegree * metersPerLongitudeDegree);

  return meters / metersPerDegree;
}

function estimateRasterSize(bbox: [number, number, number, number], cellSize: number) {
  const width = Math.max(1, Math.ceil(Math.abs(bbox[2] - bbox[0]) / cellSize));
  const height = Math.max(1, Math.ceil(Math.abs(bbox[3] - bbox[1]) / cellSize));

  return {
    width,
    height,
    cells: width * height,
  };
}

function formatIdwNumber(value: number) {
  return Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : String(value);
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
