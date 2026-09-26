import type { MapGroupRenderEntry } from '../../../mapGroupRenderState';
import { getRasterBasemapDefinitions } from '../../maps/components/map/rasterBasemapSources';
import type { CesiumNamespace, CesiumViewer } from '../../maps/components/map/cesiumRuntime';
import { resolveRasterOpacity, type LayerEngineAdapter, type RasterRenderData, type RasterStyleLookup } from './layerAdapterTypes';

type CesiumImageryLayerLike = {
  alpha: number;
  show: boolean;
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: unknown[];
};

type UploadedStyle = {
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
  labelEnabled?: boolean;
  labelField?: string;
};

/** Cesium 实体的结构化访问：位置/几何/属性按需读取，字段标注时写入 position 与 label */
type CesiumEntityLike = {
  position: unknown;
  label: unknown;
  properties?: unknown;
  polygon?: { hierarchy?: { getValue(time: unknown): { positions?: unknown[] } | undefined } | undefined } | undefined;
  polyline?: { positions?: { getValue(time: unknown): unknown[] | undefined } | undefined } | undefined;
};

type CesiumDataSourceLike = {
  show: boolean;
  entities: { values: CesiumEntityLike[] };
};

export type CesiumLayerSyncRequest = {
  viewer: CesiumViewer;
  Cesium: CesiumNamespace;
  isActive: () => boolean;
  entries: MapGroupRenderEntry[];
  layerVisibility: { basemap: boolean; raster: boolean; vectorOverlay: boolean };
  rasters: RasterRenderData[];
  rasterLayerVisibility: Record<string, boolean>;
  rasterStyles: RasterStyleLookup;
  layers: { id: string; geojson: GeoJsonFeatureCollection }[];
  uploadedLayerVisibility: Record<string, boolean>;
  uploadedLayerStyles: Record<string, UploadedStyle>;
  vectorOverlay: { geojson: GeoJsonFeatureCollection } | null;
  vectorOverlayStyle: { fillColor: string; fillOpacity: number; lineColor: string; lineWidth: number };
};

const DEFAULT_UPLOADED_STYLE: UploadedStyle = {
  pointColor: '#f97316',
  pointRadius: 6,
  pointOpacity: 1,
  pointStrokeColor: '#17202a',
  pointStrokeWidth: 1.5,
  lineColor: '#f97316',
  lineWidth: 2,
  lineOpacity: 1,
  fillColor: '#f97316',
  fillOpacity: 0.22,
};

const cesiumLayerAdapter: LayerEngineAdapter<CesiumLayerSyncRequest> = {
  sync: syncCesiumLayers,
};

/** Creates the concrete Cesium adapter used to rebuild imagery and data sources. */
export function createCesiumLayerAdapter(): LayerEngineAdapter<CesiumLayerSyncRequest> {
  return cesiumLayerAdapter;
}

