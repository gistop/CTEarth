import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import Feature from 'ol/Feature.js';
import type { FeatureLike } from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Select from 'ol/interaction/Select.js';
import Snap from 'ol/interaction/Snap.js';
import ImageLayer from 'ol/layer/Image.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import type { Coordinate } from 'ol/coordinate.js';
import type Geometry from 'ol/geom/Geometry.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import Polygon from 'ol/geom/Polygon.js';
import type { BasemapId } from '../map/MapCommandContext';
import { displayLayerName, defaultUploadedLayerStyle, useGis, type GeoJsonFeatureCollection } from '../../gisStore';
import { useDigitize } from './DigitizeContext';

const CHINA_CENTER: [number, number] = [104.1954, 35.8617];
const CHINA_ZOOM = 3.6;
const TIANDITU_TOKEN = 'fa7482bbcd44e52cb5fb76cde5e7c83e';

type OpenLayersDigitizeMapProps = {
  basemap: BasemapId;
  mapLibreMap: maplibregl.Map | null;
  visible: boolean;
};

export type OpenLayersDigitizeMapHandle = {
  locate: () => void;
  resetNorth: () => void;
  syncFromMapLibre: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export const OpenLayersDigitizeMap = forwardRef<OpenLayersDigitizeMapHandle, OpenLayersDigitizeMapProps>(
function OpenLayersDigitizeMap({ basemap, mapLibreMap, visible }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const selectRef = useRef<Select | null>(null);
  const editableSnapRef = useRef<Snap | null>(null);
  const referenceSnapRef = useRef<Snap | null>(null);
  const previousVisibleRef = useRef(false);
  const visibleRef = useRef(visible);
  const mapLibreMapRef = useRef(mapLibreMap);
  const isSyncingFromMapLibreRef = useRef(false);
  const isSyncingToMapLibreRef = useRef(false);
  const editableSourceRef = useRef(new VectorSource<Feature<Geometry>>());
  const rasterAoiSourceRef = useRef(new VectorSource<Feature<Geometry>>());
  const referenceSourceRef = useRef(new VectorSource<Feature<Geometry>>());
  const boundaryCacheRef = useRef<BoundaryCache | null>(null);
  const rasterLayerRef = useRef<ImageLayer<ImageStatic> | null>(null);
  const baseLayersRef = useRef<Record<BasemapId, TileLayer<OSM | XYZ>> | null>(null);
  const {
    activeLayerId,
    basemapStyle,
    layerVisibility,
    layers,
    raster,
    rasterStyle,
    uploadedLayerStyles,
    uploadedLayerVisibility,
    updateUploadedLayerGeoJson,
    vectorOverlay,
    vectorOverlayStyle,
  } = useGis();
  const digitize = useDigitize();
  const editableLayer = layers.find((item) => item.id === activeLayerId) ?? layers.at(-1) ?? null;

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    mapLibreMapRef.current = mapLibreMap;
  }, [mapLibreMap]);

  useImperativeHandle(ref, () => ({
    locate: () => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      const view = map.getView();
      view.setCenter(fromLonLat(CHINA_CENTER));
      view.setZoom(CHINA_ZOOM);
      view.setRotation(0);
      syncToMapLibreFromOpenLayers(map, mapLibreMapRef.current, isSyncingToMapLibreRef);
    },
    resetNorth: () => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      map.getView().setRotation(0);
      syncToMapLibreFromOpenLayers(map, mapLibreMapRef.current, isSyncingToMapLibreRef);
    },
    syncFromMapLibre: () => {
      const map = mapRef.current;

      if (map) {
        syncOpenLayersFromMapLibre(map, mapLibreMapRef.current, isSyncingFromMapLibreRef);
      }
    },
    zoomIn: () => zoomOpenLayersByDelta(mapRef.current, 1, mapLibreMapRef.current, isSyncingToMapLibreRef),
    zoomOut: () => zoomOpenLayersByDelta(mapRef.current, -1, mapLibreMapRef.current, isSyncingToMapLibreRef),
  }), []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || mapRef.current) {
      return;
    }

    const center = mapLibreMap?.getCenter();
    const view = new View({
      center: fromLonLat(center ? [center.lng, center.lat] : CHINA_CENTER),
      zoom: mapLibreMap?.getZoom() ?? CHINA_ZOOM,
      minZoom: 2,
      maxZoom: 18,
    });
    const baseLayers = createBaseLayers(basemap);
    const referenceLayer = new VectorLayer({
      source: referenceSourceRef.current,
      style: createReferenceStyle,
    });
    const rasterLayer = new ImageLayer<ImageStatic>({
      opacity: rasterStyle.opacity,
      visible: false,
    });
    const rasterAoiLayer = new VectorLayer({
      source: rasterAoiSourceRef.current,
      style: createRasterAoiStyle,
    });
    const editableLayer = new VectorLayer({
      source: editableSourceRef.current,
      style: createEditableStyle,
    });
    const map = new Map({
      target: container,
      controls: defaultControls({ zoom: false }),
      layers: [
        baseLayers.osm,
        baseLayers.tianditu,
        baseLayers.esri,
        rasterLayer,
        rasterAoiLayer,
        referenceLayer,
        editableLayer,
      ],
      view,
    });

    const select = new Select({ layers: [editableLayer] });
    const modify = new Modify({ source: editableSourceRef.current });
    const editableSnap = new Snap({ source: editableSourceRef.current, pixelTolerance: 14 });
    const referenceSnap = new Snap({ source: referenceSourceRef.current, pixelTolerance: 14 });

    map.addInteraction(select);
    map.addInteraction(modify);
    select.setActive(false);
    modify.setActive(false);
    modify.on('modifyend', () => {
      boundaryCacheRef.current = null;
      commitEditableLayer();
    });
    map.on('moveend', () => {
      if (!visibleRef.current || isSyncingFromMapLibreRef.current) {
        return;
      }

      syncToMapLibreFromOpenLayers(map, mapLibreMapRef.current, isSyncingToMapLibreRef);
    });

    baseLayersRef.current = baseLayers;
    rasterLayerRef.current = rasterLayer;
    mapRef.current = map;
    selectRef.current = select;
    modifyRef.current = modify;
    editableSnapRef.current = editableSnap;
    referenceSnapRef.current = referenceSnap;
    resetSnapInteractions(map, true, editableSnap, referenceSnap);
    digitize.setFeatureCount(editableSourceRef.current.getFeatures().length);

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
      boundaryCacheRef.current = null;
      drawRef.current = null;
      modifyRef.current = null;
      selectRef.current = null;
      editableSnapRef.current = null;
      referenceSnapRef.current = null;
      baseLayersRef.current = null;
      rasterLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapLibreMap || !map) {
      return;
    }

    const handleMoveEnd = () => {
      if (!visibleRef.current || isSyncingToMapLibreRef.current) {
        return;
      }

      syncOpenLayersFromMapLibre(map, mapLibreMap, isSyncingFromMapLibreRef);
    };

    mapLibreMap.on('moveend', handleMoveEnd);

    return () => {
      mapLibreMap.off('moveend', handleMoveEnd);
    };
  }, [mapLibreMap]);

  useEffect(() => {
    const source = editableSourceRef.current;
    const format = new GeoJSON();

      source.clear();
      boundaryCacheRef.current = null;

    if (!editableLayer) {
      digitize.setFeatureCount(0);
      if (!digitize.rasterAoiActive) {
        digitize.setStatus('请选择内容列表中的矢量图层作为当前编辑图层。');
      }
      return;
    }

    const features = format.readFeatures(editableLayer.geojson as object, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    }) as Feature<Geometry>[];

    features.forEach((feature, index) => {
      feature.setProperties({
        _editable: true,
        _featureIndex: index,
        _layerId: editableLayer.id,
        _selected: editableLayer.selectedFeatureIndexes.includes(index),
        _style: uploadedLayerStyles[editableLayer.id] ?? defaultUploadedLayerStyle,
      });
    });
    source.addFeatures(features);
    digitize.setFeatureCount(features.length);

    if (visible) {
      digitize.setStatus(`正在编辑图层：${displayLayerName(editableLayer.fileName)}，${features.length} 个要素。`);
    }
  }, [digitize.rasterAoiActive, editableLayer?.id, editableLayer?.geojson, editableLayer?.selectedFeatureIndexes, editableLayer?.fileName, uploadedLayerStyles, visible]);

  useEffect(() => {
    const map = mapRef.current;
    const wasVisible = previousVisibleRef.current;

    if (!map) {
      previousVisibleRef.current = visible;
      return;
    }

    if (visible) {
      requestAnimationFrame(() => {
        map.updateSize();
        syncOpenLayersFromMapLibre(map, mapLibreMap, isSyncingFromMapLibreRef);
      });
    } else if (wasVisible) {
      syncToMapLibreFromOpenLayers(map, mapLibreMap, isSyncingToMapLibreRef);
    }

    previousVisibleRef.current = visible;
  }, [mapLibreMap, visible]);

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
      imageExtent: rasterExtent(raster.coordinates),
      url: raster.imageUrl,
      projection: 'EPSG:3857',
    }));
  }, [layerVisibility.raster, raster, rasterStyle.opacity]);

  useEffect(() => {
    const source = referenceSourceRef.current;
    const format = new GeoJSON();

    source.clear();
    boundaryCacheRef.current = null;

    layers.forEach((item) => {
      if (item.id === editableLayer?.id) {
        return;
      }

      if (!(uploadedLayerVisibility[item.id] ?? true)) {
        return;
      }

      const features = format.readFeatures(item.geojson as object, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
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

    if (vectorOverlay && layerVisibility.vectorOverlay) {
      const features = format.readFeatures(vectorOverlay.geojson as object, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      }) as Feature<Geometry>[];

      features.forEach((feature) => {
        feature.set('_bufferStyle', vectorOverlayStyle);
      });
      source.addFeatures(features);
    }
  }, [editableLayer?.id, layerVisibility.vectorOverlay, layers, uploadedLayerStyles, uploadedLayerVisibility, vectorOverlay, vectorOverlayStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !visible) {
      return;
    }

    if (drawRef.current) {
      map.removeInteraction(drawRef.current);
      drawRef.current = null;
    }

    selectRef.current?.setActive(digitize.modifyEnabled);
    modifyRef.current?.setActive(digitize.modifyEnabled);

    if (digitize.rasterAoiActive) {
      const draw = new Draw({
        source: rasterAoiSourceRef.current,
        type: 'Polygon',
      });

      draw.on('drawstart', () => {
        rasterAoiSourceRef.current.clear();
        digitize.setStatus('AOI 绘制中，双击结束多边形。');
      });
      draw.on('drawend', (event) => {
        const polygon = featureToAoiPolygon(event.feature as Feature<Geometry>);

        if (!polygon) {
          digitize.setStatus('AOI 绘制失败，请重新绘制一个有效多边形。');
          return;
        }

        digitize.setRasterAoi(polygon);
      });

      drawRef.current = draw;
      map.addInteraction(draw);
      return;
    }

    if (!digitize.modifyEnabled && editableLayer) {
      const activeTool = editableLayer?.geometryType ?? digitize.activeTool;
      const draw = new Draw({
        source: editableSourceRef.current,
        type: activeTool,
      });

      draw.on('drawstart', () => {
        boundaryCacheRef.current = buildBoundaryCache([editableSourceRef.current, referenceSourceRef.current]);
        digitize.setStatus(getDrawingStatus(activeTool, digitize.traceEnabled));
      });
      draw.on('drawend', (event) => {
        const completed = activeTool === 'Polygon'
          && completePolygonWithSharedBoundary(
            event.feature as Feature<Geometry>,
            [editableSourceRef.current, referenceSourceRef.current],
            map,
            digitize.traceEnabled,
            boundaryCacheRef,
          );

        window.setTimeout(() => {
          digitize.setFeatureCount(editableSourceRef.current.getFeatures().length);
          boundaryCacheRef.current = null;
          commitEditableLayer();
        });
        digitize.setStatus(completed
          ? '面已添加，并自动补齐公共边。'
          : `${labelForTool(digitize.activeTool)}已添加，可继续绘制或切换工具。`);
      });

      drawRef.current = draw;
      map.addInteraction(draw);
      resetSnapInteractions(map, digitize.snapEnabled, editableSnapRef.current, referenceSnapRef.current);
    }
  }, [digitize.activeTool, digitize.modifyEnabled, digitize.rasterAoiActive, digitize.traceEnabled, visible, editableLayer?.geometryType, editableLayer?.id]);

  useEffect(() => {
    rasterAoiSourceRef.current.clear();
  }, [digitize.rasterAoiRevision]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    resetSnapInteractions(map, digitize.snapEnabled, editableSnapRef.current, referenceSnapRef.current);
  }, [digitize.snapEnabled]);

  useEffect(() => {
    if (digitize.clearRequestId === 0) {
      return;
    }

    editableSourceRef.current.clear();
    boundaryCacheRef.current = null;
    digitize.setFeatureCount(0);
    commitEditableLayer();
  }, [digitize.clearRequestId]);

  function commitEditableLayer() {
    if (!editableLayer) {
      return;
    }

    const format = new GeoJSON();
    const geojson = format.writeFeaturesObject(editableSourceRef.current.getFeatures(), {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    }) as GeoJsonFeatureCollection;

    updateUploadedLayerGeoJson(editableLayer.id, geojson);
  }

  return (
    <div
      className={`openlayers-digitize-map${visible ? ' is-visible' : ''}`}
      ref={containerRef}
      aria-hidden={!visible}
    />
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
        attributions: '天地图',
      }),
      visible: activeBasemap === 'tianditu',
    }),
    esri: new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles © Esri',
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

