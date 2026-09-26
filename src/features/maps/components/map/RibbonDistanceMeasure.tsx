import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import maplibregl from 'maplibre-gl';
import type { MapViewMode } from './MapCommandContext';
import type { DistanceKind } from './distanceMeasurement';
import {
  appendMeasurePoint,
  createCesiumDistanceEntities,
  formatDistance,
  measureDistance,
  measureTerrainDistance,
  pickGlobeSurfacePoint,
  pointFromMapEvent,
  type MeasurePoint,
} from './MapMeasurePanel';
import type { CesiumNamespace, CesiumViewer } from './cesiumRuntime';

const RIBBON_DISTANCE_SOURCE_ID = 'cte-ribbon-distance';
const RIBBON_DISTANCE_LINE_LAYER_ID = 'cte-ribbon-distance-line';
const RIBBON_DISTANCE_PREVIEW_LINE_LAYER_ID = 'cte-ribbon-distance-preview-line';
const RIBBON_DISTANCE_POINT_LAYER_ID = 'cte-ribbon-distance-points';
const RIBBON_DISTANCE_LABEL_LAYER_ID = 'cte-ribbon-distance-labels';

type RibbonDistanceMeasureContextValue = {
  activate: (kind: DistanceKind) => void;
  deactivate: () => void;
  distanceKind: DistanceKind | null;
};

const RibbonDistanceMeasureContext = createContext<RibbonDistanceMeasureContextValue | null>(null);

export function RibbonDistanceMeasureProvider({ children }: { children: ReactNode }) {
  const [distanceKind, setDistanceKind] = useState<DistanceKind | null>(null);

  const activate = useCallback((kind: DistanceKind) => {
    setDistanceKind(kind);
  }, []);

  const deactivate = useCallback(() => {
    setDistanceKind(null);
  }, []);

  const value = useMemo(() => ({
    activate,
    deactivate,
    distanceKind,
  }), [activate, deactivate, distanceKind]);

  return (
    <RibbonDistanceMeasureContext.Provider value={value}>
      {children}
    </RibbonDistanceMeasureContext.Provider>
  );
}

export function useRibbonDistanceMeasure() {
  const value = useContext(RibbonDistanceMeasureContext);

  if (!value) {
    throw new Error('useRibbonDistanceMeasure must be used inside RibbonDistanceMeasureProvider');
  }

  return value;
}

type FinishedRibbonDistance = {
  id: number;
  kind: DistanceKind;
  points: MeasurePoint[];
  total: number;
};

