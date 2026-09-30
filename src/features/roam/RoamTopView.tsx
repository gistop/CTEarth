// 漫游辅助视口——顶视图：OpenLayers 2D 小地图（影像底图 + 轨迹线 + 航点），
// 航点可用 Translate 交互直接拖拽（等价 GES 在视口中编辑轨迹）；
// 播放时实时显示相机位置标记（订阅 roamBus，不触发 React 重渲染）。

import { useEffect, useRef } from 'react';
import Feature from 'ol/Feature.js';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import Translate from 'ol/interaction/Translate.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style.js';
import type { TranslateEvent } from 'ol/interaction/Translate.js';
import { useRoam } from './RoamContext';
import { roamBus } from './roamBus';
import type { RoamRoute } from './types';

const waypointStyle = (index: number, selected: boolean) => new Style({
  image: new CircleStyle({
    radius: selected ? 7 : 5,
    fill: new Fill({ color: selected ? '#fbbf24' : '#38bdf8' }),
    stroke: new Stroke({ color: '#0f172a', width: 2 }),
  }),
  text: new Text({
    text: String(index + 1),
    offsetY: -12,
    font: '11px sans-serif',
    fill: new Fill({ color: '#e2e8f0' }),
    stroke: new Stroke({ color: '#0f172a', width: 3 }),
  }),
});

const lineStyle = new Style({
  stroke: new Stroke({ color: '#38bdf8', width: 2.5 }),
});

const cameraStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: 'rgba(248, 113, 113, 0.35)' }),
    stroke: new Stroke({ color: '#f87171', width: 2 }),
  }),
});

export function RoamTopView() {
  const { route, selectedWaypointId, setSelectedWaypointId, updateWaypoint, playbackState } = useRoam();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const routeSourceRef = useRef<VectorSource | null>(null);
  const cameraFeatureRef = useRef<Feature<Point> | null>(null);
  const cameraLayerRef = useRef<VectorLayer | null>(null);
  const fitTokenRef = useRef(0);

  // 初始化 OL 地图（一次）
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }
    const routeSource = new VectorSource();
    const cameraSource = new VectorSource();
    const map = new Map({
      target: container,
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({ source: routeSource, style: (feature) => {
          const kind = feature.get('kind');

          if (kind === 'path') {
            return lineStyle;
          }
          const index = Number(feature.get('index') ?? 0);
          const selected = feature.get('selected') === true;

          return waypointStyle(Number.isFinite(index) ? index : 0, selected);
        } }),
        new VectorLayer({ source: cameraSource, style: cameraStyle }),
      ],
      view: new View({ center: fromLonLat([105, 35]), zoom: 4 }),
      controls: [],
    });
    const translate = new Translate({
      filter: (feature) => feature.get('kind') === 'waypoint',
    });

    translate.on('translateend', (event: TranslateEvent) => {
      const feature = event.features.item(0);
      const id = feature.get('waypointId') as string | undefined;
      const coordinate = feature.getGeometry() instanceof Point
        ? (feature.getGeometry() as Point).getCoordinates()
        : null;

      if (id && coordinate) {
        const [lon, lat] = toLonLat(coordinate);

        updateWaypoint(id, { lon, lat });
      }
    });
    map.addInteraction(translate);
    map.on('click', (event) => {
      const hit = map.forEachFeatureAtPixel(event.pixel, (feature) => feature);

      if (hit && hit.get('kind') === 'waypoint') {
        setSelectedWaypointId((hit.get('waypointId') as string | undefined) ?? null);
      }
    });

    mapRef.current = map;
    routeSourceRef.current = routeSource;
    cameraFeatureRef.current = new Feature(new Point(fromLonLat([105, 35])));
    cameraFeatureRef.current.set('kind', 'camera');
    cameraSource.addFeature(cameraFeatureRef.current);
    cameraLayerRef.current = map.getLayers().item(2) as VectorLayer;

    const observer = new ResizeObserver(() => { map.updateSize(); });

    observer.observe(container);

    return () => {
      observer.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
      routeSourceRef.current = null;
      cameraFeatureRef.current = null;
      cameraLayerRef.current = null;
    };
  }, [updateWaypoint, setSelectedWaypointId]);

  // 航线变化 → 重建要素
  useEffect(() => {
    const source = routeSourceRef.current;
    const map = mapRef.current;

    if (!source || !map) {
      return;
    }
    source.clear();

    const points = route.waypoints.map((waypoint) => fromLonLat([waypoint.lon, waypoint.lat]));

    if (points.length > 1) {
      const path = new Feature(new LineString(points));

      path.set('kind', 'path');
      source.addFeature(path);
    }
    route.waypoints.forEach((waypoint, index) => {
      const feature = new Feature(new Point(fromLonLat([waypoint.lon, waypoint.lat])));

      feature.set('kind', 'waypoint');
      feature.set('waypointId', waypoint.id);
      feature.set('index', index);
      feature.set('selected', waypoint.id === selectedWaypointId);
      source.addFeature(feature);
    });

    // 视野适配：航线变化时 fit 一次
    fitTokenRef.current += 1;
    const token = fitTokenRef.current;

    window.setTimeout(() => {
      if (token !== fitTokenRef.current || !mapRef.current) {
        return;
      }
      const extent = source.getExtent();

      if (extent && extent.filter((value) => Number.isFinite(value)).length === 4) {
        mapRef.current.getView().fit(extent, { padding: [18, 18, 18, 18], maxZoom: 16 });
      }
    }, 30);
  }, [route.waypoints, selectedWaypointId]);

  // 相机位置标记：播放时显示，随 roamBus 移动
  useEffect(() => {
    const feature = cameraFeatureRef.current;
    const layer = cameraLayerRef.current;

    if (!feature || !layer) {
      return;
    }
    layer.setVisible(playbackState === 'playing' || playbackState === 'paused');

    let raf = 0;

    const tick = () => {
      const pose = roamBus.get().pose;

      if (pose) {
        feature.getGeometry()?.setCoordinates(fromLonLat([pose.lon, pose.lat]));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); };
  }, [playbackState]);

  return <div ref={containerRef} className="roam-top-view" />;
}
