// 漫游地图实体桥：主图上的轨迹线、航点标记（可拖拽改位置）、垂线，
// 以及「地图取点」模式（点击地图追加航点，高度取地形 + 300m 缓冲）。

import { useEffect, useRef } from 'react';
import type { MapViewMode } from '../maps/components/map/MapCommandContext';
import type { CesiumNamespace, CesiumViewer } from '../maps/components/map/cesiumRuntime';
import { useRoam } from './RoamContext';
import type { RoamRoute } from './types';

type CesiumScene = { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;

type RoamEntity = { id?: string; position?: unknown };

export function RoamMapEntities({ cesiumScene, mapMode }: { cesiumScene: CesiumScene; mapMode: MapViewMode }) {
  const {
    route,
    updateWaypoint,
    appendWaypoint,
    selectedWaypointId,
    setSelectedWaypointId,
    pickModeActive,
    playbackState,
    recordingState,
  } = useRoam();

  const routeRef = useRef<RoamRoute>(route);
  const pickModeRef = useRef(pickModeActive);
  const busyRef = useRef(false);
  const entitiesRef = useRef<Map<string, { marker: RoamEntity; drop: RoamEntity }>>(new Map());
  const lineEntityRef = useRef<RoamEntity | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const lastDragUpdateRef = useRef(0);

  const isGlobe = mapMode === 'globe' && cesiumScene !== null;

  routeRef.current = route;
  pickModeRef.current = pickModeActive;
  busyRef.current = playbackState === 'playing' || recordingState.active;

  const waypointSignature = route.waypoints
    .map((waypoint) => `${waypoint.id}:${waypoint.lon.toFixed(6)},${waypoint.lat.toFixed(6)},${Math.round(waypoint.height)}`)
    .join('|');

  useEffect(() => {
    const scene = isGlobe ? cesiumScene : null;

    if (!scene) {
      return;
    }
    const { Cesium, viewer } = scene;

    for (const pair of entitiesRef.current.values()) {
      viewer.entities.remove(pair.marker);
      viewer.entities.remove(pair.drop);
    }
    entitiesRef.current.clear();
    if (lineEntityRef.current) {
      viewer.entities.remove(lineEntityRef.current);
      lineEntityRef.current = null;
    }

    if (route.waypoints.length === 0) {
      return;
    }

    // 轨迹主线：CallbackProperty 保证航线数据变化后自动重绘
    lineEntityRef.current = viewer.entities.add({
      id: 'roam-path-line',
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const waypoints = routeRef.current.waypoints;

          return waypoints.length > 1
            ? waypoints.map((waypoint) => Cesium.Cartesian3.fromDegrees(waypoint.lon, waypoint.lat, waypoint.height))
            : [];
        }, false),
        width: 3,
        material: new Cesium.ColorMaterialProperty(Cesium.Color.fromCssColorString('rgba(56, 189, 248, 0.9)')),
      },
    }) as RoamEntity;

    route.waypoints.forEach((waypoint, index) => {
      const selected = waypoint.id === selectedWaypointId;
      const position = Cesium.Cartesian3.fromDegrees(waypoint.lon, waypoint.lat, waypoint.height);
      const marker = viewer.entities.add({
        id: `roam-wp-${waypoint.id}`,
        position,
        point: {
          pixelSize: selected ? 12 : 9,
          color: Cesium.Color.fromCssColorString(selected ? '#fbbf24' : '#38bdf8'),
          outlineColor: Cesium.Color.fromCssColorString('#0f172a'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: String(index + 1),
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString('#0f172a'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }) as RoamEntity;
      const drop = viewer.entities.add({
        id: `roam-wp-drop-${waypoint.id}`,
        position,
        polyline: {
          positions: [position, Cesium.Cartesian3.fromDegrees(waypoint.lon, waypoint.lat, 0)],
          width: 1,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('rgba(148, 163, 184, 0.7)'),
          }),
          clampToGround: true,
        },
      }) as RoamEntity;

      entitiesRef.current.set(waypoint.id, { marker, drop });
    });
  }, [cesiumScene, isGlobe, waypointSignature, selectedWaypointId]);

  useEffect(() => {
    const scene = isGlobe ? cesiumScene : null;

    if (!scene) {
      return;
    }
    const { Cesium, viewer } = scene;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

    const pickCartographic = (windowPosition: unknown) => {
      const ray = viewer.camera.getPickRay?.(windowPosition);

      if (!ray) {
        return null;
      }
      const cartesian = viewer.scene.globe.pick?.(ray, viewer.scene);

      return cartesian ? Cesium.Cartographic.fromCartesian(cartesian) : null;
    };

    handler.setInputAction((event) => {
      const position = (event as { position?: unknown }).position;

      if (!position || busyRef.current) {
        return;
      }
      const picked = viewer.scene.pick?.(position);
      const entityId = (picked?.id as RoamEntity | undefined)?.id;

      if (typeof entityId === 'string' && entityId.startsWith('roam-wp-')) {
        const waypointId = entityId.slice('roam-wp-'.length);

        draggingIdRef.current = waypointId;
        setSelectedWaypointId(waypointId);
        const controller = viewer.scene.screenSpaceCameraController;

        if (controller) {
          controller.enableRotate = false;
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((event) => {
      const draggingId = draggingIdRef.current;

      if (!draggingId || busyRef.current) {
        return;
      }
      const now = performance.now();

      if (now - lastDragUpdateRef.current < 80) {
        return;
      }
      const endPosition = (event as { endPosition?: unknown }).endPosition;
      const cartographic = endPosition ? pickCartographic(endPosition) : null;

      if (cartographic) {
        lastDragUpdateRef.current = now;
        updateWaypoint(draggingId, {
          lon: Cesium.Math.toDegrees(cartographic.longitude),
          lat: Cesium.Math.toDegrees(cartographic.latitude),
        });
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      draggingIdRef.current = null;
      const controller = viewer.scene.screenSpaceCameraController;

      if (controller) {
        controller.enableRotate = true;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    handler.setInputAction((event) => {
      if (!pickModeRef.current || busyRef.current) {
        return;
      }
      const position = (event as { position?: unknown }).position;
      const cartographic = position ? pickCartographic(position) : null;

      if (!cartographic) {
        return;
      }
      const lon = Cesium.Math.toDegrees(cartographic.longitude);
      const lat = Cesium.Math.toDegrees(cartographic.latitude);
      const groundHeight = viewer.scene.globe.getHeight?.(cartographic) ?? 0;
      const id = appendWaypoint({
        lon,
        lat,
        height: Math.max(groundHeight + 300, 100),
        heading: 0,
        pitch: -30,
        duration: 3,
      });

      setSelectedWaypointId(id);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      draggingIdRef.current = null;
    };
  }, [cesiumScene, isGlobe, updateWaypoint, appendWaypoint, setSelectedWaypointId]);

  // 取点模式的光标提示
  useEffect(() => {
    const canvas = cesiumScene?.viewer.canvas;

    if (!canvas) {
      return;
    }
    canvas.style.cursor = pickModeActive ? 'crosshair' : '';
  }, [cesiumScene, pickModeActive]);

  return null;
}
