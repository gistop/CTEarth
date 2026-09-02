export type CesiumImageryId =
  | 'ionBingAerial'
  | 'ionBingAerialLabels'
  | 'ionBingRoads'
  | 'ionSentinel2'
  | 'ionBlueMarble'
  | 'ionEarthAtNight'
  | 'ionNaturalEarthII'
  | 'arcgisWorldImagery'
  | 'arcgisWorldHillshade'
  | 'arcgisWorldOcean'
  | 'openStreetMap'
  | 'stamenWatercolor'
  | 'stamenToner'
  | 'alidadeSmooth'
  | 'alidadeSmoothDark';

export type CesiumTerrainId = 'ellipsoid' | 'worldTerrain';

export type CesiumLayerNamespace = {
  ArcGisBaseMapType: {
    SATELLITE: unknown;
    OCEANS: unknown;
    HILLSHADE: unknown;
  };
  ArcGisMapServerImageryProvider: {
    fromBasemapType: (style: unknown, options?: Record<string, unknown>) => Promise<unknown>;
  };
  EllipsoidTerrainProvider: new (options?: Record<string, unknown>) => unknown;
  GeographicTilingScheme: new () => unknown;
  IonImageryProvider: {
    fromAssetId: (assetId: number, options?: Record<string, unknown>) => Promise<unknown>;
  };
  IonWorldImageryStyle: {
    AERIAL: unknown;
    AERIAL_WITH_LABELS: unknown;
    ROAD: unknown;
  };
  OpenStreetMapImageryProvider: new (options: { url: string }) => unknown;
  UrlTemplateImageryProvider: new (options: Record<string, unknown>) => unknown;
  buildModuleUrl: (path: string) => string;
  createWorldImageryAsync: (options?: { style?: unknown }) => Promise<unknown>;
  createWorldTerrainAsync: (options?: Record<string, unknown>) => Promise<unknown>;
};

export const cesiumImageryGroups = [
  {
    title: 'Cesium ion',
    options: [
      { id: 'ionBingAerial' as const, label: 'Bing Maps Aerial' },
      { id: 'ionBingAerialLabels' as const, label: 'Bing Maps Aerial with Labels' },
      { id: 'ionBingRoads' as const, label: 'Bing Maps Roads' },
      { id: 'ionSentinel2' as const, label: 'Sentinel-2' },
      { id: 'ionBlueMarble' as const, label: 'Blue Marble' },
      { id: 'ionEarthAtNight' as const, label: 'Earth at Night' },
      { id: 'ionNaturalEarthII' as const, label: 'Natural Earth II' },
    ],
  },
  {
    title: 'Other',
    options: [
      { id: 'arcgisWorldImagery' as const, label: 'ArcGIS World Imagery' },
      { id: 'arcgisWorldHillshade' as const, label: 'ArcGIS World Hillshade' },
      { id: 'arcgisWorldOcean' as const, label: 'Esri World Ocean' },
      { id: 'openStreetMap' as const, label: 'OpenStreetMap' },
      { id: 'stamenWatercolor' as const, label: 'Stadia x Stamen Watercolor' },
      { id: 'stamenToner' as const, label: 'Stadia x Stamen Toner' },
      { id: 'alidadeSmooth' as const, label: 'Stadia x Alidade Smooth' },
      { id: 'alidadeSmoothDark' as const, label: 'Stadia x Alidade Smooth Dark' },
    ],
  },
] as const;

export const cesiumTerrainOptions = [
  { id: 'ellipsoid' as const, label: 'WGS84 Ellipsoid' },
  { id: 'worldTerrain' as const, label: 'Cesium World Terrain' },
] as const;

export const defaultCesiumImageryId: CesiumImageryId = 'openStreetMap';
export const defaultCesiumTerrainId: CesiumTerrainId = 'ellipsoid';

export async function createCesiumImageryProvider(Cesium: CesiumLayerNamespace, imageryId: CesiumImageryId) {
  switch (imageryId) {
    case 'ionBingAerial':
      return Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL });
    case 'ionBingAerialLabels':
      return Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS });
    case 'ionBingRoads':
      return Cesium.createWorldImageryAsync({ style: Cesium.IonWorldImageryStyle.ROAD });
    case 'ionSentinel2':
      return Cesium.IonImageryProvider.fromAssetId(3954);
    case 'ionBlueMarble':
      return Cesium.IonImageryProvider.fromAssetId(3845);
    case 'ionEarthAtNight':
      return Cesium.IonImageryProvider.fromAssetId(3812);
    case 'ionNaturalEarthII':
      return new Cesium.UrlTemplateImageryProvider({
        url: `${Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')}/{z}/{x}/{reverseY}.jpg`,
        tilingScheme: new Cesium.GeographicTilingScheme(),
        maximumLevel: 5,
      });
    case 'arcgisWorldImagery':
      return Cesium.ArcGisMapServerImageryProvider.fromBasemapType(Cesium.ArcGisBaseMapType.SATELLITE);
    case 'arcgisWorldHillshade':
      return Cesium.ArcGisMapServerImageryProvider.fromBasemapType(Cesium.ArcGisBaseMapType.HILLSHADE);
    case 'arcgisWorldOcean':
      return Cesium.ArcGisMapServerImageryProvider.fromBasemapType(Cesium.ArcGisBaseMapType.OCEANS);
    case 'openStreetMap':
      return new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      });
    case 'stamenWatercolor':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg',
        tileWidth: 256,
        tileHeight: 256,
        maximumLevel: 16,
      });
    case 'stamenToner':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png',
        tileWidth: 256,
        tileHeight: 256,
        maximumLevel: 20,
      });
    case 'alidadeSmooth':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png',
        tileWidth: 256,
        tileHeight: 256,
        maximumLevel: 20,
      });
    case 'alidadeSmoothDark':
      return new Cesium.UrlTemplateImageryProvider({
        url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png',
        tileWidth: 256,
        tileHeight: 256,
        maximumLevel: 20,
      });
    default:
      return new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
      });
  }
}

export async function createCesiumTerrainProvider(Cesium: CesiumLayerNamespace, terrainId: CesiumTerrainId) {
  switch (terrainId) {
    case 'worldTerrain':
      return Cesium.createWorldTerrainAsync({
        requestVertexNormals: true,
        requestWaterMask: true,
      });
    case 'ellipsoid':
    default:
      return new Cesium.EllipsoidTerrainProvider();
  }
}
