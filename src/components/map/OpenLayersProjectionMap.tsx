import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Feature from 'ol/Feature.js';
import type { FeatureLike } from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import type Geometry from 'ol/geom/Geometry.js';
import ImageLayer from 'ol/layer/Image.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import { transform, transformExtent } from 'ol/proj.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import type { Coordinate } from 'ol/coordinate.js';
import type { BasemapId, DisplayCrsId } from './MapCommandContext';
import { defaultUploadedLayerStyle, getGeoJsonBounds, getPointBounds, useGis } from '../../gisStore';
import { OpenLayersFeatureIdentify } from './OpenLayersFeatureIdentify';
import { useMapViewport } from './MapViewportContext';
import { useMapGroupRenderState } from '../../mapGroupRenderState';

const CHINA_CENTER: [number, number] = [10.4515, 51.1657];
const CHINA_ZOOM = 5.3;
const TIANDITU_TOKEN = 'fa7482bbcd44e52cb5fb76cde5e7c83e';

type OpenLayersProjectionMapProps = {
  basemap: BasemapId;
  displayCrs: DisplayCrsId;
  identifyActive: boolean;
  onCoordinateChange: (coordinate: string) => void;
  visible: boolean;
};

export type OpenLayersProjectionMapHandle = {
  locate: () => void;
  resetNorth: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export const OpenLayersProjectionMap = forwardRef<OpenLayersProjectionMapHandle, OpenLayersProjectionMapProps>(
function OpenLayersProjectionMap({ basemap, displayCrs, identifyActive, onCoordinateChange, visible }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const [mapInstance, setMapInstance] = useState<Map | null>(null);
  const uploadedSourceRef = useRef(new VectorSource<Feature<Geometry>>());
  const vectorOverlaySourceRef = useRef(new VectorSource<Feature<Geometry>>());
  const rasterLayerRef = useRef<ImageLayer<ImageStatic> | null>(null);
  const vectorOverlayLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const uploadedLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const basemapLayersRef = useRef(new globalThis.Map<string, TileLayer<OSM | XYZ>>());
  const { viewportBounds4326, setViewportBounds4326 } = useMapViewport();
  const initialViewportBoundsRef = useRef(viewportBounds4326);
  const mapGroupRenderState = useMapGroupRenderState();
  const {
    layerZoomRequest,
    layerVisibility,
    layers,
    raster,
    rasterLayerVisibility,
    rasterZoomRequest,
    rasterStyle,
    uploadedLayerStyles,
    uploadedLayerVisibility,
    vectorOverlay,
    vectorOverlayStyle,
  } = useGis();
  const projectionCode = projectionCodeForDisplayCrs(displayCrs);
  const initialCenter = useMemo(
    () => transform(CHINA_CENTER, 'EPSG:4326', projectionCode),
    [projectionCode],
  );

  useImperativeHandle(ref, () => ({
    locate: () => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      const view = map.getView();
      view.setCenter(transform(CHINA_CENTER, 'EPSG:4326', projectionCode));
      view.setZoom(CHINA_ZOOM);
      view.setRotation(0);
    },
    resetNorth: () => {
      mapRef.current?.getView().setRotation(0);
    },
    zoomIn: () => zoomOpenLayersByDelta(mapRef.current, 1),
    zoomOut: () => zoomOpenLayersByDelta(mapRef.current, -1),
  }), [projectionCode]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || mapRef.current) {
      return;
    }

    const rasterLayer = new ImageLayer<ImageStatic>({
      opacity: rasterStyle.opacity,
      visible: false,
    });
    const vectorOverlayLayer = new VectorLayer({
      source: vectorOverlaySourceRef.current,
      style: createVectorOverlayStyle,
    });
    const uploadedLayer = new VectorLayer({
      source: uploadedSourceRef.current,
      style: createUploadedStyle,
    });
    const map = new Map({
      target: container,
      controls: defaultControls({ zoom: false }),
      layers: [
        rasterLayer,
        vectorOverlayLayer,
        uploadedLayer,
      ],
      view: new View({
        center: initialCenter,
        projection: projectionCode,
        zoom: CHINA_ZOOM,
        minZoom: 1,
        maxZoom: 18,
      }),
    });

    map.on('moveend', () => {
      const bounds = openLayersMapToLonLatExtent(map, projectionCode);

      if (bounds) {
        setViewportBounds4326(bounds);
      }
    });
    map.on('pointermove', (event) => {
      const coordinate = event.coordinate as Coordinate;
      onCoordinateChange(formatProjectionCoordinate(coordinate, displayCrs));
    });

    const initialViewportBounds = initialViewportBoundsRef.current;

    if (initialViewportBounds) {
      requestAnimationFrame(() => {
        if (fitOpenLayersToViewportBounds(map, initialViewportBounds, projectionCode)) {
          const bounds = openLayersMapToLonLatExtent(map, projectionCode);

          if (bounds) {
            setViewportBounds4326(bounds);
          }
        }
      });
    }

    rasterLayerRef.current = rasterLayer;
    vectorOverlayLayerRef.current = vectorOverlayLayer;
    uploadedLayerRef.current = uploadedLayer;
    mapRef.current = map;
    setMapInstance(map);

    return () => {
      const bounds = openLayersMapToLonLatExtent(map, projectionCode);

      if (bounds) {
        setViewportBounds4326(bounds);
      }

      map.setTarget(undefined);
      mapRef.current = null;
      setMapInstance(null);
      basemapLayersRef.current.forEach((layer) => {
        map.removeLayer(layer);
      });
      basemapLayersRef.current.clear();
      rasterLayerRef.current = null;
      vectorOverlayLayerRef.current = null;
      uploadedLayerRef.current = null;
    };
  }, [displayCrs, initialCenter, onCoordinateChange, projectionCode, setViewportBounds4326]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (visible) {
      requestAnimationFrame(() => {
        map.updateSize();
      });
    }
  }, [visible]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const expectedIds = new Set<string>();

    mapGroupRenderState.entries.forEach((entry) => {
      const basemapId = entry.basemapId;

      if (!basemapId) {
        return;
      }

      openLayersBasemapLayerDefinitions[basemapId].forEach((definition) => {
        const layerId = getOpenLayersBasemapLayerId(entry.id, definition.suffix);
        expectedIds.add(layerId);

        let layer = basemapLayersRef.current.get(layerId);

        if (!layer) {
          layer = createOpenLayersBasemapLayer(basemapId, definition.suffix);
          map.addLayer(layer);
          basemapLayersRef.current.set(layerId, layer);
        } else {
          layer.setSource(createOpenLayersBasemapSource(basemapId, definition.suffix));
        }

        layer.setVisible(entry.visible);
        layer.setOpacity(entry.opacity ?? 1);
      });
    });

    basemapLayersRef.current.forEach((layer, layerId) => {
      if (expectedIds.has(layerId)) {
        return;
      }

      map.removeLayer(layer);
      basemapLayersRef.current.delete(layerId);
    });
  }, [mapGroupRenderState.entries]);

  useEffect(() => {
    const layer = rasterLayerRef.current;

    if (!layer) {
      return;
    }

    const isRasterVisible = Boolean(raster && (rasterLayerVisibility[raster.id] ?? layerVisibility.raster));

    layer.setOpacity(rasterStyle.opacity);
    layer.setVisible(isRasterVisible);

    if (!raster) {
      layer.setSource(null);
      return;
    }

    layer.setSource(new ImageStatic({
      imageExtent: rasterExtent(raster.coordinates, projectionCode),
      projection: projectionCode,
      url: raster.imageUrl,
    }));
  }, [layerVisibility.raster, projectionCode, raster, rasterLayerVisibility, rasterStyle.opacity]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !raster || !rasterZoomRequest || rasterZoomRequest.rasterId !== raster.id) {
      return;
    }

    const bounds = rasterBoundsFromCoordinates(raster.coordinates);

    if (!fitOpenLayersToViewportBounds(map, bounds, projectionCode)) {
      return;
    }

    const nextBounds = openLayersMapToLonLatExtent(map, projectionCode);

    if (nextBounds) {
      setViewportBounds4326(nextBounds);
    }
  }, [projectionCode, raster, rasterZoomRequest, setViewportBounds4326]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !layerZoomRequest) {
      return;
    }

    const targetLayer = layers.find((item) => item.id === layerZoomRequest.layerId);

    if (!targetLayer) {
      return;
    }

    const bounds = targetLayer.points.features.length > 0
      ? getPointBounds(targetLayer.points.features)
      : getGeoJsonBounds(targetLayer.geojson);

    if (!bounds || !fitOpenLayersToLayerBounds(map, bounds, projectionCode)) {
      return;
    }

    const nextBounds = openLayersMapToLonLatExtent(map, projectionCode);

    if (nextBounds) {
      setViewportBounds4326(nextBounds);
    }
  }, [layerZoomRequest, layers, projectionCode, setViewportBounds4326]);

  useEffect(() => {
    const source = uploadedSourceRef.current;
    const format = new GeoJSON();

    source.clear();

    layers.forEach((item) => {
      if (!(uploadedLayerVisibility[item.id] ?? true)) {
        return;
      }

      const features = format.readFeatures(item.geojson as object, {
        dataProjection: 'EPSG:4326',
        featureProjection: projectionCode,
      }) as Feature<Geometry>[];

      features.forEach((feature, index) => {
        feature.setProperties({
          _featureIndex: index,
          _layerId: item.id,
          _selected: item.selectedFeatureIndexes.includes(index),
          _style: uploadedLayerStyles[item.id] ?? defaultUploadedLayerStyle,
        });
      });
      source.addFeatures(features);
    });
  }, [layers, projectionCode, uploadedLayerStyles, uploadedLayerVisibility]);

  useEffect(() => {
    const source = vectorOverlaySourceRef.current;
    const format = new GeoJSON();

    source.clear();

    if (!vectorOverlay || !layerVisibility.vectorOverlay) {
      return;
    }

    const features = format.readFeatures(vectorOverlay.geojson as object, {
      dataProjection: 'EPSG:4326',
      featureProjection: projectionCode,
    }) as Feature<Geometry>[];

    features.forEach((feature) => {
      feature.set('_bufferStyle', vectorOverlayStyle);
    });
    source.addFeatures(features);
  }, [layerVisibility.vectorOverlay, projectionCode, vectorOverlay, vectorOverlayStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const zIndexByEntryId = new globalThis.Map<string, number>();
    const topZIndex = mapGroupRenderState.entries.length;
    let uploadedZIndex = 0;
    let basemapZIndex = 0;

    mapGroupRenderState.entries.forEach((entry, index) => {
      zIndexByEntryId.set(entry.id, topZIndex - index);
    });

    mapGroupRenderState.entries.forEach((entry) => {
      const basemapId = entry.basemapId;
      const entryZIndex = zIndexByEntryId.get(entry.id) ?? 0;

      if (!basemapId) {
        if (entry.layerId.startsWith('uploaded:')) {
          uploadedZIndex = Math.max(uploadedZIndex, entryZIndex);
        }

        return;
      }

      basemapZIndex = Math.max(basemapZIndex, entryZIndex);

      openLayersBasemapLayerDefinitions[basemapId].forEach((definition) => {
        basemapLayersRef.current.get(getOpenLayersBasemapLayerId(entry.id, definition.suffix))?.setZIndex(entryZIndex);
      });
    });

    uploadedLayerRef.current?.setZIndex(uploadedZIndex || topZIndex + 1);
    rasterLayerRef.current?.setZIndex(zIndexByEntryId.get(raster ? `raster:${raster.id}` : '') ?? 0);
    vectorOverlayLayerRef.current?.setZIndex(zIndexByEntryId.get('vectorOverlay') ?? 0);

    void basemapZIndex;
  }, [mapGroupRenderState.entries, raster, vectorOverlay]);

  return (
    <>
      <div
        className={`openlayers-projection-map${visible ? ' is-visible' : ''}`}
        ref={containerRef}
        aria-hidden={!visible}
      />
      <OpenLayersFeatureIdentify active={identifyActive && visible} map={mapInstance} />
    </>
  );
});

