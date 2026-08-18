import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Layers, LocateFixed, Minus, Plus, RotateCcw } from 'lucide-react';
import { getPointBounds, useGis } from '../gisStore';

const CHINA_CENTER: [number, number] = [104.1954, 35.8617];
const CHINA_ZOOM = 3.6;

function createOnlineMapStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: 'OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
      },
    ],
  };
}

export function MapPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lastLayerNameRef = useRef('');
  const { layer, message, raster, vectorOverlay } = useGis();
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
        style: createOnlineMapStyle(),
      });

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('error', (event) => {
        setStatus(event.error?.message ?? '在线地图加载错误');
      });
      map.once('load', () => {
        map.resize();
        map.jumpTo({ center: CHINA_CENTER, zoom: CHINA_ZOOM, pitch: 0, bearing: 0 });
        ensureOperationalLayers(map);
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

    ensureOperationalLayers(map);

    const source = map.getSource('uploaded-vector') as maplibregl.GeoJSONSource | undefined;

    if (!source) {
      return;
    }

    if (!layer) {
      source.setData(emptyFeatureCollection());
      lastLayerNameRef.current = '';
      return;
    }

    source.setData({
      type: 'FeatureCollection',
      features: layer.geojson.features.map((feature) => {
        if (!isRecord(feature)) {
          return feature;
        }

        const properties = isRecord(feature.properties) ? feature.properties : {};

        return {
          ...feature,
          properties: {
            ...properties,
            _value: layer.selectedField && isPointLikeFeature(feature)
              ? formatNumber(Number(properties[layer.selectedField]))
              : '',
          },
        };
      }),
    } as GeoJSON.FeatureCollection);

    if (lastLayerNameRef.current !== layer.fileName) {
      const bounds = layer.points.features.length > 0
        ? getPointBounds(layer.points.features)
        : getGeoJsonBounds(layer.geojson);

      if (bounds) {
        map.fitBounds(padBounds(bounds, 0.14), { padding: 80, duration: 700 });
      }

      lastLayerNameRef.current = layer.fileName;
    }
  }, [layer, mapReady]);

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
          'raster-opacity': 0.82,
          'raster-fade-duration': 0,
        },
      },
      map.getLayer('uploaded-vector-circle') ? 'uploaded-vector-circle' : undefined,
    );
    map.fitBounds(boundsFromCoordinates(raster.coordinates), { padding: 80, duration: 700 });
  }, [mapReady, raster]);

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
          'fill-color': '#31a354',
          'fill-opacity': 0.28,
        },
      },
      map.getLayer('uploaded-vector-circle') ? 'uploaded-vector-circle' : undefined,
    );
    map.addLayer(
      {
        id: 'buffer-outline',
        type: 'line',
        source: 'buffer-result',
        paint: {
          'line-color': '#16753b',
          'line-width': 2,
        },
      },
      map.getLayer('uploaded-vector-circle') ? 'uploaded-vector-circle' : undefined,
    );

    const bounds = getGeoJsonBounds(vectorOverlay.geojson);

    if (bounds) {
      map.fitBounds(padBounds(bounds, 0.12), { padding: 80, duration: 700 });
    }
  }, [mapReady, vectorOverlay]);

  const zoomIn = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.zoomIn({ duration: 250 });
  };

  const zoomOut = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.zoomOut({ duration: 250 });
  };

  const resetNorth = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    mapRef.current?.resetNorthPitch();
  };

  const locate = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    mapRef.current?.easeTo({
      center: CHINA_CENTER,
      zoom: CHINA_ZOOM,
      pitch: 0,
      bearing: 0,
      duration: 450,
      essential: true,
    });
  };

  return (
    <section className="map-panel">
      <div className="map-canvas" ref={containerRef} />
      {status || message ? <div className="map-status">{status || message}</div> : null}
      <div className="map-toolbar" aria-label="地图工具" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" title="放大" aria-label="放大" onClick={zoomIn}><Plus size={17} /></button>
        <button type="button" title="缩小" aria-label="缩小" onClick={zoomOut}><Minus size={17} /></button>
        <button type="button" title="复位方向" aria-label="复位方向" onClick={resetNorth}><RotateCcw size={17} /></button>
        <button type="button" title="定位示例区域" aria-label="定位示例区域" onClick={locate}><LocateFixed size={17} /></button>
        <button type="button" title="图层" aria-label="图层"><Layers size={17} /></button>
      </div>
      <div className="map-readout">{coords}</div>
    </section>
  );
}

function ensureOperationalLayers(map: maplibregl.Map) {
  if (!map.getSource('uploaded-vector')) {
    map.addSource('uploaded-vector', {
      type: 'geojson',
      data: emptyFeatureCollection(),
    });
  }

  if (!map.getLayer('uploaded-vector-fill')) {
    map.addLayer({
      id: 'uploaded-vector-fill',
      type: 'fill',
      source: 'uploaded-vector',
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      paint: {
        'fill-color': '#6b9bd2',
        'fill-opacity': 0.22,
      },
    });
  }

  if (!map.getLayer('uploaded-vector-line')) {
    map.addLayer({
      id: 'uploaded-vector-line',
      type: 'line',
      source: 'uploaded-vector',
      filter: [
        'any',
        ['==', ['geometry-type'], 'LineString'],
        ['==', ['geometry-type'], 'MultiLineString'],
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon'],
      ],
      paint: {
        'line-color': '#2f6da5',
        'line-width': 2,
      },
    });
  }

  if (!map.getLayer('uploaded-vector-circle')) {
    map.addLayer({
      id: 'uploaded-vector-circle',
      type: 'circle',
      source: 'uploaded-vector',
      filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
      paint: {
        'circle-radius': 6,
        'circle-color': '#f6c445',
        'circle-stroke-color': '#17202a',
        'circle-stroke-width': 1.5,
      },
    });
  }

  if (!map.getLayer('uploaded-vector-label')) {
    map.addLayer({
      id: 'uploaded-vector-label',
      type: 'symbol',
      source: 'uploaded-vector',
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

function emptyFeatureCollection() {
  return {
    type: 'FeatureCollection' as const,
    features: [],
  };
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