function zoomOpenLayersByDelta(
  map: Map | null,
  delta: number,
  mapLibreMap: maplibregl.Map | null,
  isSyncingToMapLibreRef: { current: boolean },
) {
  if (!map) {
    return;
  }

  const view = map.getView();
  view.setZoom((view.getZoom() ?? CHINA_ZOOM) + delta);
  syncToMapLibreFromOpenLayers(map, mapLibreMap, isSyncingToMapLibreRef);
}

function syncOpenLayersFromMapLibre(
  map: Map,
  mapLibreMap: maplibregl.Map | null,
  isSyncingFromMapLibreRef: { current: boolean },
) {
  if (!mapLibreMap) {
    return;
  }

  isSyncingFromMapLibreRef.current = true;
  fitOpenLayersToMapLibreBounds(map, mapLibreMap);
  window.setTimeout(() => {
    isSyncingFromMapLibreRef.current = false;
  });
}

function syncToMapLibreFromOpenLayers(
  map: Map,
  mapLibreMap: maplibregl.Map | null,
  isSyncingToMapLibreRef: { current: boolean },
) {
  const center = map.getView().getCenter();

  if (!mapLibreMap || !center) {
    return;
  }

  isSyncingToMapLibreRef.current = true;
  fitMapLibreToOpenLayersExtent(map, mapLibreMap);
  window.setTimeout(() => {
    isSyncingToMapLibreRef.current = false;
  });
}