async function syncCesiumLayers({
  viewer,
  Cesium,
  isActive,
  entries,
  layerVisibility,
  rasters,
  rasterLayerVisibility,
  rasterStyles,
  layers,
  uploadedLayerVisibility,
  uploadedLayerStyles,
  vectorOverlay,
  vectorOverlayStyle,
}: CesiumLayerSyncRequest) {
  if (!isActive()) {
    return;
  }

  viewer.imageryLayers.removeAll(true);
  viewer.dataSources.removeAll(true);

  [...entries].reverse().forEach((entry) => {
    const raster = rasters.find((item) => entry.layerId === `raster:${item.id}`);
    if (raster && entry.visible && (rasterLayerVisibility[raster.id] ?? layerVisibility.raster)) {
      const imageryLayer = viewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({
        url: raster.imageUrl,
        tileWidth: 256,
        tileHeight: 256,
        rectangle: createCesiumRectangle(Cesium, raster.coordinates),
      })) as CesiumImageryLayerLike;
      imageryLayer.alpha = resolveRasterOpacity(rasterStyles, raster.id);
      imageryLayer.show = true;
    }
    if (!entry.basemapId || !entry.visible || !layerVisibility.basemap) {
      return;
    }

    getRasterBasemapDefinitions(entry.basemapSourceKind, entry.basemapId, entry.cesiumImageryId).forEach((definition) => {
      const provider = createCesiumImageryProvider(Cesium, definition);
      const imageryLayer = viewer.imageryLayers.addImageryProvider(provider) as CesiumImageryLayerLike;
      imageryLayer.alpha = entry.opacity ?? 1;
      imageryLayer.show = true;
    });
  });

  if (!isActive()) {
    return;
  }

  if (vectorOverlay && layerVisibility.vectorOverlay) {
    const dataSource = await Cesium.GeoJsonDataSource.load(
      vectorOverlay.geojson,
      createCesiumGeoJsonStyle(Cesium, vectorOverlayStyle),
    ) as { show: boolean };

    if (!isActive()) {
      return;
    }

    dataSource.show = true;
    await viewer.dataSources.add(dataSource);
  }

  for (const layer of layers) {
    if (!isActive()) {
      return;
    }

    if (!(uploadedLayerVisibility[layer.id] ?? true)) {
      continue;
    }

    const style = uploadedLayerStyles[layer.id] ?? DEFAULT_UPLOADED_STYLE;
    const dataSource = await Cesium.GeoJsonDataSource.load(
      layer.geojson,
      createCesiumGeoJsonStyle(Cesium, style),
    ) as CesiumDataSourceLike;

    if (!isActive()) {
      return;
    }

    applyCesiumEntityLabels(Cesium, dataSource, style);
    dataSource.show = true;
    await viewer.dataSources.add(dataSource);
  }
}

