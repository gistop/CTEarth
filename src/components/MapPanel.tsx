import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { defaultUploadedLayerStyle, getPointBounds, useGis, type UploadedLayerStyle } from '../gisStore';
import { type BasemapId, useMapCommands } from './map/MapCommandContext';

const CHINA_CENTER: [number, number] = [104.1954, 35.8617];
const CHINA_ZOOM = 3.6;
const DEFAULT_BASEMAP: BasemapId = 'osm';
const TIANDITU_TOKEN = 'fa7482bbcd44e52cb5fb76cde5e7c83e';

const basemapLayers: Record<BasemapId, string[]> = {
  osm: ['basemap-osm'],
  tianditu: ['basemap-tianditu-vec', 'basemap-tianditu-cva'],
  esri: ['basemap-esri'],
};
const rasterLayerIds = ['idw-interpolation'];
const vectorOverlayLayerIds = ['buffer-fill', 'buffer-outline'];

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

function createOnlineMapStyle(activeBasemap: BasemapId = DEFAULT_BASEMAP): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: 'OpenStreetMap contributors',
      },
      tiandituVec: {
        type: 'raster',
        tiles: createTiandituTiles('vec'),
        tileSize: 256,
        attribution: '天地图',
      },
      tiandituCva: {
        type: 'raster',
        tiles: createTiandituTiles('cva'),
        tileSize: 256,
        attribution: '天地图',
      },
      esriImagery: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Tiles © Esri',
      },
    },
    layers: [
      {
        id: 'basemap-osm',
        type: 'raster',
        source: 'osm',
        layout: {
          visibility: activeBasemap === 'osm' ? 'visible' : 'none',
        },
      },
      {
        id: 'basemap-tianditu-vec',
        type: 'raster',
        source: 'tiandituVec',
        layout: {
          visibility: activeBasemap === 'tianditu' ? 'visible' : 'none',
        },
      },
      {
        id: 'basemap-tianditu-cva',
        type: 'raster',
        source: 'tiandituCva',
        layout: {
          visibility: activeBasemap === 'tianditu' ? 'visible' : 'none',
        },
      },
      {
        id: 'basemap-esri',
        type: 'raster',
        source: 'esriImagery',
        layout: {
          visibility: activeBasemap === 'esri' ? 'visible' : 'none',
        },
      },
    ],
  };
}

function setBasemapVisibility(map: maplibregl.Map, basemap: BasemapId, visible = true) {
  Object.entries(basemapLayers).forEach(([id, layerIds]) => {
    const isVisible = visible && id === basemap;

    layerIds.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
      }
    });
  });
}

function setLayersVisibility(map: maplibregl.Map, layerIds: string[], visible: boolean) {
  layerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
  });
}

function setBasemapOpacity(map: maplibregl.Map, opacity: number) {
  Object.values(basemapLayers).flat().forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'raster-opacity', opacity);
    }
  });
}