function fitOpenLayersToMapLibreBounds(map: Map, mapLibreMap: maplibregl.Map) {
  const bounds = mapLibreMap.getBounds();
  const size = map.getSize();

  if (!size) {
    const center = mapLibreMap.getCenter();

    map.getView().setCenter(fromLonLat([center.lng, center.lat]));
    map.getView().setZoom(mapLibreMap.getZoom() + 1);
    map.getView().setRotation(0);
    return;
  }

  map.getView().fit(
    transformExtent([
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ], 'EPSG:4326', 'EPSG:3857'),
    {
      nearest: false,
      padding: [0, 0, 0, 0],
      size,
    },
  );
  map.getView().setRotation(0);
}

function fitMapLibreToOpenLayersExtent(map: Map, mapLibreMap: maplibregl.Map) {
  const size = map.getSize();

  if (!size) {
    const center = map.getView().getCenter();

    if (!center) {
      return;
    }

    const [lng, lat] = toLonLat(center);
    mapLibreMap.jumpTo({
      center: [lng, lat],
      zoom: (map.getView().getZoom() ?? CHINA_ZOOM + 1) - 1,
      pitch: 0,
      bearing: 0,
    });
    return;
  }

  const [west, south, east, north] = transformExtent(
    map.getView().calculateExtent(size),
    'EPSG:3857',
    'EPSG:4326',
  );

  mapLibreMap.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      duration: 0,
      padding: 0,
    },
  );
  mapLibreMap.jumpTo({ pitch: 0, bearing: 0 });
}