const openLayersBasemapLayerDefinitions: Record<BasemapId, { suffix: string; createSource: () => OSM | XYZ }[]> = {
  osm: [{
    suffix: 'osm',
    createSource: () => new OSM({ attributions: 'OpenStreetMap contributors' }),
  }],
  tianditu: [
    {
      suffix: 'tianditu-vec',
      createSource: () => new XYZ({
        urls: createTiandituTiles('vec'),
        attributions: 'Tianditu',
      }),
    },
    {
      suffix: 'tianditu-cva',
      createSource: () => new XYZ({
        urls: createTiandituTiles('cva'),
        attributions: 'Tianditu',
      }),
    },
  ],
  esri: [{
    suffix: 'esri',
    createSource: () => new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Tiles Esri',
    }),
  }],
};

function createOpenLayersBasemapLayer(basemapId: BasemapId, suffix: string) {
  return new TileLayer({
    source: createOpenLayersBasemapSource(basemapId, suffix),
    visible: false,
  });
}

function createOpenLayersBasemapSource(basemapId: BasemapId, suffix: string) {
  const definition = openLayersBasemapLayerDefinitions[basemapId].find((item) => item.suffix === suffix);

  return definition?.createSource() ?? new OSM({ attributions: 'OpenStreetMap contributors' });
}

