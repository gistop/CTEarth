import type { BasemapId } from './basemapOptions';
import type { CesiumImageryId } from './cesiumLayerOptions';

export type BasemapSourceKind = 'basemap' | 'imagery';
export type RasterTileScheme = 'xyz' | 'tms';

export type RasterBasemapTileDefinition = {
  suffix: string;
  attribution: string;
  url?: string;
  urls?: string[];
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  scheme?: RasterTileScheme;
};

const TIANDITU_TOKEN = 'fa7482bbcd44e52cb5fb76cde5e7c83e';

export const rasterBasemapLayerDefinitions: Record<BasemapId, RasterBasemapTileDefinition[]> = {
  osm: [{
    suffix: 'osm',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileSize: 256,
    attribution: 'OpenStreetMap contributors',
  }],
  tianditu: [
    {
      suffix: 'tianditu-vec',
      urls: createTiandituTiles('vec'),
      tileSize: 256,
      attribution: 'Tianditu',
    },
    {
      suffix: 'tianditu-cva',
      urls: createTiandituTiles('cva'),
      tileSize: 256,
      attribution: 'Tianditu',
    },
  ],
  esri: [{
    suffix: 'esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    attribution: 'Tiles Esri',
  }],
};

export const rasterImageryLayerDefinitions: Record<CesiumImageryId, RasterBasemapTileDefinition[]> = {
  ionBingAerial: [{
    suffix: 'ion-bing-aerial',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    attribution: 'Tiles Esri',
  }],
  ionBingAerialLabels: [{
    suffix: 'ion-bing-aerial-labels',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    attribution: 'Tiles Esri',
  }],
  ionBingRoads: [{
    suffix: 'ion-bing-roads',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileSize: 256,
    attribution: 'OpenStreetMap contributors',
  }],
  ionSentinel2: [{
    suffix: 'ion-sentinel-2',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
    tileSize: 256,
    attribution: 'Sentinel-2 cloudless by EOX IT Services GmbH',
  }],
  ionBlueMarble: [{
    suffix: 'ion-blue-marble',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    tileSize: 256,
    maxZoom: 8,
    attribution: 'NASA Global Imagery Browse Services',
  }],
  ionEarthAtNight: [{
    suffix: 'ion-earth-at-night',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/2012-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    tileSize: 256,
    maxZoom: 8,
    attribution: 'NASA Global Imagery Browse Services',
  }],
  ionNaturalEarthII: [{
    suffix: 'ion-natural-earth-ii',
    url: '/cesium/Assets/Textures/NaturalEarthII/{z}/{x}/{y}.jpg',
    tileSize: 256,
    maxZoom: 5,
    scheme: 'tms',
    attribution: 'Natural Earth II',
  }],
  arcgisWorldImagery: [{
    suffix: 'arcgis-world-imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    attribution: 'Tiles Esri',
  }],
  arcgisWorldHillshade: [{
    suffix: 'arcgis-world-hillshade',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    attribution: 'Tiles Esri',
  }],
  arcgisWorldOcean: [{
    suffix: 'arcgis-world-ocean',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    attribution: 'Tiles Esri',
  }],
  openStreetMap: [{
    suffix: 'open-street-map',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileSize: 256,
    attribution: 'OpenStreetMap contributors',
  }],
  stamenWatercolor: [{
    suffix: 'stamen-watercolor',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg',
    tileSize: 256,
    maxZoom: 16,
    attribution: 'Stadia Maps, Stamen Design',
  }],
  stamenToner: [{
    suffix: 'stamen-toner',
    url: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png',
    tileSize: 256,
    maxZoom: 20,
    attribution: 'Stadia Maps, Stamen Design',
  }],
  alidadeSmooth: [{
    suffix: 'alidade-smooth',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png',
    tileSize: 256,
    maxZoom: 20,
    attribution: 'Stadia Maps',
  }],
  alidadeSmoothDark: [{
    suffix: 'alidade-smooth-dark',
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png',
    tileSize: 256,
    maxZoom: 20,
    attribution: 'Stadia Maps',
  }],
};

export function getRasterBasemapDefinitions(
  sourceKind: BasemapSourceKind | undefined,
  basemapId: BasemapId | undefined,
  imageryId: CesiumImageryId | undefined,
) {
  if (sourceKind === 'imagery' && imageryId) {
    return rasterImageryLayerDefinitions[imageryId];
  }

  return rasterBasemapLayerDefinitions[basemapId ?? 'osm'];
}

function createTiandituTiles(layer: 'vec' | 'cva') {
  return Array.from(
    { length: 8 },
    (_, index) => (
      `https://t${index}.tianditu.gov.cn/${layer}_w/wmts?` +
      `SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
      `&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}` +
      `&tk=${TIANDITU_TOKEN}`
    ),
  );
}