export function MapPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lastLayerNameRef = useRef('');
  const { mapCommandState, registerMapCommands, updateMapCommandState } = useMapCommands();
  const {
    layer,
    layers,
    layerOrder,
    layerVisibility,
    uploadedLayerVisibility,
    basemapStyle,
    raster,
    rasterStyle,
    vectorOverlay,
    vectorOverlayStyle,
    uploadedLayerStyles,
  } = useGis();
  const [coords, setCoords] = useState(`${CHINA_CENTER[0]}, ${CHINA_CENTER[1]}`);
  const [status, setStatus] = useState('正在初始化在线地图');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const createMap = () => {
      if (mapRef.current) {
        return;
      }

      const { width, height } = container.getBoundingClientRect();

      if (width < 20 || height < 20) {
        setStatus(`等待地图容器尺寸 ${Math.round(width)} x ${Math.round(height)}`);
        return;
      }

      const map = new maplibregl.Map({
        container,
        center: CHINA_CENTER,
        zoom: CHINA_ZOOM,
        pitch: 0,
        minZoom: 2,
        maxZoom: 18,
        attributionControl: false,
        style: createOnlineMapStyle(DEFAULT_BASEMAP),
      });
      updateMapCommandState({ basemap: DEFAULT_BASEMAP, dragRotateEnabled: map.dragRotate.isEnabled() });

      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('error', (event) => {
        setStatus(event.error?.message ?? '在线地图加载错误');
      });
      map.once('load', () => {
        map.resize();
        map.jumpTo({ center: CHINA_CENTER, zoom: CHINA_ZOOM, pitch: 0, bearing: 0 });
    setMapReady(true);
        setStatus('');
      });
      map.on('mousemove', (event) => {
        setCoords(`${event.lngLat.lng.toFixed(5)}, ${event.lngLat.lat.toFixed(5)}`);
      });

      mapRef.current = map;
    };

    createMap();

    const animationFrame = requestAnimationFrame(createMap);
    const resizeObserver = new ResizeObserver(() => {
      createMap();
      mapRef.current?.resize();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    setBasemapVisibility(map, mapCommandState.basemap, layerVisibility.basemap);
    setBasemapOpacity(map, basemapStyle.opacity);
    setLayersVisibility(map, rasterLayerIds, layerVisibility.raster);
    setLayersVisibility(map, vectorOverlayLayerIds, layerVisibility.vectorOverlay);
  }, [basemapStyle, layerVisibility, mapCommandState.basemap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    if (layers.length === 0) {
      removeStaleUploadedLayers(map, new Set());
      lastLayerNameRef.current = '';
      return;
    }

    const expectedLayerIds = new Set(layers.map((item) => item.id));
    removeStaleUploadedLayers(map, expectedLayerIds);

    layers.forEach((item) => {
      const style = uploadedLayerStyles[item.id] ?? defaultUploadedLayerStyle;

      ensureUploadedLayer(map, item.id, style);
      setUploadedLayerData(map, item);
      setUploadedLayerPaint(map, item.id, style);
      setLayersVisibility(map, uploadedLayerIds(item.id), uploadedLayerVisibility[item.id] ?? true);
    });

    applyLayerOrder(map, layerOrder, layers, Boolean(raster), Boolean(vectorOverlay));

    if (layer && lastLayerNameRef.current !== layer.id) {
      const bounds = layer.points.features.length > 0
        ? getPointBounds(layer.points.features)
        : getGeoJsonBounds(layer.geojson);

      if (bounds) {
        map.fitBounds(padBounds(bounds, 0.14), { padding: 80, duration: 700 });
      }

      lastLayerNameRef.current = layer.id;
    }
  }, [layer, layerOrder, layers, mapReady, raster, uploadedLayerStyles, uploadedLayerVisibility, vectorOverlay]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    if (map.getLayer('idw-interpolation')) {
      map.removeLayer('idw-interpolation');
    }

    if (map.getSource('idw-interpolation')) {
      map.removeSource('idw-interpolation');
    }

    if (!raster) {
      return;
    }

    map.addSource('idw-interpolation', {
      type: 'image',
      url: raster.imageUrl,
      coordinates: raster.coordinates,
    });
    map.addLayer(
      {
        id: 'idw-interpolation',
        type: 'raster',
        source: 'idw-interpolation',
        paint: {
          'raster-opacity': rasterStyle.opacity,
          'raster-fade-duration': 0,
        },
      },
    );
    setLayersVisibility(map, rasterLayerIds, layerVisibility.raster);
    applyLayerOrder(map, layerOrder, layers, true, Boolean(vectorOverlay));
    map.fitBounds(boundsFromCoordinates(raster.coordinates), { padding: 80, duration: 700 });
  }, [layerOrder, layers, mapReady, raster, vectorOverlay]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !map.getLayer('idw-interpolation')) {
      return;
    }

    map.setPaintProperty('idw-interpolation', 'raster-opacity', rasterStyle.opacity);
  }, [mapReady, rasterStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    if (map.getLayer('buffer-outline')) {
      map.removeLayer('buffer-outline');
    }

    if (map.getLayer('buffer-fill')) {
      map.removeLayer('buffer-fill');
    }

    if (map.getSource('buffer-result')) {
      map.removeSource('buffer-result');
    }

    if (!vectorOverlay) {
      return;
    }

    map.addSource('buffer-result', {
      type: 'geojson',
      data: vectorOverlay.geojson as GeoJSON.FeatureCollection,
    });
    map.addLayer(
      {
        id: 'buffer-fill',
        type: 'fill',
        source: 'buffer-result',
        paint: {
          'fill-color': vectorOverlayStyle.fillColor,
          'fill-opacity': vectorOverlayStyle.fillOpacity,
        },
      },
    );
    map.addLayer(
      {
        id: 'buffer-outline',
        type: 'line',
        source: 'buffer-result',
        paint: {
          'line-color': vectorOverlayStyle.lineColor,
          'line-width': vectorOverlayStyle.lineWidth,
        },
      },
    );
    setLayersVisibility(map, vectorOverlayLayerIds, layerVisibility.vectorOverlay);
    applyLayerOrder(map, layerOrder, layers, Boolean(raster), true);

    const bounds = getGeoJsonBounds(vectorOverlay.geojson);

    if (bounds) {
      map.fitBounds(padBounds(bounds, 0.12), { padding: 80, duration: 700 });
    }
  }, [layerOrder, layers, mapReady, raster, vectorOverlay]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    setVectorOverlayPaint(map, vectorOverlayStyle);
  }, [mapReady, vectorOverlayStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    applyLayerOrder(map, layerOrder, layers, Boolean(raster), Boolean(vectorOverlay));
  }, [layerOrder, layers, mapReady, raster, vectorOverlay]);

  const zoomIn = useCallback(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.zoomIn({ duration: 250 });
  }, []);

  const zoomOut = useCallback(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.zoomOut({ duration: 250 });
  }, []);

  const resetNorth = useCallback(() => {
    mapRef.current?.resetNorthPitch();
  }, []);

  const setBasemap = useCallback((basemap: BasemapId) => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    setBasemapVisibility(map, basemap, layerVisibility.basemap);
    updateMapCommandState({ basemap });
  }, [layerVisibility.basemap, updateMapCommandState]);

  const toggleDragRotate = useCallback(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (map.dragRotate.isEnabled()) {
      map.dragRotate.disable();
    } else {
      map.dragRotate.enable();
    }

    updateMapCommandState({ dragRotateEnabled: map.dragRotate.isEnabled() });
  }, [updateMapCommandState]);

  const locate = useCallback(() => {
    mapRef.current?.easeTo({
      center: CHINA_CENTER,
      zoom: CHINA_ZOOM,
      pitch: 0,
      bearing: 0,
      duration: 450,
      essential: true,
    });
  }, []);

  const mapCommands = useMemo(
    () => ({
      zoomIn,
      zoomOut,
      resetNorth,
      setBasemap,
      toggleDragRotate,
      locate,
    }),
    [locate, resetNorth, setBasemap, toggleDragRotate, zoomIn, zoomOut],
  );

  useEffect(() => registerMapCommands(mapCommands), [mapCommands, registerMapCommands]);

  return (
    <section className="map-panel">
      <div className="map-canvas" ref={containerRef} />
      {status ? <div className="map-status">{status}</div> : null}
      <div className="map-readout">{coords}</div>
    </section>
  );
}

