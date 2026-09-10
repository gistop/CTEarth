import type { MapGroupRenderEntry } from '../../../mapGroupRenderState';
import { getRasterBasemapDefinitions } from '../../../components/map/rasterBasemapSources';
import type { CesiumNamespace, CesiumViewer } from '../../../components/map/cesiumRuntime';
import type { LayerEngineAdapter } from './layerAdapterTypes';

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
};

export type CesiumLayerSyncRequest = {
  viewer: CesiumViewer;
  Cesium: CesiumNamespace;
  isActive: () => boolean;
  entries: MapGroupRenderEntry[];
  layerVisibility: { basemap: boolean; raster: boolean; vectorOverlay: boolean };
  raster: {
    id: string;
    imageUrl: string;
    coordinates: [[number, number], [number, number], [number, number], [number, number]];
  } | null;
  rasterLayerVisibility: Record<string, boolean>;
  rasterStyle: { opacity: number };
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
  raster,
  rasterLayerVisibility,
  rasterStyle,
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

  entries.forEach((entry) => {
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

  if (raster && (rasterLayerVisibility[raster.id] ?? layerVisibility.raster)) {
    const imageryLayer = viewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({
      url: raster.imageUrl,
      tileWidth: 256,
      tileHeight: 256,
      rectangle: createCesiumRectangle(Cesium, raster.coordinates),
    })) as CesiumImageryLayerLike;

    imageryLayer.alpha = rasterStyle.opacity;
    imageryLayer.show = true;
  }

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

    const dataSource = await Cesium.GeoJsonDataSource.load(
      layer.geojson,
      createCesiumGeoJsonStyle(Cesium, uploadedLayerStyles[layer.id] ?? DEFAULT_UPLOADED_STYLE),
    ) as { show: boolean };

    if (!isActive()) {
      return;
    }

    dataSource.show = true;
    await viewer.dataSources.add(dataSource);
  }
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