type RibbonDistanceMeasureOverlayProps = {
  cesiumScene: { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
  map: maplibregl.Map | null;
  mapMode: MapViewMode;
  mapReady: boolean;
};

export function RibbonDistanceMeasureOverlay({
  cesiumScene,
  map,
  mapMode,
  mapReady,
}: RibbonDistanceMeasureOverlayProps) {
  const { deactivate, distanceKind } = useRibbonDistanceMeasure();
  const [points, setPoints] = useState<MeasurePoint[]>([]);
  const [previewPoint, setPreviewPoint] = useState<MeasurePoint | null>(null);
  const [finished, setFinished] = useState<FinishedRibbonDistance[]>([]);
  const [terrainRevision, setTerrainRevision] = useState(0);
  const finishedIdRef = useRef(0);

  const isGlobe = mapMode === 'globe';
  const isTerrainKind = distanceKind === 'surface' && isGlobe && Boolean(cesiumScene);

  const totalDistance = useMemo(() => {
    if (!distanceKind) {
      return 0;
    }

    return isTerrainKind && cesiumScene
      ? measureTerrainDistance(cesiumScene.viewer, cesiumScene.Cesium, points)
      : measureDistance(points, distanceKind);
  }, [cesiumScene, distanceKind, isTerrainKind, points, terrainRevision]);

  const previewDistance = useMemo(() => {
    if (!distanceKind) {
      return 0;
    }

    const target = previewPoint && points.length > 0 ? [...points, previewPoint] : points;

    return isTerrainKind && cesiumScene
      ? measureTerrainDistance(cesiumScene.viewer, cesiumScene.Cesium, target)
      : measureDistance(target, distanceKind);
  }, [cesiumScene, distanceKind, isTerrainKind, points, previewPoint, terrainRevision]);

  useEffect(() => {
    setPoints([]);
    setPreviewPoint(null);
    setFinished([]);
  }, [distanceKind]);

  const clearDraft = useCallback(() => {
    setPoints([]);
    setPreviewPoint(null);
  }, []);

  const finish = useCallback(() => {
    if (!distanceKind || points.length < 2) {
      setPreviewPoint(null);

      return;
    }

    const total = isTerrainKind && cesiumScene
      ? measureTerrainDistance(cesiumScene.viewer, cesiumScene.Cesium, points)
      : measureDistance(points, distanceKind);

    finishedIdRef.current += 1;
    setFinished((current) => [...current, {
      id: finishedIdRef.current,
      kind: distanceKind,
      points: points.map((point) => ({ ...point })),
      total,
    }]);
    setPoints([]);
    setPreviewPoint(null);
  }, [cesiumScene, distanceKind, isTerrainKind, points]);

  useEffect(() => {
    if (!distanceKind || !isTerrainKind || !cesiumScene || cesiumScene.viewer.isDestroyed()) {
      return;
    }

    const { viewer } = cesiumScene;
    let timeoutId: number | null = null;
    const scheduleTerrainRefresh = () => {
      if (timeoutId !== null) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        setTerrainRevision((current) => current + 1);
      }, 160);
    };
    const removeCameraChanged = viewer.camera.changed?.addEventListener(scheduleTerrainRefresh);
    const removeTileProgress = viewer.scene.globe.tileLoadProgressEvent?.addEventListener((queuedTileCount) => {
      if (queuedTileCount === 0) {
        scheduleTerrainRefresh();
      }
    });

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      removeCameraChanged?.();
      removeTileProgress?.();
    };
  }, [cesiumScene, distanceKind, isTerrainKind]);

  useEffect(() => {
    if (!distanceKind || !cesiumScene || !isGlobe || cesiumScene.viewer.isDestroyed()) {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    const previousCursor = viewer.canvas.style.cursor;

    viewer.canvas.style.cursor = 'crosshair';
    viewer.canvas.addEventListener('contextmenu', preventDefault);

    handler.setInputAction((event) => {
      const point = pickGlobeSurfacePoint(Cesium, viewer, event.position);

      if (point) {
        setPoints((current) => appendMeasurePoint(current, point));
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((event) => {
      setPreviewPoint(pickGlobeSurfacePoint(Cesium, viewer, event.endPosition));
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      finish();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    handler.setInputAction(() => {
      finish();
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();

      if (points.length > 0) {
        clearDraft();
      } else {
        deactivate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      handler.destroy();
      viewer.canvas.removeEventListener('contextmenu', preventDefault);
      viewer.canvas.style.cursor = previousCursor;
      setPreviewPoint(null);
    };
  }, [cesiumScene, clearDraft, deactivate, distanceKind, finish, isGlobe, points.length]);

  useEffect(() => {
    if (!distanceKind || !cesiumScene || !isGlobe || cesiumScene.viewer.isDestroyed()) {
      return;
    }

    const visiblePreviewPoint = previewPoint && points.length > 0 ? previewPoint : null;
    const entities = createCesiumDistanceEntities(
      cesiumScene.viewer,
      cesiumScene.Cesium,
      points,
      visiblePreviewPoint,
      previewDistance,
      distanceKind,
      false,
      {},
    );

    return () => {
      entities.forEach((entity) => {
        cesiumScene.viewer.entities.remove(entity);
      });
      cesiumScene.viewer.scene.requestRender?.();
    };
  }, [cesiumScene, distanceKind, isGlobe, points, previewDistance, previewPoint]);

  useEffect(() => {
    if (!cesiumScene || !isGlobe || cesiumScene.viewer.isDestroyed() || finished.length === 0) {
      return;
    }

    const entities = finished.flatMap((measurement) => createCesiumDistanceEntities(
      cesiumScene.viewer,
      cesiumScene.Cesium,
      measurement.points,
      null,
      measurement.total,
      measurement.kind,
      false,
      {},
    ));

    return () => {
      entities.forEach((entity) => {
        cesiumScene.viewer.entities.remove(entity);
      });
      cesiumScene.viewer.scene.requestRender?.();
    };
  }, [cesiumScene, finished, isGlobe]);

  useEffect(() => {
    if (!distanceKind || !map || isGlobe || !mapReady) {
      return;
    }

    const canvas = map.getCanvas();
    const wasDoubleClickZoomEnabled = map.doubleClickZoom.isEnabled();
    const previousCursor = canvas.style.cursor;

    map.doubleClickZoom.disable();
    canvas.style.cursor = 'crosshair';

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      event.preventDefault();
      setPoints((current) => appendMeasurePoint(current, pointFromMapEvent(map, event)));
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      setPreviewPoint(pointFromMapEvent(map, event));
    };

    const handleFinish = (event: maplibregl.MapMouseEvent) => {
      event.preventDefault();
      finish();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();

      if (points.length > 0) {
        clearDraft();
      } else {
        deactivate();
      }
    };

    map.on('click', handleClick);
    map.on('mousemove', handleMouseMove);
    map.on('dblclick', handleFinish);
    map.on('contextmenu', handleFinish);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      map.off('click', handleClick);
      map.off('mousemove', handleMouseMove);
      map.off('dblclick', handleFinish);
      map.off('contextmenu', handleFinish);

      if (wasDoubleClickZoomEnabled) {
        map.doubleClickZoom.enable();
      }

      canvas.style.cursor = previousCursor;
      setPreviewPoint(null);
    };
  }, [clearDraft, deactivate, distanceKind, finish, isGlobe, map, mapReady, points.length]);

  useEffect(() => {
    if (!distanceKind || !map || isGlobe || !mapReady) {
      return;
    }

    const handleStyleData = () => {
      ensureRibbonDistanceLayers(map);
      updateRibbonDistanceSource(map, finished, points, previewPoint, previewDistance, totalDistance, distanceKind);
    };

    map.on('styledata', handleStyleData);
    ensureRibbonDistanceLayers(map);
    updateRibbonDistanceSource(map, finished, points, previewPoint, previewDistance, totalDistance, distanceKind);

    return () => {
      map.off('styledata', handleStyleData);
      removeRibbonDistanceLayers(map);
    };
  }, [distanceKind, finished, isGlobe, map, mapReady, points, previewDistance, previewPoint, totalDistance]);

  return null;
}

function preventDefault(event: Event) {
  event.preventDefault();
}

function ensureRibbonDistanceLayers(map: maplibregl.Map) {
  if (!map.isStyleLoaded()) {
    return;
  }

  if (!map.getSource(RIBBON_DISTANCE_SOURCE_ID)) {
    map.addSource(RIBBON_DISTANCE_SOURCE_ID, {
      data: emptyFeatureCollection(),
      type: 'geojson',
    });
  }

  if (!map.getLayer(RIBBON_DISTANCE_LINE_LAYER_ID)) {
    map.addLayer({
      id: RIBBON_DISTANCE_LINE_LAYER_ID,
      source: RIBBON_DISTANCE_SOURCE_ID,
      type: 'line',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'preview'], true]],
      paint: {
        'line-color': '#e58a00',
        'line-width': 3,
      },
    });
  }

  if (!map.getLayer(RIBBON_DISTANCE_PREVIEW_LINE_LAYER_ID)) {
    map.addLayer({
      id: RIBBON_DISTANCE_PREVIEW_LINE_LAYER_ID,
      source: RIBBON_DISTANCE_SOURCE_ID,
      type: 'line',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'preview'], true]],
      paint: {
        'line-color': '#0f766e',
        'line-dasharray': [1.2, 1.2],
        'line-width': 2,
      },
    });
  }

  if (!map.getLayer(RIBBON_DISTANCE_POINT_LAYER_ID)) {
    map.addLayer({
      id: RIBBON_DISTANCE_POINT_LAYER_ID,
      source: RIBBON_DISTANCE_SOURCE_ID,
      type: 'circle',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': '#ffffff',
        'circle-radius': 4,
        'circle-stroke-color': '#e58a00',
        'circle-stroke-width': 2,
      },
    });
  }

  if (!map.getLayer(RIBBON_DISTANCE_LABEL_LAYER_ID)) {
    map.addLayer({
      id: RIBBON_DISTANCE_LABEL_LAYER_ID,
      source: RIBBON_DISTANCE_SOURCE_ID,
      type: 'symbol',
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-anchor': 'top',
        'text-field': ['to-string', ['get', 'label']],
        'text-offset': [0, 1],
        'text-size': 11,
      },
      paint: {
        'text-color': '#17202a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
    });
  }
}

