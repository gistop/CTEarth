import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Layers, LocateFixed, Minus, Plus, RotateCcw } from 'lucide-react';

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
  const [coords, setCoords] = useState(`${CHINA_CENTER[0]}, ${CHINA_CENTER[1]}`);
  const [status, setStatus] = useState('正在初始化在线地图');

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
    };
  }, []);

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
      {status ? <div className="map-status">{status}</div> : null}
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