function rasterExtent(coordinates: [[number, number], [number, number], [number, number], [number, number]]) {
  const projected = coordinates.map((coordinate) => fromLonLat(coordinate));
  const xs = projected.map((coordinate) => coordinate[0]);
  const ys = projected.map((coordinate) => coordinate[1]);

  return transformExtent([
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ], 'EPSG:3857', 'EPSG:3857');
}

function createReferenceStyle(feature: FeatureLike) {
  const bufferStyle = feature.get('_bufferStyle') as { fillColor: string; fillOpacity: number; lineColor: string; lineWidth: number } | undefined;
  const uploadedStyle = feature.get('_style') as typeof defaultUploadedLayerStyle | undefined;
  const selected = Boolean(feature.get('_selected'));
  const fillColor = bufferStyle
    ? hexToRgba(bufferStyle.fillColor, bufferStyle.fillOpacity)
    : hexToRgba(uploadedStyle?.fillColor ?? defaultUploadedLayerStyle.fillColor, uploadedStyle?.fillOpacity ?? defaultUploadedLayerStyle.fillOpacity);
  const strokeColor = selected
    ? '#f97316'
    : bufferStyle?.lineColor ?? uploadedStyle?.lineColor ?? defaultUploadedLayerStyle.lineColor;

  return new Style({
    fill: new Fill({ color: fillColor }),
    stroke: new Stroke({
      color: strokeColor,
      width: selected ? 3.5 : bufferStyle?.lineWidth ?? uploadedStyle?.lineWidth ?? defaultUploadedLayerStyle.lineWidth,
    }),
    image: new CircleStyle({
      radius: selected ? 8 : uploadedStyle?.pointRadius ?? defaultUploadedLayerStyle.pointRadius,
      fill: new Fill({ color: selected ? '#f97316' : uploadedStyle?.pointColor ?? defaultUploadedLayerStyle.pointColor }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
  });
}

function createEditableStyle() {
  return new Style({
    fill: new Fill({ color: 'rgba(15, 118, 110, 0.22)' }),
    stroke: new Stroke({ color: '#0f766e', width: 3 }),
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: '#d6a21f' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
  });
}

function createRasterAoiStyle() {
  return new Style({
    fill: new Fill({ color: 'rgba(214, 162, 31, 0.18)' }),
    stroke: new Stroke({
      color: '#d6a21f',
      lineDash: [8, 5],
      width: 3,
    }),
  });
}

function featureToAoiPolygon(feature: Feature<Geometry>) {
  const format = new GeoJSON();
  const object = format.writeFeatureObject(feature, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  }) as { geometry?: { type?: string; coordinates?: unknown } };

  if (object.geometry?.type !== 'Polygon' || !isPolygonCoordinates(object.geometry.coordinates)) {
    return null;
  }

  return {
    type: 'Polygon' as const,
    coordinates: object.geometry.coordinates,
  };
}

function isPolygonCoordinates(value: unknown): value is [number, number][][] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((ring) => (
      Array.isArray(ring)
      && ring.length >= 4
      && ring.every((coordinate) => (
        Array.isArray(coordinate)
        && coordinate.length >= 2
        && Number.isFinite(Number(coordinate[0]))
        && Number.isFinite(Number(coordinate[1]))
      ))
    ));
}

function getDrawingStatus(tool: string, traceEnabled: boolean) {
  if (tool === 'Polygon' && traceEnabled) {
    return '面绘制中：从已有面边界起笔，在已有面边界结束，双击后自动补齐公共边。';
  }

  return `${labelForTool(tool)}绘制中，靠近已有线或节点会自动吸附。`;
}

function labelForTool(tool: string) {
  if (tool === 'Point') {
    return '点';
  }

  if (tool === 'LineString') {
    return '线';
  }

  return '面';
}

function completePolygonWithSharedBoundary(
  feature: Feature<Geometry>,
  sources: VectorSource<Feature<Geometry>>[],
  map: Map,
  traceEnabled: boolean,
  boundaryCacheRef: { current: BoundaryCache | null },
) {
  if (!traceEnabled) {
    return false;
  }

  const geometry = feature.getGeometry();

  if (!(geometry instanceof Polygon)) {
    return false;
  }

  const ring = geometry.getCoordinates()[0];

  if (!ring || ring.length < 4) {
    return false;
  }

  const openRing = withoutClosingCoordinate(ring);
  const start = openRing[0];
  const end = openRing[openRing.length - 1];
  const match = findSharedBoundaryMatch(start, end, feature, sources, map, boundaryCacheRef);

  if (!match || match.path.length < 2) {
    return false;
  }

  const completedOpenRing = [...openRing];
  completedOpenRing[0] = match.startLocation.coordinate;
  completedOpenRing[completedOpenRing.length - 1] = match.endLocation.coordinate;
  geometry.setCoordinates([closeRing([...completedOpenRing, ...match.path.slice(1)])]);

  return true;
}

function findSharedBoundaryMatch(
  start: Coordinate,
  end: Coordinate,
  drawingFeature: Feature<Geometry>,
  sources: VectorSource<Feature<Geometry>>[],
  map: Map,
  boundaryCacheRef: { current: BoundaryCache | null },
): { startLocation: BoundaryLocation; endLocation: BoundaryLocation; path: Coordinate[] } | undefined {
  const tolerance = getAutoCompleteTolerance(map);
  const cache = boundaryCacheRef.current ?? buildBoundaryCache(sources, drawingFeature);
  boundaryCacheRef.current = cache;
  const startLocation = findClosestBoundaryLocation(start, cache.rings);
  const endLocation = findClosestBoundaryLocation(end, cache.rings);

  if (
    !startLocation ||
    !endLocation ||
    startLocation.distance > tolerance ||
    endLocation.distance > tolerance ||
    sameCoordinate(startLocation.coordinate, endLocation.coordinate)
  ) {
    return undefined;
  }

  const graph = cloneBoundaryGraph(cache.graph);
  addInsertedLocationsToGraph(graph, cache.ringsById, [startLocation, endLocation]);
  const path = findShortestBoundaryPath(
    graph,
    coordinateKey(endLocation.coordinate),
    coordinateKey(startLocation.coordinate),
  );

  return path ? { startLocation, endLocation, path } : undefined;
}

type BoundaryRing = {
  coordinates: Coordinate[];
  extent: [number, number, number, number];
  id: number;
};

type BoundaryLocation = {
  coordinate: Coordinate;
  distance: number;
  index: number;
  ratio: number;
  ringId: number;
  segmentIndex: number;
};

type BoundaryGraph = globalThis.Map<string, {
  coordinate: Coordinate;
  edges: { key: string; weight: number }[];
}>;

type BoundaryCache = {
  graph: BoundaryGraph;
  rings: BoundaryRing[];
  ringsById: globalThis.Map<number, BoundaryRing>;
};

function buildBoundaryCache(
  sources: VectorSource<Feature<Geometry>>[],
  drawingFeature?: Feature<Geometry>,
): BoundaryCache {
  const rings = getPolygonBoundaryRings(sources, drawingFeature);
  const graph = buildBoundaryGraph(rings, []);
  const ringsById = new globalThis.Map(rings.map((ring) => [ring.id, ring]));

  return { graph, rings, ringsById };
}

function getPolygonBoundaryRings(
  sources: VectorSource<Feature<Geometry>>[],
  drawingFeature?: Feature<Geometry>,
) {
  const rings: BoundaryRing[] = [];

  sources.forEach((source) => {
    source.forEachFeature((feature) => {
      if (feature === drawingFeature) {
        return;
      }

      const geometry = feature.getGeometry();

      getBoundaryCoordinateRings(geometry).forEach((ring) => {
        const coordinates = withoutClosingCoordinate(ring);
        const extent = coordinateExtent(coordinates);

        if (coordinates.length >= 3) {
          rings.push({ id: rings.length, coordinates, extent });
        }
      });
    });
  });

  return rings;
}

function getBoundaryCoordinateRings(geometry: Geometry | undefined) {
  if (geometry instanceof Polygon) {
    return geometry.getCoordinates();
  }

  if (geometry instanceof MultiPolygon) {
    return geometry.getCoordinates().flatMap((polygon) => polygon);
  }

  return [];
}

function resetSnapInteractions(
  map: Map,
  enabled: boolean,
  editableSnap: Snap | null,
  referenceSnap: Snap | null,
) {
  if (referenceSnap) {
    map.removeInteraction(referenceSnap);
  }

  if (editableSnap) {
    map.removeInteraction(editableSnap);
  }

  if (!enabled) {
    return;
  }

  if (referenceSnap) {
    map.addInteraction(referenceSnap);
  }

  if (editableSnap) {
    map.addInteraction(editableSnap);
  }
}

function findClosestBoundaryLocation(coordinate: Coordinate, rings: BoundaryRing[]) {
  return rings.reduce<BoundaryLocation | undefined>((closest, ring) => {
    const ringLocation = findClosestRingLocation(coordinate, ring);

    return !closest || ringLocation.distance < closest.distance ? ringLocation : closest;
  }, undefined);
}

function findClosestRingLocation(coordinate: Coordinate, ring: BoundaryRing): BoundaryLocation {
  return ring.coordinates.reduce<BoundaryLocation>(
    (closest, current, index) => {
      const nextIndex = (index + 1) % ring.coordinates.length;
      const projected = getClosestPointOnSegment(coordinate, current, ring.coordinates[nextIndex]);

      return projected.distance < closest.distance
        ? {
          ...projected,
          index: index + projected.ratio,
          ringId: ring.id,
          segmentIndex: index,
        }
        : closest;
    },
    {
      coordinate: ring.coordinates[0],
      distance: Infinity,
      index: 0,
      ratio: 0,
      ringId: ring.id,
      segmentIndex: 0,
    },
  );
}

function getAutoCompleteTolerance(map: Map) {
  return (map.getView().getResolution() ?? 1) * 18;
}

function coordinateExtent(coordinates: Coordinate[]): [number, number, number, number] {
  const extent: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  coordinates.forEach((coordinate) => {
    extent[0] = Math.min(extent[0], coordinate[0]);
    extent[1] = Math.min(extent[1], coordinate[1]);
    extent[2] = Math.max(extent[2], coordinate[0]);
    extent[3] = Math.max(extent[3], coordinate[1]);
  });

  return extent;
}

function buildBoundaryGraph(rings: BoundaryRing[], insertedLocations: BoundaryLocation[]) {
  const graph: BoundaryGraph = new globalThis.Map();

  rings.forEach((ring) => {
    const orderedLocations: BoundaryLocation[] = ring.coordinates.map((coordinate, index) => ({
      coordinate,
      distance: 0,
      index,
      ratio: 0,
      ringId: ring.id,
      segmentIndex: index,
    }));

    insertedLocations
      .filter((location) => location.ringId === ring.id)
      .forEach((location) => orderedLocations.push(location));

    orderedLocations
      .sort((first, second) => first.index - second.index)
      .forEach((location, index, locations) => {
        const nextLocation = locations[(index + 1) % locations.length];

        addGraphEdge(graph, location.coordinate, nextLocation.coordinate);
        addGraphEdge(graph, nextLocation.coordinate, location.coordinate);
      });
  });

  return graph;
}

function cloneBoundaryGraph(graph: BoundaryGraph) {
  const clone: BoundaryGraph = new globalThis.Map();

  graph.forEach((node, key) => {
    clone.set(key, {
      coordinate: node.coordinate,
      edges: node.edges.map((edge) => ({ ...edge })),
    });
  });

  return clone;
}

function addInsertedLocationsToGraph(
  graph: BoundaryGraph,
  ringsById: globalThis.Map<number, BoundaryRing>,
  locations: BoundaryLocation[],
) {
  locations.forEach((location) => {
    const ring = ringsById.get(location.ringId);

    if (!ring) {
      return;
    }

    const start = ring.coordinates[location.segmentIndex];
    const end = ring.coordinates[(location.segmentIndex + 1) % ring.coordinates.length];

    addGraphEdge(graph, location.coordinate, start);
    addGraphEdge(graph, start, location.coordinate);
    addGraphEdge(graph, location.coordinate, end);
    addGraphEdge(graph, end, location.coordinate);
  });

  for (let firstIndex = 0; firstIndex < locations.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < locations.length; secondIndex += 1) {
      const first = locations[firstIndex];
      const second = locations[secondIndex];

      if (first.ringId === second.ringId && first.segmentIndex === second.segmentIndex) {
        addGraphEdge(graph, first.coordinate, second.coordinate);
        addGraphEdge(graph, second.coordinate, first.coordinate);
      }
    }
  }
}