function uploadedSourceId(layerId: string) {
  return `uploaded-source-${layerId}`;
}

function uploadedLayerIds(layerId: string) {
  return [
    `uploaded-layer-${layerId}-fill`,
    `uploaded-layer-${layerId}-line`,
    `uploaded-layer-${layerId}-circle`,
    `uploaded-layer-${layerId}-label`,
  ];
}

function ensureUploadedLayer(map: maplibregl.Map, layerId: string, style: UploadedLayerStyle) {
  const sourceId = uploadedSourceId(layerId);
  const [fillId, lineId, circleId, labelId] = uploadedLayerIds(layerId);

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
  }

  if (!map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: 'fill',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      paint: {
        'fill-color': style.fillColor,
        'fill-opacity': style.fillOpacity,
      },
    });
  }

  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: 'line',
      source: sourceId,
      filter: [
        'any',
        ['==', ['geometry-type'], 'LineString'],
        ['==', ['geometry-type'], 'MultiLineString'],
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon'],
      ],
      paint: {
        'line-color': style.lineColor,
        'line-width': style.lineWidth,
        'line-opacity': style.lineOpacity,
      },
    });
  }

  if (!map.getLayer(circleId)) {
    map.addLayer({
      id: circleId,
      type: 'circle',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
      paint: {
        'circle-radius': style.pointRadius,
        'circle-color': style.pointColor,
        'circle-opacity': style.pointOpacity,
        'circle-stroke-color': style.pointStrokeColor,
        'circle-stroke-width': style.pointStrokeWidth,
      },
    });
  }

  if (!map.getLayer(labelId)) {
    map.addLayer({
      id: labelId,
      type: 'symbol',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
      layout: {
        'text-field': ['to-string', ['get', '_value']],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#17202a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
    });
  }
}