function getOpenLayersBasemapLayerId(renderId: string, suffix: string) {
  return `projection-basemap-${sanitizeOpenLayersLayerId(renderId)}-${suffix}`;
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

function sanitizeOpenLayersLayerId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function zoomOpenLayersByDelta(map: Map | null, delta: number) {
  if (!map) {
    return;
  }

  const view = map.getView();
  view.setZoom((view.getZoom() ?? CHINA_ZOOM) + delta);
}

function rasterExtent(
  coordinates: [[number, number], [number, number], [number, number], [number, number]],
  projectionCode: string,
) {
  const projected = coordinates.map((coordinate) => transform(coordinate, 'EPSG:4326', projectionCode));
  const xs = projected.map((coordinate) => coordinate[0]);
  const ys = projected.map((coordinate) => coordinate[1]);

  return [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
}

function rasterBoundsFromCoordinates(
  coordinates: [[number, number], [number, number], [number, number], [number, number]],
): [number, number, number, number] {
  const bounds = coordinates.reduce(
    (current, [lon, lat]) => [
      Math.min(current[0], lon),
      Math.min(current[1], lat),
      Math.max(current[2], lon),
      Math.max(current[3], lat),
    ] as [number, number, number, number],
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );

  return bounds;
}

function openLayersMapToLonLatExtent(map: Map, projectionCode: string): [number, number, number, number] | null {
  const size = map.getSize();

  if (!size) {
    return null;
  }

  const extent = transformExtent(
    map.getView().calculateExtent(size),
    projectionCode,
    'EPSG:4326',
  );

  if (!extent.every(Number.isFinite)) {
    return null;
  }

  return extent as [number, number, number, number];
}

function fitOpenLayersToViewportBounds(
  map: Map,
  bounds: [number, number, number, number],
  projectionCode: string,
) {
  if (!bounds.every(Number.isFinite) || bounds[0] > bounds[2] || bounds[1] > bounds[3]) {
    return false;
  }

  const size = map.getSize();
  const extent = transformExtent(bounds, 'EPSG:4326', projectionCode);

  if (!extent.every(Number.isFinite)) {
    return false;
  }

  map.getView().fit(extent, {
    nearest: false,
    padding: [48, 48, 48, 48],
    size,
  });
  map.getView().setRotation(0);

  return true;
}

function fitOpenLayersToLayerBounds(
  map: Map,
  bounds: [number, number, number, number],
  projectionCode: string,
) {
  const paddedBounds = padLonLatBounds(bounds, 0.14);

  return paddedBounds ? fitOpenLayersToViewportBounds(map, paddedBounds, projectionCode) : false;
}

function padLonLatBounds(bounds: [number, number, number, number], ratio: number): [number, number, number, number] | null {
  const [minLon, minLat, maxLon, maxLat] = bounds;

  if (!bounds.every(Number.isFinite) || minLon > maxLon || minLat > maxLat || minLat < -90 || maxLat > 90) {
    return null;
  }

  const lonPad = Math.max((maxLon - minLon) * ratio, 0.01);
  const latPad = Math.max((maxLat - minLat) * ratio, 0.01);

  return [
    minLon - lonPad,
    clampLatitude(minLat - latPad),
    maxLon + lonPad,
    clampLatitude(maxLat + latPad),
  ];
}

function clampLatitude(value: number) {
  return Math.max(-90, Math.min(90, value));
}

function projectionCodeForDisplayCrs(displayCrs: DisplayCrsId) {
  if (displayCrs === 'epsg32651') {
    return 'EPSG:32651';
  }

  return 'EPSG:4326';
}

function formatProjectionCoordinate(coordinate: Coordinate, displayCrs: DisplayCrsId) {
  if (displayCrs === 'epsg32651') {
    return `${coordinate[0].toFixed(2)}, ${coordinate[1].toFixed(2)} m`;
  }

  return `${coordinate[0].toFixed(5)}, ${coordinate[1].toFixed(5)}`;
}

function createUploadedStyle(feature: FeatureLike) {
  const uploadedStyle = feature.get('_style') as typeof defaultUploadedLayerStyle | undefined;
  const selected = Boolean(feature.get('_selected'));

  return new Style({
    fill: new Fill({
      color: hexToRgba(uploadedStyle?.fillColor ?? defaultUploadedLayerStyle.fillColor, uploadedStyle?.fillOpacity ?? defaultUploadedLayerStyle.fillOpacity),
    }),
    stroke: new Stroke({
      color: selected ? '#f97316' : uploadedStyle?.lineColor ?? defaultUploadedLayerStyle.lineColor,
      width: selected ? 3.5 : uploadedStyle?.lineWidth ?? defaultUploadedLayerStyle.lineWidth,
    }),
    image: new CircleStyle({
      radius: selected ? 8 : uploadedStyle?.pointRadius ?? defaultUploadedLayerStyle.pointRadius,
      fill: new Fill({ color: selected ? '#f97316' : uploadedStyle?.pointColor ?? defaultUploadedLayerStyle.pointColor }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
  });
}

function createVectorOverlayStyle(feature: FeatureLike) {
  const bufferStyle = feature.get('_bufferStyle') as { fillColor: string; fillOpacity: number; lineColor: string; lineWidth: number } | undefined;

  return new Style({
    fill: new Fill({ color: hexToRgba(bufferStyle?.fillColor ?? '#31a354', bufferStyle?.fillOpacity ?? 0.28) }),
    stroke: new Stroke({
      color: bufferStyle?.lineColor ?? '#16753b',
      width: bufferStyle?.lineWidth ?? 2,
    }),
  });
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace('#', '');
  const bigint = Number.parseInt(normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized, 16);

  if (!Number.isFinite(bigint)) {
    return `rgba(47, 109, 165, ${opacity})`;
  }

  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}