function addGraphEdge(graph: BoundaryGraph, from: Coordinate, to: Coordinate) {
  const fromKey = coordinateKey(from);
  const toKey = coordinateKey(to);
  const fromNode = getGraphNode(graph, fromKey, from);

  getGraphNode(graph, toKey, to);

  if (!fromNode.edges.some((edge) => edge.key === toKey)) {
    fromNode.edges.push({
      key: toKey,
      weight: getMapDistance(from, to),
    });
  }
}

function getGraphNode(graph: BoundaryGraph, key: string, coordinate: Coordinate) {
  if (!graph.has(key)) {
    graph.set(key, {
      coordinate,
      edges: [],
    });
  }

  return graph.get(key)!;
}

function findShortestBoundaryPath(graph: BoundaryGraph, startKey: string, endKey: string) {
  if (!graph.has(startKey) || !graph.has(endKey)) {
    return undefined;
  }

  const distances = new globalThis.Map<string, number>([[startKey, 0]]);
  const previous = new globalThis.Map<string, string>();
  const visited = new Set<string>();
  const queue = new MinPriorityQueue();

  queue.push(startKey, 0);

  while (queue.size > 0) {
    const current = queue.pop();

    if (!current) {
      break;
    }

    const currentKey = current.key;

    if (visited.has(currentKey)) {
      continue;
    }

    if (currentKey === endKey) {
      break;
    }

    visited.add(currentKey);
    const currentDistance = distances.get(currentKey) ?? Infinity;
    const currentNode = graph.get(currentKey)!;

    currentNode.edges.forEach((edge) => {
      if (visited.has(edge.key)) {
        return;
      }

      const nextDistance = currentDistance + edge.weight;

      if (nextDistance < (distances.get(edge.key) ?? Infinity)) {
        distances.set(edge.key, nextDistance);
        previous.set(edge.key, currentKey);
        queue.push(edge.key, nextDistance);
      }
    });
  }

  if (!distances.has(endKey)) {
    return undefined;
  }

  const path: Coordinate[] = [];
  let currentKey: string | undefined = endKey;

  while (currentKey) {
    path.unshift(graph.get(currentKey)!.coordinate);
    currentKey = previous.get(currentKey);
  }

  return path;
}