/** 按样式开启字段标注：为每个带有效属性值的实体挂 LabelGraphics，线/面取几何中心作为标注锚点 */
function applyCesiumEntityLabels(Cesium: CesiumNamespace, dataSource: CesiumDataSourceLike, style: UploadedStyle) {
  const field = style.labelField ?? '';
  if (!style.labelEnabled || !field) {
    return;
  }

  const now = Cesium.JulianDate.now();
  dataSource.entities.values.forEach(entity => {
    const text = formatCesiumLabelText(readCesiumPropertyValues(entity.properties, now)[field]);
    if (!text) {
      return;
    }

    const anchor = resolveCesiumEntityPosition(Cesium, entity, now);
    if (!anchor) {
      return;
    }

    entity.position = anchor;
    entity.label = new Cesium.LabelGraphics({
      text,
      font: '13px "Segoe UI", "Microsoft YaHei", sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#1f2933'),
      outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromAlpha(Cesium.Color.WHITE, 0.55),
      backgroundPadding: new Cesium.Cartesian2(5, 3),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
  });
}

function readCesiumPropertyValues(properties: unknown, time: unknown): Record<string, unknown> {
  const bag = properties as { getValue?: (time: unknown) => unknown } | null | undefined;

  if (!bag || typeof bag.getValue !== 'function') {
    return {};
  }

  const values = bag.getValue(time);
  return values && typeof values === 'object' ? values as Record<string, unknown> : {};
}

function formatCesiumLabelText(value: unknown) {
  if (value === null || value === undefined || typeof value === 'object') {
    return '';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  return String(value);
}

function resolveCesiumEntityPosition(Cesium: CesiumNamespace, entity: CesiumEntityLike, time: unknown) {
  const position = entity.position as { getValue?: (time: unknown) => unknown } | null | undefined;

  if (position && typeof position.getValue === 'function') {
    return position.getValue(time) ?? null;
  }

  const polygonPositions = entity.polygon?.hierarchy?.getValue(time)?.positions;
  if (Array.isArray(polygonPositions) && polygonPositions.length > 0) {
    return averageCesiumCartesians(Cesium, polygonPositions as Parameters<typeof Cesium.Cartesian3.add>[1][]);
  }

  const polylinePositions = entity.polyline?.positions?.getValue(time);
  if (Array.isArray(polylinePositions) && polylinePositions.length > 0) {
    return averageCesiumCartesians(Cesium, polylinePositions as Parameters<typeof Cesium.Cartesian3.add>[1][]);
  }

  return null;
}

function averageCesiumCartesians(Cesium: CesiumNamespace, positions: Parameters<typeof Cesium.Cartesian3.add>[1][]) {
  const sum = new Cesium.Cartesian3(0, 0, 0);
  positions.forEach(position => Cesium.Cartesian3.add(sum, position, sum));
  return Cesium.Cartesian3.divideByScalar(sum, positions.length, new Cesium.Cartesian3());
}

function createCesiumImageryProvider(
  Cesium: CesiumNamespace,
  definition: ReturnType<typeof getRasterBasemapDefinitions>[number],
) {
  if (definition.urls && definition.urls.length > 0) {
    const templateUrl = definition.urls[0]
      .replace(/\/t\d+\./, '/t{s}.')
      .replace(/\{x\}/g, '{x}')
      .replace(/\{y\}/g, '{y}')
      .replace(/\{z\}/g, '{z}');

    return new Cesium.UrlTemplateImageryProvider({
      url: templateUrl,
      subdomains: '01234567',
      tileWidth: definition.tileSize ?? 256,
      tileHeight: definition.tileSize ?? 256,
      maximumLevel: definition.maxZoom,
      minimumLevel: definition.minZoom,
    });
  }

  if (definition.scheme === 'tms' && definition.url) {
    return new Cesium.UrlTemplateImageryProvider({
      url: definition.url.replace('{y}', '{reverseY}'),
      tilingScheme: new Cesium.GeographicTilingScheme(),
      tileWidth: definition.tileSize ?? 256,
      tileHeight: definition.tileSize ?? 256,
      maximumLevel: definition.maxZoom,
      minimumLevel: definition.minZoom,
    });
  }

  if (definition.url) {
    return new Cesium.UrlTemplateImageryProvider({
      url: definition.url,
      tileWidth: definition.tileSize ?? 256,
      tileHeight: definition.tileSize ?? 256,
      maximumLevel: definition.maxZoom,
      minimumLevel: definition.minZoom,
    });
  }

  return new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
  });
}

function createCesiumRectangle(
  Cesium: CesiumNamespace,
  coordinates: [[number, number], [number, number], [number, number], [number, number]],
) {
  const bounds = coordinates.reduce(
    (current, [lon, lat]) => [
      Math.min(current[0], lon),
      Math.min(current[1], lat),
      Math.max(current[2], lon),
      Math.max(current[3], lat),
    ] as [number, number, number, number],
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );

  return Cesium.Rectangle.fromDegrees(bounds[0], bounds[1], bounds[2], bounds[3]);
}

function createCesiumGeoJsonStyle(
  Cesium: CesiumNamespace,
  style: {
    fillColor?: string;
    fillOpacity?: number;
    lineColor?: string;
    lineWidth?: number;
    pointColor?: string;
    pointOpacity?: number;
    pointStrokeColor?: string;
    pointStrokeWidth?: number;
  },
) {
  return {
    clampToGround: true,
    stroke: Cesium.Color.fromCssColorString(style.lineColor ?? '#2f6da5'),
    strokeWidth: style.lineWidth ?? 2,
    fill: Cesium.Color.fromAlpha(
      Cesium.Color.fromCssColorString(style.fillColor ?? '#6b9bd2'),
      style.fillOpacity ?? 0.22,
    ),
    markerColor: Cesium.Color.fromCssColorString(style.pointColor ?? '#f97316'),
    markerSize: Math.max(Math.round((style.pointOpacity ?? 1) * 14), 8),
    outlineColor: Cesium.Color.fromCssColorString(style.pointStrokeColor ?? '#ffffff'),
    outlineWidth: style.pointStrokeWidth ?? 1,
  };
}