function setUploadedLayerPaint(map: maplibregl.Map, layerId: string, style: UploadedLayerStyle) {
  const [fillId, lineId, circleId] = uploadedLayerIds(layerId);

  if (map.getLayer(fillId)) {
    map.setPaintProperty(fillId, 'fill-color', style.fillColor);
    map.setPaintProperty(fillId, 'fill-opacity', style.fillOpacity);
  }

  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, 'line-color', style.lineColor);
    map.setPaintProperty(lineId, 'line-width', style.lineWidth);
    map.setPaintProperty(lineId, 'line-opacity', style.lineOpacity);
  }

  if (map.getLayer(circleId)) {
    map.setPaintProperty(circleId, 'circle-radius', style.pointRadius);
    map.setPaintProperty(circleId, 'circle-color', style.pointColor);
    map.setPaintProperty(circleId, 'circle-opacity', style.pointOpacity);
    map.setPaintProperty(circleId, 'circle-stroke-color', style.pointStrokeColor);
    map.setPaintProperty(circleId, 'circle-stroke-width', style.pointStrokeWidth);
  }
}

function setVectorOverlayPaint(
  map: maplibregl.Map,
  style: { fillColor: string; fillOpacity: number; lineColor: string; lineWidth: number },
) {
  if (map.getLayer('buffer-fill')) {
    map.setPaintProperty('buffer-fill', 'fill-color', style.fillColor);
    map.setPaintProperty('buffer-fill', 'fill-opacity', style.fillOpacity);
  }

  if (map.getLayer('buffer-outline')) {
    map.setPaintProperty('buffer-outline', 'line-color', style.lineColor);
    map.setPaintProperty('buffer-outline', 'line-width', style.lineWidth);
  }
}

function setUploadedLayerData(map: maplibregl.Map, layer: { id: string; geojson: { features: unknown[] }; selectedField: string }) {
  const source = map.getSource(uploadedSourceId(layer.id)) as maplibregl.GeoJSONSource | undefined;

  source?.setData({
    type: 'FeatureCollection',
    features: layer.geojson.features.map((feature) => enrichFeature(feature, layer)),
  } as GeoJSON.FeatureCollection);
}

function removeStaleUploadedLayers(map: maplibregl.Map, expectedLayerIds: Set<string>) {
  const style = map.getStyle();
  const staleLayerIds = style.layers
    .map((item) => item.id)
    .filter((id) => {
      if (!id.startsWith('uploaded-layer-')) {
        return false;
      }

      const uploadedId = uploadedIdFromLayerId(id);
      return uploadedId ? !expectedLayerIds.has(uploadedId) : false;
    });

  staleLayerIds.forEach((id) => {
    if (map.getLayer(id)) {
      map.removeLayer(id);
    }
  });

  Object.keys(style.sources)
    .filter((id) => id.startsWith('uploaded-source-') && !expectedLayerIds.has(id.slice('uploaded-source-'.length)))
    .forEach((id) => {
      if (map.getSource(id)) {
        map.removeSource(id);
      }
    });
}

function uploadedIdFromLayerId(layerId: string) {
  const match = /^uploaded-layer-(.+)-(fill|line|circle|label)$/.exec(layerId);
  return match?.[1] ?? null;
}