class MinPriorityQueue {
  private readonly items: { key: string; priority: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(key: string, priority: number) {
    this.items.push({ key, priority });
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) {
      return undefined;
    }

    const first = this.items[0];
    const last = this.items.pop()!;

    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }

    return first;
  }

  private bubbleUp(index: number) {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);

      if (this.items[parentIndex].priority <= this.items[currentIndex].priority) {
        break;
      }

      this.swap(parentIndex, currentIndex);
      currentIndex = parentIndex;
    }
  }

  private sinkDown(index: number) {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = currentIndex * 2 + 2;
      let smallestIndex = currentIndex;

      if (
        leftIndex < this.items.length
        && this.items[leftIndex].priority < this.items[smallestIndex].priority
      ) {
        smallestIndex = leftIndex;
      }

      if (
        rightIndex < this.items.length
        && this.items[rightIndex].priority < this.items[smallestIndex].priority
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === currentIndex) {
        break;
      }

      this.swap(currentIndex, smallestIndex);
      currentIndex = smallestIndex;
    }
  }

  private swap(firstIndex: number, secondIndex: number) {
    [this.items[firstIndex], this.items[secondIndex]] = [this.items[secondIndex], this.items[firstIndex]];
  }
}

function getClosestPointOnSegment(coordinate: Coordinate, start: Coordinate, end: Coordinate) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const rawRatio = lengthSquared === 0
    ? 0
    : ((coordinate[0] - start[0]) * dx + (coordinate[1] - start[1]) * dy) / lengthSquared;
  const ratio = Math.max(0, Math.min(1, rawRatio));
  const closest: Coordinate = [start[0] + dx * ratio, start[1] + dy * ratio];

  return {
    coordinate: closest,
    distance: getMapDistance(coordinate, closest),
    ratio,
  };
}

function withoutClosingCoordinate(ring: Coordinate[]) {
  return sameCoordinate(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring.slice();
}

function closeRing(ring: Coordinate[]) {
  return sameCoordinate(ring[0], ring[ring.length - 1]) ? ring : [...ring, ring[0]];
}

function getMapDistance(first: Coordinate, second: Coordinate) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function sameCoordinate(first: Coordinate, second: Coordinate) {
  return first[0] === second[0] && first[1] === second[1];
}

function coordinateKey(coordinate: Coordinate) {
  return `${coordinate[0].toFixed(3)},${coordinate[1].toFixed(3)}`;
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