function updateRibbonDistanceSource(
  map: maplibregl.Map,
  finished: FinishedRibbonDistance[],
  points: MeasurePoint[],
  previewPoint: MeasurePoint | null,
  previewDistance: number,
  totalDistance: number,
  distanceKind: DistanceKind,
) {
  if (!map.isStyleLoaded()) {
    return;
  }

  const source = map.getSource(RIBBON_DISTANCE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

  if (!source) {
    return;
  }

  source.setData(buildRibbonDistanceFeatures(
    finished,
    points,
    previewPoint,
    previewDistance,
    totalDistance,
    distanceKind,
  ));
}

function removeRibbonDistanceLayers(map: maplibregl.Map) {
  [
    RIBBON_DISTANCE_LABEL_LAYER_ID,
    RIBBON_DISTANCE_POINT_LAYER_ID,
    RIBBON_DISTANCE_PREVIEW_LINE_LAYER_ID,
    RIBBON_DISTANCE_LINE_LAYER_ID,
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });

  if (map.getSource(RIBBON_DISTANCE_SOURCE_ID)) {
    map.removeSource(RIBBON_DISTANCE_SOURCE_ID);
  }
}

function buildRibbonDistanceFeatures(
  finished: FinishedRibbonDistance[],
  points: MeasurePoint[],
  previewPoint: MeasurePoint | null,
  previewDistance: number,
  totalDistance: number,
  distanceKind: DistanceKind,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const kindLabel = distanceKind === 'space' ? '空间' : '贴地';

  finished.forEach((measurement) => {
    features.push({
      geometry: {
        coordinates: measurement.points.map((point) => [point.lon, point.lat]),
        type: 'LineString',
      },
      properties: {},
      type: 'Feature',
    });

    const endPoint = measurement.points.at(-1);

    if (endPoint) {
      features.push({
        geometry: { coordinates: [endPoint.lon, endPoint.lat], type: 'Point' },
        properties: {
          label: `${formatDistance(measurement.total)} ${measurement.kind === 'space' ? '空间' : '贴地'}`,
        },
        type: 'Feature',
      });
    }
  });

  if (points.length > 0) {
    features.push({
      geometry: {
        coordinates: points.map((point) => [point.lon, point.lat]),
        type: 'LineString',
      },
      properties: {},
      type: 'Feature',
    });

    points.forEach((point) => {
      features.push({
        geometry: { coordinates: [point.lon, point.lat], type: 'Point' },
        properties: {},
        type: 'Feature',
      });
    });
  }

  if (previewPoint && points.length > 0) {
    const anchor = points[points.length - 1];

    features.push({
      geometry: {
        coordinates: [[anchor.lon, anchor.lat], [previewPoint.lon, previewPoint.lat]],
        type: 'LineString',
      },
      properties: { preview: true },
      type: 'Feature',
    });

    features.push({
      geometry: { coordinates: [previewPoint.lon, previewPoint.lat], type: 'Point' },
      properties: { label: `${formatDistance(previewDistance)} ${kindLabel}` },
      type: 'Feature',
    });
  } else if (points.length > 0 && totalDistance > 0) {
    const endPoint = points[points.length - 1];

    features.push({
      geometry: { coordinates: [endPoint.lon, endPoint.lat], type: 'Point' },
      properties: { label: `${formatDistance(totalDistance)} ${kindLabel}` },
      type: 'Feature',
    });
  }

  return { features, type: 'FeatureCollection' };
}

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    features: [],
    type: 'FeatureCollection',
  };
}
