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
import { transform } from 'ol/proj.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import type { Coordinate } from 'ol/coordinate.js';
import type { BasemapId, DisplayCrsId } from './MapCommandContext';
import { defaultUploadedLayerStyle, useGis } from '../../gisStore';
import { OpenLayersFeatureIdentify } from './OpenLayersFeatureIdentify';

const CHINA_CENTER: [number, number] = [104.1954, 35.8617];
const CHINA_ZOOM = 3.6;
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
  const baseLayersRef = useRef<Record<BasemapId, TileLayer<OSM | XYZ>> | null>(null);
  const {
    basemapStyle,
    layerVisibility,
    layers,
    raster,
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

    const baseLayers = createBaseLayers(basemap);
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
        baseLayers.osm,
        baseLayers.tianditu,
        baseLayers.esri,
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

    map.on('pointermove', (event) => {
      const coordinate = event.coordinate as Coordinate;
      onCoordinateChange(formatProjectionCoordinate(coordinate, displayCrs));
    });

    baseLayersRef.current = baseLayers;
    rasterLayerRef.current = rasterLayer;
    mapRef.current = map;
    setMapInstance(map);

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
      setMapInstance(null);
      baseLayersRef.current = null;
      rasterLayerRef.current = null;
    };
  }, [displayCrs, initialCenter, onCoordinateChange, projectionCode]);

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
    const baseLayers = baseLayersRef.current;

    if (!baseLayers) {
      return;
    }

    Object.entries(baseLayers).forEach(([id, layer]) => {
      layer.setVisible(id === basemap && layerVisibility.basemap);
      layer.setOpacity(basemapStyle.opacity);
    });
  }, [basemap, basemapStyle.opacity, layerVisibility.basemap]);

  useEffect(() => {
    const layer = rasterLayerRef.current;

    if (!layer) {
      return;
    }

    layer.setOpacity(rasterStyle.opacity);
    layer.setVisible(Boolean(raster && layerVisibility.raster));

    if (!raster) {
      layer.setSource(null);
      return;
    }

    layer.setSource(new ImageStatic({
      imageExtent: rasterExtent(raster.coordinates, projectionCode),
      projection: projectionCode,
      url: raster.imageUrl,
    }));
  }, [layerVisibility.raster, projectionCode, raster, rasterStyle.opacity]);

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

function createBaseLayers(activeBasemap: BasemapId): Record<BasemapId, TileLayer<OSM | XYZ>> {
  return {
    osm: new TileLayer({
      source: new OSM({ attributions: 'OpenStreetMap contributors' }),
      visible: activeBasemap === 'osm',
    }),
    tianditu: new TileLayer({
      source: new XYZ({
        urls: createTiandituTiles('vec'),
        attributions: 'Tianditu',
      }),
      visible: activeBasemap === 'tianditu',
    }),
    esri: new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles Esri',
      }),
      visible: activeBasemap === 'esri',
    }),
  };
}

function createTiandituTiles(layer: 'vec') {
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