function applyLayerOrder(
  map: maplibregl.Map,
  layerOrder: string[],
  uploadedLayers: { id: string }[],
  hasRaster: boolean,
  hasVectorOverlay: boolean,
) {
  const uploadedIds = new Set(uploadedLayers.map((item) => item.id));
  const normalizedOrder = [
    ...layerOrder,
    ...uploadedLayers.map((item) => `uploaded:${item.id}`),
    'basemap',
    ...(hasRaster ? ['raster'] : []),
    ...(hasVectorOverlay ? ['vectorOverlay'] : []),
  ];
  const seen = new Set<string>();
  const layerGroups = normalizedOrder
    .filter((id) => {
      if (seen.has(id)) {
        return false;
      }

      seen.add(id);
      return true;
    })
    .map((id) => layerGroupIds(id, uploadedIds, hasRaster, hasVectorOverlay))
    .filter((ids) => ids.length > 0);

  [...layerGroups].reverse().forEach((groupIds) => {
    groupIds.forEach((id) => {
      if (map.getLayer(id)) {
        map.moveLayer(id);
      }
    });
  });
}

function layerGroupIds(id: string, uploadedIds: Set<string>, hasRaster: boolean, hasVectorOverlay: boolean) {
  if (id === 'basemap') {
    return Object.values(basemapLayers).flat();
  }

  if (id === 'raster') {
    return hasRaster ? rasterLayerIds : [];
  }

  if (id === 'vectorOverlay') {
    return hasVectorOverlay ? vectorOverlayLayerIds : [];
  }

  if (id.startsWith('uploaded:')) {
    const layerId = id.slice('uploaded:'.length);
    return uploadedIds.has(layerId) ? uploadedLayerIds(layerId) : [];
  }

  return [];
}

function padBounds(bounds: [number, number, number, number], ratio: number): [[number, number], [number, number]] {
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const lonPad = Math.max((maxLon - minLon) * ratio, 0.01);
  const latPad = Math.max((maxLat - minLat) * ratio, 0.01);

  return [
    [minLon - lonPad, minLat - latPad],
    [maxLon + lonPad, maxLat + latPad],
  ];
}

function boundsFromCoordinates(
  coordinates: [[number, number], [number, number], [number, number], [number, number]],
): [[number, number], [number, number]] {
  const bounds = coordinates.reduce(
    (current, [lon, lat]) => [
      Math.min(current[0], lon),
      Math.min(current[1], lat),
      Math.max(current[2], lon),
      Math.max(current[3], lat),
    ] as [number, number, number, number],
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );

  return [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[3]],
  ];
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);
}

function enrichFeature(feature: unknown, layer: { id: string; selectedField: string }) {
  if (!isRecord(feature)) {
    return feature;
  }

  const properties = isRecord(feature.properties) ? feature.properties : {};

  return {
    ...feature,
    properties: {
      ...properties,
      _layerId: layer.id,
      _value: layer.selectedField && isPointLikeFeature(feature)
        ? formatNumber(Number(properties[layer.selectedField]))
        : '',
    },
  };
}

function getGeoJsonBounds(geojson: { features: unknown[] }): [number, number, number, number] | null {
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  for (const feature of geojson.features) {
    if (!isRecord(feature) || !isRecord(feature.geometry)) {
      continue;
    }

    expandCoordinateBounds(feature.geometry.coordinates, bounds);
  }

  if (!Number.isFinite(bounds[0])) {
    return null;
  }

  return bounds;
}

function expandCoordinateBounds(value: unknown, bounds: [number, number, number, number]) {
  if (!Array.isArray(value)) {
    return;
  }

  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    const lon = Number(value[0]);
    const lat = Number(value[1]);
    bounds[0] = Math.min(bounds[0], lon);
    bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lon);
    bounds[3] = Math.max(bounds[3], lat);
    return;
  }

  value.forEach((item) => expandCoordinateBounds(item, bounds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPointLikeFeature(value: Record<string, unknown>) {
  return isRecord(value.geometry) && value.geometry.type === 'Point';
}
