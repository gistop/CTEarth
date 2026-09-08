import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Check, LocateFixed, MousePointer2, Ruler, Square, Undo2, X } from 'lucide-react';
import { useMapCommands, type MapViewMode } from './MapCommandContext';
import { useMapMeasure, type MeasureMode } from './MapMeasureContext';
import { loadCesium, type CesiumNamespace, type CesiumViewer } from './cesiumRuntime';
import { getRasterBasemapDefinitions, type RasterBasemapTileDefinition } from './rasterBasemapSources';

type MeasurePoint = {
  height: number;
  lat: number;
  lon: number;
};

type DistanceKind = 'space' | 'surface';

type DistanceDimensionAnnotation = {
  distance: number;
  endIndex: number;
  endPosition: unknown;
  id: string;
  offsetMeters: number;
  startIndex: number;
  startPosition: unknown;
};

type DistanceDimensionDragState = {
  annotation: DistanceDimensionAnnotation | null;
  cursorWasEnabled: boolean | undefined;
  startOffset: number;
  startY: number;
};

type MapMeasurePanelProps = {
  cesiumScene: { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
  map: maplibregl.Map | null;
  mapMode: MapViewMode;
  mapReady: boolean;
};

const measureModes: {
  id: MeasureMode;
  label: string;
}[] = [
  { id: 'coordinate', label: '坐标' },
  { id: 'distance', label: '距离' },
  { id: 'area', label: '面积' },
  { id: 'volume', label: '体积' },
];

const MEASURE_SOURCE_ID = 'cte-measure-distance';
const MEASURE_LINE_LAYER_ID = 'cte-measure-distance-line';
const MEASURE_PREVIEW_LINE_LAYER_ID = 'cte-measure-distance-preview-line';
const MEASURE_POINT_LAYER_ID = 'cte-measure-distance-points';
const MEASURE_LABEL_LAYER_ID = 'cte-measure-distance-labels';
const EARTH_RADIUS_METERS = 6371008.8;
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const VERTICAL_AXIS_BELOW_GROUND_METERS = 25_000;
const VERTICAL_AXIS_ABOVE_GROUND_METERS = 25_000;
const CESIUM_LINE_TERRAIN_SAMPLE_SPACING_METERS = 250;
const CESIUM_LINE_TERRAIN_SAMPLE_MIN_COUNT = 32;
const CESIUM_LINE_TERRAIN_SAMPLE_MAX_COUNT = 192;

export function MapMeasurePanel({ cesiumScene, map, mapMode, mapReady }: MapMeasurePanelProps) {
  const { closeMeasure, isMeasureOpen, mode, setMode } = useMapMeasure();
  const [points, setPoints] = useState<MeasurePoint[]>([]);
  const [previewPoint, setPreviewPoint] = useState<MeasurePoint | null>(null);
  const [locatorDraft, setLocatorDraft] = useState<MeasurePoint | null>(null);
  const [isSelectingHeight, setIsSelectingHeight] = useState(false);
  const [terrainRevision, setTerrainRevision] = useState(0);
  const locatorBaseHeightRef = useRef(0);
  const locatorCurrentHeightRef = useRef(0);
  const dimensionOffsetsRef = useRef<Record<string, number>>({});
  const dimensionDragRef = useRef<DistanceDimensionDragState>({
    annotation: null,
    cursorWasEnabled: undefined,
    startOffset: 0,
    startY: 0,
  });
  const [distanceKind, setDistanceKind] = useState<DistanceKind>('surface');
  const [isDrawingFinished, setIsDrawingFinished] = useState(false);
  const isDistanceMode = isMeasureOpen && mode === 'distance';
  const isDistanceReady = isDistanceMode && (
    (mapMode === 'globe' && Boolean(cesiumScene))
    || (mapMode !== 'globe' && mapReady && Boolean(map))
  );
  const result = useMemo(() => measureDistance(points, distanceKind), [distanceKind, points]);
  const visiblePreviewPoint = previewPoint && mapMode !== 'globe' && points.length > 0 && !isDrawingFinished ? previewPoint : null;
  const globePreviewPoint = locatorDraft && mapMode === 'globe' && isSelectingHeight && !isDrawingFinished ? locatorDraft : null;
  const activePreviewPoint = globePreviewPoint ?? visiblePreviewPoint;
  const previewResult = useMemo(
    () => measureDistance(activePreviewPoint ? [...points, activePreviewPoint] : points, distanceKind),
    [activePreviewPoint, distanceKind, points],
  );

  useEffect(() => {
    locatorCurrentHeightRef.current = locatorDraft?.height ?? points.at(-1)?.height ?? 0;
  }, [locatorDraft?.height, points]);

  const clear = useCallback(() => {
    dimensionOffsetsRef.current = {};
    dimensionDragRef.current.annotation = null;
    setPoints([]);
    setPreviewPoint(null);
    setLocatorDraft(null);
    setIsSelectingHeight(false);
    setIsDrawingFinished(false);
  }, []);

  const undo = useCallback(() => {
    setPoints((current) => {
      const next = current.slice(0, -1);

      pruneDimensionOffsets(dimensionOffsetsRef.current, next.length);
      return next;
    });
    dimensionDragRef.current.annotation = null;
    setPreviewPoint(null);
    setLocatorDraft(null);
    setIsSelectingHeight(false);
    setIsDrawingFinished(false);
  }, []);

  const confirmLocatorPoint = useCallback(() => {
    if (!locatorDraft) {
      return;
    }

    setPoints((current) => {
      const previous = current.at(-1);

      if (previous && distanceBetweenSurfacePoints(previous, locatorDraft) < 0.2) {
        return current;
      }

      return [...current, locatorDraft];
    });
    setLocatorDraft(null);
    setIsSelectingHeight(false);
    setPreviewPoint(null);
    setIsDrawingFinished(false);
  }, [locatorDraft]);

  const finish = useCallback(() => {
    if (mapMode === 'globe' && locatorDraft && isSelectingHeight) {
      confirmLocatorPoint();
      return;
    }

    setPreviewPoint(null);
    setLocatorDraft(null);
    setIsSelectingHeight(false);
    setIsDrawingFinished(true);
  }, [confirmLocatorPoint, isSelectingHeight, locatorDraft, mapMode]);

  const handleOverviewPick = useCallback((point: MeasurePoint) => {
    const height = locatorCurrentHeightRef.current;

    locatorBaseHeightRef.current = height;
    setLocatorDraft({
      ...point,
      height,
    });
    setPreviewPoint(null);
    setIsSelectingHeight(true);
    setIsDrawingFinished(false);
  }, []);

  const updateLocatorDraft = useCallback((patch: Partial<MeasurePoint>) => {
    if (patch.height !== undefined && Number.isFinite(patch.height)) {
      locatorBaseHeightRef.current = patch.height;
    }

    setLocatorDraft((current) => ({
      height: Number.isFinite(patch.height) ? patch.height as number : current?.height ?? 0,
      lat: Number.isFinite(patch.lat) ? clampLatitude(patch.lat as number) : current?.lat ?? 0,
      lon: Number.isFinite(patch.lon) ? clampLongitude(patch.lon as number) : current?.lon ?? 0,
    }));
    setIsSelectingHeight(true);
    setIsDrawingFinished(false);
  }, []);

  useEffect(() => {
    if (!isMeasureOpen) {
      clear();
    }
  }, [clear, isMeasureOpen]);

  useEffect(() => {
    if (isDistanceMode && mapMode === 'globe') {
      setDistanceKind('space');
    }
  }, [isDistanceMode, mapMode]);

  useEffect(() => {
    if (!cesiumScene || !isDistanceMode || mapMode !== 'globe') {
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
  }, [cesiumScene, isDistanceMode, mapMode]);

  useEffect(() => {
    if (!map || !mapReady) {
      return;
    }

    ensureDistanceMeasureLayers(map);

    const handleStyleData = () => {
      ensureDistanceMeasureLayers(map);
      updateDistanceMeasureSource(map, points, visiblePreviewPoint, result, previewResult, distanceKind);
    };

    map.on('styledata', handleStyleData);

    return () => {
      map.off('styledata', handleStyleData);
      removeDistanceMeasureLayers(map);
    };
  }, [distanceKind, map, mapReady, points, previewResult, result, visiblePreviewPoint]);

  useEffect(() => {
    if (!map || !mapReady) {
      return;
    }

    ensureDistanceMeasureLayers(map);
    updateDistanceMeasureSource(map, points, visiblePreviewPoint, result, previewResult, distanceKind);
  }, [distanceKind, map, mapReady, points, previewResult, result, visiblePreviewPoint]);

  useEffect(() => {
    if (!map || mapMode === 'globe' || !isDistanceReady || isDrawingFinished) {
      return;
    }

    const wasDoubleClickZoomEnabled = map.doubleClickZoom.isEnabled();
    const canvas = map.getCanvas();

    map.doubleClickZoom.disable();
    canvas.classList.add('is-measuring-distance');

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      event.preventDefault();
      const nextPoint = pointFromMapEvent(map, event);

      setPoints((current) => {
        const previous = current.at(-1);

        if (previous && distanceBetweenSurfacePoints(previous, nextPoint) < 0.2) {
          return current;
        }

        return [...current, nextPoint];
      });
      setPreviewPoint(null);
      setIsDrawingFinished(false);
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      if (points.length === 0) {
        return;
      }

      setPreviewPoint(pointFromMapEvent(map, event));
    };

    const handleDoubleClick = (event: maplibregl.MapMouseEvent) => {
      event.preventDefault();
      finish();
    };

    const handleContextMenu = (event: maplibregl.MapMouseEvent) => {
      event.preventDefault();
      finish();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      if (points.length === 0) {
        closeMeasure();
      } else {
        finish();
      }
    };

    map.on('click', handleClick);
    map.on('mousemove', handleMouseMove);
    map.on('dblclick', handleDoubleClick);
    map.on('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      map.off('click', handleClick);
      map.off('mousemove', handleMouseMove);
      map.off('dblclick', handleDoubleClick);
      map.off('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      canvas.classList.remove('is-measuring-distance');

      if (wasDoubleClickZoomEnabled) {
        map.doubleClickZoom.enable();
      }
    };
  }, [closeMeasure, finish, isDistanceReady, isDrawingFinished, map, mapMode, points.length]);

  useEffect(() => {
    if (!cesiumScene || !isDistanceMode || mapMode !== 'globe') {
      return;
    }

    const entities = createCesiumDistanceEntities(
      cesiumScene.viewer,
      cesiumScene.Cesium,
      points,
      globePreviewPoint,
      previewResult,
      distanceKind,
      isSelectingHeight,
      dimensionOffsetsRef.current,
    );

    return () => {
      entities.forEach((entity) => {
        cesiumScene.viewer.entities.remove(entity);
      });
    };
  }, [cesiumScene, distanceKind, globePreviewPoint, isDistanceMode, isSelectingHeight, mapMode, points, previewResult, terrainRevision]);

  useEffect(() => {
    if (!cesiumScene || !isDistanceReady || mapMode !== 'globe') {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    const previousCursor = viewer.canvas.style.cursor;
    const controller = viewer.scene.screenSpaceCameraController;
    const previousInputsEnabled = controller?.enableInputs;

    viewer.canvas.style.cursor = isDrawingFinished ? '' : 'crosshair';
    if (controller && isSelectingHeight) {
      controller.enableInputs = false;
    }
    viewer.canvas.addEventListener('contextmenu', preventDefault);

    handler.setInputAction((event) => {
      if (dimensionDragRef.current.annotation) {
        updateDistanceDimensionDrag(viewer, event.endPosition, dimensionOffsetsRef.current, dimensionDragRef.current);
        return;
      }

      if (!locatorDraft || !isSelectingHeight || isDrawingFinished) {
        viewer.canvas.style.cursor = getDistanceDimensionAnnotation(Cesium, viewer, event.endPosition) ? 'grab' : '';
        return;
      }

      setLocatorDraft({
        ...locatorDraft,
        height: heightFromMainSceneMouse(viewer, event.endPosition, locatorBaseHeightRef.current),
      });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((event) => {
      if (isSelectingHeight) {
        return;
      }

      const annotation = getDistanceDimensionAnnotation(Cesium, viewer, event.position);

      if (annotation) {
        startDistanceDimensionDrag(viewer, event.position, annotation, dimensionDragRef.current);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction(() => {
      endDistanceDimensionDrag(viewer, dimensionDragRef.current);
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    handler.setInputAction(() => {
      if (locatorDraft && isSelectingHeight && !isDrawingFinished) {
        confirmLocatorPoint();
      } else if (points.length >= 2) {
        finish();
      }
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    handler.setInputAction(() => {
      if (locatorDraft && isSelectingHeight && !isDrawingFinished) {
        confirmLocatorPoint();
      } else if (points.length >= 2) {
        finish();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      if (dimensionDragRef.current.annotation) {
        endDistanceDimensionDrag(viewer, dimensionDragRef.current);
        return;
      }

      if (points.length === 0) {
        closeMeasure();
      } else {
        finish();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      endDistanceDimensionDrag(viewer, dimensionDragRef.current);
      handler.destroy();
      window.removeEventListener('keydown', handleKeyDown);
      viewer.canvas.removeEventListener('contextmenu', preventDefault);
      viewer.canvas.style.cursor = previousCursor;
      if (controller && previousInputsEnabled !== undefined) {
        controller.enableInputs = previousInputsEnabled;
      }
    };
  }, [cesiumScene, closeMeasure, confirmLocatorPoint, finish, isDistanceReady, isDrawingFinished, isSelectingHeight, locatorDraft, mapMode, points.length]);

  if (!isMeasureOpen) {
    return null;
  }

  return (
    <aside className="map-measure-panel" aria-label="测量">
      <header className="map-measure-panel-header">
        <div>
          <Ruler size={15} strokeWidth={1.8} />
          <span>测量</span>
        </div>
        <button type="button" title="关闭" aria-label="关闭" onClick={closeMeasure}>
          <X size={14} strokeWidth={1.8} />
        </button>
      </header>

      <div className="map-measure-tabs" role="tablist" aria-label="测量类型">
        {measureModes.map((item) => (
          <button
            key={item.id}
            className={mode === item.id ? 'is-selected' : undefined}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            onClick={() => setMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="map-measure-body">
        <MeasureOverviewMap
          enabled={mapReady || Boolean(cesiumScene)}
          mainCesium={cesiumScene}
          mainMap={map}
          mapMode={mapMode}
          selectedPoint={locatorDraft ?? points.at(-1) ?? null}
          onPick={handleOverviewPick}
        />
        {mode === 'distance' ? (
          <DistanceMeasureMode
            distanceKind={distanceKind}
            draftPoint={locatorDraft}
            isReady={isDistanceReady}
            isFinished={isDrawingFinished}
            isSelectingHeight={isSelectingHeight}
            mapMode={mapMode}
            pointCount={points.length}
            previewDistance={previewResult}
            resultDistance={result}
            onDistanceKindChange={setDistanceKind}
            onDraftPointChange={updateLocatorDraft}
          />
        ) : (
          <PlaceholderMeasureMode mode={mode} />
        )}
      </div>

      <footer className="map-measure-footer">
        <button type="button" title="撤销点" disabled={mode !== 'distance' || points.length === 0} onClick={undo}>
          <Undo2 size={14} strokeWidth={1.8} />
          <span>撤销</span>
        </button>
        <button type="button" title="清除" disabled={mode !== 'distance' || points.length === 0} onClick={clear}>
          <X size={14} strokeWidth={1.8} />
          <span>清除</span>
        </button>
        <button type="button" title={locatorDraft && isSelectingHeight ? '确认点' : '完成'} disabled={mode !== 'distance' || (!locatorDraft && points.length < 2)} onClick={finish}>
          <Check size={14} strokeWidth={1.8} />
          <span>{locatorDraft && isSelectingHeight ? '确认点' : '完成'}</span>
        </button>
      </footer>
    </aside>
  );
}

function DistanceMeasureMode({
  distanceKind,
  draftPoint,
  isFinished,
  isReady,
  isSelectingHeight,
  mapMode,
  pointCount,
  previewDistance,
  resultDistance,
  onDistanceKindChange,
  onDraftPointChange,
}: {
  distanceKind: DistanceKind;
  draftPoint: MeasurePoint | null;
  isFinished: boolean;
  isReady: boolean;
  isSelectingHeight: boolean;
  mapMode: MapViewMode;
  pointCount: number;
  previewDistance: number;
  resultDistance: number;
  onDistanceKindChange: (kind: DistanceKind) => void;
  onDraftPointChange: (patch: Partial<MeasurePoint>) => void;
}) {
  const visibleDistance = !isFinished && previewDistance > 0 ? previewDistance : resultDistance;

  return (
    <section className="map-measure-mode">
      <div className="map-measure-mode-title">
        <Ruler size={14} strokeWidth={1.8} />
        <span>距离测量</span>
      </div>
      <div className="map-measure-choice-group" role="radiogroup" aria-label="距离测量模式">
        <button
          className={distanceKind === 'space' ? 'is-selected' : undefined}
          type="button"
          role="radio"
          aria-checked={distanceKind === 'space'}
          onClick={() => onDistanceKindChange('space')}
        >
          空间直线
        </button>
        <button
          className={distanceKind === 'surface' ? 'is-selected' : undefined}
          type="button"
          role="radio"
          aria-checked={distanceKind === 'surface'}
          disabled={mapMode === 'globe'}
          title={mapMode === 'globe' ? '三维测量使用经纬度与高度生成空间点' : '贴地折线'}
          onClick={() => onDistanceKindChange('surface')}
        >
          贴地折线
        </button>
      </div>
      {mapMode === 'globe' ? (
        <div className="map-measure-coordinate-grid" aria-label="当前测量点">
          <label>
            <span>经度</span>
            <input
              type="number"
              min="-180"
              max="180"
              step="0.000001"
              value={draftPoint ? trimNumber(draftPoint.lon, 6) : ''}
              placeholder="--"
              onChange={(event) => onDraftPointChange({ lon: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>纬度</span>
            <input
              type="number"
              min="-90"
              max="90"
              step="0.000001"
              value={draftPoint ? trimNumber(draftPoint.lat, 6) : ''}
              placeholder="--"
              onChange={(event) => onDraftPointChange({ lat: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>高度</span>
            <input
              type="number"
              step="1"
              value={draftPoint ? trimNumber(draftPoint.height, 2) : ''}
              placeholder="--"
              onChange={(event) => onDraftPointChange({ height: Number(event.target.value) })}
            />
          </label>
        </div>
      ) : null}
      <div className="map-measure-result">
        <div className="map-measure-result-title">结果</div>
        <dl>
          <div>
            <dt>总长</dt>
            <dd>{formatDistance(visibleDistance)}</dd>
          </div>
          <div>
            <dt>点数</dt>
            <dd>{pointCount}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{getDistanceStatus(isReady, isFinished, pointCount, mapMode, isSelectingHeight)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function PlaceholderMeasureMode({ mode }: { mode: MeasureMode }) {
  const content = {
    coordinate: {
      icon: LocateFixed,
      title: '坐标提取',
      body: '经纬度、椭球高、地形高提取入口已预留。',
    },
    area: {
      icon: Square,
      title: '面积测量',
      body: '多边形面积测量入口已预留。',
    },
    volume: {
      icon: MousePointer2,
      title: '体积测量',
      body: '基准面、挖方、填方和净方量入口已预留。',
    },
    distance: {
      icon: Ruler,
      title: '距离测量',
      body: '',
    },
  }[mode];
  const Icon = content.icon;

  return (
    <section className="map-measure-mode">
      <div className="map-measure-mode-title">
        <Icon size={14} strokeWidth={1.8} />
        <span>{content.title}</span>
      </div>
      <div className="map-measure-placeholder">{content.body}</div>
    </section>
  );
}

function MeasureOverviewMap({
  enabled,
  mainCesium,
  mainMap,
  mapMode,
  selectedPoint,
  onPick,
}: {
  enabled: boolean;
  mainCesium: { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
  mainMap: maplibregl.Map | null;
  mapMode: MapViewMode;
  selectedPoint: MeasurePoint | null;
  onPick: (point: MeasurePoint) => void;
}) {
  const { mapCommandState } = useMapCommands();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const creditsRef = useRef<HTMLDivElement | null>(null);
  const overviewRef = useRef<{ Cesium: CesiumNamespace; handler: { destroy: () => void } | null; pointEntity: unknown | null; viewer: CesiumViewer } | null>(null);
  const selectedHeightRef = useRef(0);
  const [readout, setReadout] = useState('--');
  const [status, setStatus] = useState('');

  useEffect(() => {
    selectedHeightRef.current = selectedPoint?.height ?? 0;
  }, [selectedPoint?.height]);

  useEffect(() => {
    const container = containerRef.current;
    const credits = creditsRef.current;

    if (!enabled || !container || !credits || (!mainMap && !mainCesium)) {
      return;
    }

    let isCancelled = false;
    let cleanupMainMapListener: (() => void) | null = null;
    let animationFrame = 0;

    const createOverview = async () => {
      setStatus('正在加载平面地图');

      try {
        const Cesium = await loadCesium();

        if (isCancelled) {
          return;
        }

        const viewer = new Cesium.Viewer(container, {
          animation: false,
          baseLayer: false,
          baseLayerPicker: false,
          creditContainer: credits,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          navigationHelpButton: false,
          sceneMode: Cesium.SceneMode.SCENE2D,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
        });
        overviewRef.current = {
          Cesium,
          handler: null,
          pointEntity: null,
          viewer,
        };

        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#edf3f7');
        viewer.scene.globe.baseColor = Cesium.Color.LIGHTGREY;
        viewer.canvas.addEventListener('contextmenu', preventDefault);
        disableOverviewControls(viewer);
        applyOverviewImagery(
          viewer,
          Cesium,
          getRasterBasemapDefinitions(
            mapCommandState.basemapSourceKind,
            mapCommandState.basemap,
            mapCommandState.cesiumImagery,
          ),
        );

        const syncFromMain = () => {
          if (mapMode === 'globe' && mainCesium) {
            const center = syncCesiumOverviewFromCesiumGlobe(viewer, Cesium, mainCesium.viewer);

            if (center) {
              setReadout(`${center.lon.toFixed(5)}, ${center.lat.toFixed(5)}`);
            }
            return;
          }

          if (mainMap) {
            syncCesiumOverviewFromMapLibre(viewer, Cesium, mainMap);
            const center = mainMap.getCenter();
            setReadout(`${center.lng.toFixed(5)}, ${center.lat.toFixed(5)}`);
          }
        };

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
        handler.setInputAction((event) => {
          const cartesian = viewer.camera.pickEllipsoid?.(event.position, viewer.scene.globe.ellipsoid);

          if (!cartesian) {
            return;
          }

          const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
          const lon = Cesium.Math.toDegrees(cartographic.longitude);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);

          onPick({ height: selectedHeightRef.current, lat, lon });
          setReadout(`${lon.toFixed(5)}, ${lat.toFixed(5)}`);
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        overviewRef.current.handler = handler;

        if (mapMode === 'globe') {
          const syncLoop = () => {
            if (isCancelled) {
              return;
            }

            syncFromMain();
            animationFrame = window.requestAnimationFrame(syncLoop);
          };
          animationFrame = window.requestAnimationFrame(syncLoop);
        } else if (mainMap) {
          mainMap.on('move', syncFromMain);
          cleanupMainMapListener = () => mainMap.off('move', syncFromMain);
        }

        window.requestAnimationFrame(() => {
          viewer.resize?.();
          syncFromMain();
        });
        setStatus('');
      } catch (error) {
        if (!isCancelled) {
          setStatus(error instanceof Error ? error.message : '平面地图加载失败');
        }
      }
    };

    void createOverview();

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(animationFrame);
      cleanupMainMapListener?.();
      const overview = overviewRef.current;
      overviewRef.current = null;

      if (overview) {
        overview.viewer.canvas.removeEventListener('contextmenu', preventDefault);
        overview.handler?.destroy();

        if (!overview.viewer.isDestroyed()) {
          overview.viewer.destroy();
        }
      }
    };
  }, [
    enabled,
    mainCesium,
    mainMap,
    mapCommandState.basemap,
    mapCommandState.basemapSourceKind,
    mapCommandState.cesiumImagery,
    mapMode,
    onPick,
  ]);

  useEffect(() => {
    const overview = overviewRef.current;

    if (!overview || overview.viewer.isDestroyed()) {
      return;
    }

    if (!selectedPoint) {
      if (overview.pointEntity) {
        overview.viewer.entities.remove(overview.pointEntity);
        overview.pointEntity = null;
        overview.viewer.scene.requestRender?.();
      }
      return;
    }

    if (!overview.pointEntity) {
      overview.pointEntity = overview.viewer.entities.add({
        point: {
          color: overview.Cesium.Color.fromCssColorString('#32d74b'),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          outlineColor: overview.Cesium.Color.fromCssColorString('#111827'),
          outlineWidth: 2,
          pixelSize: 9,
        },
        position: overview.Cesium.Cartesian3.fromDegrees(selectedPoint.lon, selectedPoint.lat, 0),
      });
    } else {
      const entity = overview.pointEntity as { position?: unknown };
      entity.position = overview.Cesium.Cartesian3.fromDegrees(selectedPoint.lon, selectedPoint.lat, 0);
    }

    overview.viewer.scene.requestRender?.();
  }, [selectedPoint]);

  return (
    <section className="map-measure-overview" aria-label="平面定位">
      <div className="map-measure-overview-title">
        <LocateFixed size={13} strokeWidth={1.8} />
        <span>平面定位</span>
      </div>
      <div className="map-measure-overview-map" ref={containerRef}>
        <div className="map-measure-overview-crosshair" aria-hidden="true" />
      </div>
      <div ref={creditsRef} className="map-measure-overview-credits" />
      <div className="map-measure-overview-readout">{enabled ? status || readout : '等待主图就绪'}</div>
    </section>
  );
}

function preventDefault(event: Event) {
  event.preventDefault();
}

function pruneDimensionOffsets(dimensionOffsets: Record<string, number>, pointCount: number) {
  Object.keys(dimensionOffsets).forEach((key) => {
    const endIndex = Number(key.split(':')[1]);

    if (!Number.isInteger(endIndex) || endIndex >= pointCount) {
      delete dimensionOffsets[key];
    }
  });
}

function disableOverviewControls(viewer: CesiumViewer) {
  const controller = viewer.scene.screenSpaceCameraController;

  if (!controller) {
    return;
  }

  controller.enableRotate = false;
  controller.enableTranslate = false;
  controller.enableZoom = false;
  controller.enableTilt = false;
  controller.enableLook = false;
}

function applyOverviewImagery(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  definitions: RasterBasemapTileDefinition[],
) {
  viewer.imageryLayers.removeAll(true);

  definitions.forEach((definition) => {
    const url = createOverviewImageryUrl(definition);

    if (!url) {
      return;
    }

    viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      credit: definition.attribution,
      maximumLevel: definition.maxZoom,
      minimumLevel: definition.minZoom,
      subdomains: definition.urls && definition.urls.length > 1 ? '01234567' : undefined,
      tileHeight: definition.tileSize ?? 256,
      tileWidth: definition.tileSize ?? 256,
      url,
    }));
  });
}

function syncCesiumOverviewFromMapLibre(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  mainMap: maplibregl.Map,
) {
  const bounds = mainMap.getBounds();

  viewer.camera.setView({
    destination: Cesium.Rectangle.fromDegrees(
      clampLongitude(bounds.getWest()),
      clampLatitude(bounds.getSouth()),
      clampLongitude(bounds.getEast()),
      clampLatitude(bounds.getNorth()),
    ),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  });
  viewer.scene.requestRender?.();
}

function syncCesiumOverviewFromCesiumGlobe(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  mainViewer: CesiumViewer,
) {
  const rectangle = mainViewer.camera.computeViewRectangle?.(mainViewer.scene.globe.ellipsoid);

  if (!rectangle) {
    return null;
  }

  viewer.camera.setView({
    destination: rectangle,
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  });
  viewer.scene.requestRender?.();

  return {
    lat: Cesium.Math.toDegrees((rectangle.south + rectangle.north) / 2),
    lon: Cesium.Math.toDegrees((rectangle.west + rectangle.east) / 2),
  };
}

function createOverviewImageryUrl(definition: RasterBasemapTileDefinition) {
  const url = definition.urls?.[0] ?? definition.url ?? '';

  if (!url) {
    return '';
  }

  const normalizedUrl = definition.urls && definition.urls.length > 1
    ? url.replace(/\/t\d+\./, '/t{s}.')
    : url;

  return definition.scheme === 'tms'
    ? normalizedUrl.replace('{y}', '{reverseY}')
    : normalizedUrl;
}

function clampLongitude(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-180, Math.min(180, value));
}

function clampLatitude(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-89.9, Math.min(89.9, value));
}

function getDistanceStatus(
  isReady: boolean,
  isFinished: boolean,
  pointCount: number,
  mapMode: MapViewMode,
  isSelectingHeight: boolean,
) {
  if (!isReady) {
    return mapMode === 'globe' ? '等待三维视图就绪' : '等待地图就绪';
  }

  if (isFinished) {
    return '已完成';
  }

  if (mapMode === 'globe' && isSelectingHeight) {
    return '移动三维图鼠标设置高度，右键或确认点';
  }

  if (mapMode === 'globe') {
    return pointCount === 0 ? '在平面定位图单击选择经纬度' : '继续在平面定位图选择下一点';
  }

  if (pointCount === 0) {
    return '单击地图添加起点';
  }

  return '继续单击添加点，双击或右键完成';
}

function pointFromMapEvent(map: maplibregl.Map, event: maplibregl.MapMouseEvent): MeasurePoint {
  return {
    height: getTerrainHeight(map, event.lngLat),
    lat: event.lngLat.lat,
    lon: event.lngLat.lng,
  };
}

function getTerrainHeight(map: maplibregl.Map, lngLat: maplibregl.LngLat) {
  const elevation = map.queryTerrainElevation(lngLat);

  return Number.isFinite(elevation) ? elevation ?? 0 : 0;
}

function heightFromMainSceneMouse(viewer: CesiumViewer, windowPosition: unknown, baseHeight: number) {
  const y = getScreenY(windowPosition);

  if (y === null) {
    return baseHeight;
  }

  const canvasHeight = Math.max(viewer.canvas.clientHeight || viewer.canvas.height, 1);
  const centerY = canvasHeight / 2;
  const metersPerPixel = Math.max(estimateCesiumViewRangeMeters(viewer) / canvasHeight, 1);

  return baseHeight + (centerY - y) * metersPerPixel;
}

function getScreenY(position: unknown) {
  if (!position || typeof position !== 'object' || !('y' in position)) {
    return null;
  }

  const y = Number((position as { y: unknown }).y);

  return Number.isFinite(y) ? y : null;
}

function getDistanceDimensionAnnotation(
  Cesium: CesiumNamespace,
  viewer: CesiumViewer,
  windowPosition: unknown,
) {
  if (!windowPosition) {
    return null;
  }

  const picked = viewer.scene.pick?.(windowPosition);
  const pickedId = picked?.id as { properties?: { measureDimensionAnnotation?: unknown } } | undefined;
  const property = pickedId?.properties?.measureDimensionAnnotation as {
    getValue?: (time: unknown) => unknown;
  } | DistanceDimensionAnnotation | undefined;
  const value = property && 'getValue' in property && typeof property.getValue === 'function'
    ? property.getValue(Cesium.JulianDate.now())
    : property;

  return isDistanceDimensionAnnotation(value) ? value : null;
}

function isDistanceDimensionAnnotation(value: unknown): value is DistanceDimensionAnnotation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return true
    && 'id' in value
    && 'offsetMeters' in value
    && 'distance' in value;
}

function startDistanceDimensionDrag(
  viewer: CesiumViewer,
  windowPosition: unknown,
  annotation: DistanceDimensionAnnotation,
  dragState: DistanceDimensionDragState,
) {
  const y = getScreenY(windowPosition);

  if (y === null) {
    return;
  }

  const controller = viewer.scene.screenSpaceCameraController;

  dragState.annotation = annotation;
  dragState.cursorWasEnabled = controller?.enableInputs;
  dragState.startOffset = annotation.offsetMeters;
  dragState.startY = y;

  if (controller) {
    controller.enableInputs = false;
  }

  viewer.canvas.style.cursor = 'grabbing';
  viewer.scene.requestRender?.();
}

function updateDistanceDimensionDrag(
  viewer: CesiumViewer,
  windowPosition: unknown,
  dimensionOffsets: Record<string, number>,
  dragState: DistanceDimensionDragState,
) {
  const y = getScreenY(windowPosition);

  if (y === null || !dragState.annotation) {
    return;
  }

  const canvasHeight = Math.max(viewer.canvas.clientHeight || viewer.canvas.height, 1);
  const metersPerPixel = Math.max(estimateCesiumViewRangeMeters(viewer) / canvasHeight, 0.1);
  const nextOffset = dragState.startOffset + (dragState.startY - y) * metersPerPixel;

  dragState.annotation.offsetMeters = nextOffset;
  dimensionOffsets[dragState.annotation.id] = nextOffset;
  viewer.scene.requestRender?.();
}

function endDistanceDimensionDrag(viewer: CesiumViewer, dragState: DistanceDimensionDragState) {
  const controller = viewer.scene.screenSpaceCameraController;

  if (controller && dragState.cursorWasEnabled !== undefined) {
    controller.enableInputs = dragState.cursorWasEnabled;
  }

  dragState.annotation = null;
  dragState.cursorWasEnabled = undefined;
  viewer.canvas.style.cursor = '';
  viewer.scene.requestRender?.();
}

function estimateCesiumViewRangeMeters(viewer: CesiumViewer) {
  const rectangle = viewer.camera.computeViewRectangle?.(viewer.scene.globe.ellipsoid);

  if (!rectangle) {
    return Math.max(viewer.camera.positionCartographic.height, 1000);
  }

  const centerLon = (rectangle.west + rectangle.east) / 2;
  const centerLat = (rectangle.south + rectangle.north) / 2;
  const horizontal = distanceBetweenSurfacePoints(
    { height: 0, lat: toDegrees(centerLat), lon: toDegrees(rectangle.west) },
    { height: 0, lat: toDegrees(centerLat), lon: toDegrees(rectangle.east) },
  );
  const vertical = distanceBetweenSurfacePoints(
    { height: 0, lat: toDegrees(rectangle.south), lon: toDegrees(centerLon) },
    { height: 0, lat: toDegrees(rectangle.north), lon: toDegrees(centerLon) },
  );
  const range = Math.min(horizontal, vertical);

  return Number.isFinite(range) && range > 0
    ? range
    : Math.max(viewer.camera.positionCartographic.height, 1000);
}

function measureDistance(points: MeasurePoint[], kind: DistanceKind) {
  if (points.length < 2) {
    return 0;
  }

  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];

    return total + (kind === 'space'
      ? distanceBetweenSpacePoints(previous, point)
      : distanceBetweenSurfacePoints(previous, point));
  }, 0);
}

function distanceBetweenSurfacePoints(start: MeasurePoint, end: MeasurePoint) {
  const startLat = toRadians(start.lat);
  const endLat = toRadians(end.lat);
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLon = toRadians(end.lon - start.lon);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const value = sinLat * sinLat + Math.cos(startLat) * Math.cos(endLat) * sinLon * sinLon;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(1 - value, 0)));
}

function distanceBetweenSpacePoints(start: MeasurePoint, end: MeasurePoint) {
  const startCartesian = lonLatHeightToEcef(start);
  const endCartesian = lonLatHeightToEcef(end);
  const dx = endCartesian.x - startCartesian.x;
  const dy = endCartesian.y - startCartesian.y;
  const dz = endCartesian.z - startCartesian.z;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lonLatHeightToEcef(point: MeasurePoint) {
  const lon = toRadians(point.lon);
  const lat = toRadians(point.lat);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const primeVerticalRadius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const height = point.height || 0;

  return {
    x: (primeVerticalRadius + height) * cosLat * Math.cos(lon),
    y: (primeVerticalRadius + height) * cosLat * Math.sin(lon),
    z: (primeVerticalRadius * (1 - WGS84_E2) + height) * sinLat,
  };
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function toDegrees(value: number) {
  return value * 180 / Math.PI;
}

function formatDistance(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '--';
  }

  if (value < 1000) {
    return `${value.toFixed(2)} m`;
  }

  return `${(value / 1000).toFixed(3)} km`;
}

function trimNumber(value: number, digits: number) {
  if (!Number.isFinite(value)) {
    return '';
  }

  return Number.parseFloat(value.toFixed(digits)).toString();
}

function createCesiumDistanceEntities(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  points: MeasurePoint[],
  previewPoint: MeasurePoint | null,
  previewDistance: number,
  distanceKind: DistanceKind,
  isSelectingHeight: boolean,
  dimensionOffsets: Record<string, number>,
) {
  const entities: unknown[] = [];
  const toCartesian = (point: MeasurePoint) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height || 0);
  const linePoints = previewPoint && points.length > 0 ? [...points, previewPoint] : points;

  points.forEach((point, index) => {
    entities.push(...createCesiumVerticalAxisEntities(viewer, Cesium, point));

    entities.push(viewer.entities.add({
      label: createCesiumLabelOptions(Cesium, `P${index + 1}`),
      point: createCesiumPointOptions(Cesium),
      position: toCartesian(point),
    }));
  });

  if (linePoints.length >= 2) {
    entities.push(...createCesiumMeasuredLineEntities(viewer, Cesium, linePoints, distanceKind));
  }

  if (points.length >= 2) {
    entities.push(...createCesiumDistanceDimensionEntities(viewer, Cesium, points, dimensionOffsets));
  }

  if (previewPoint) {
    entities.push(...createCesiumVerticalAxisEntities(viewer, Cesium, previewPoint));

    if (isSelectingHeight) {
      entities.push(createCesiumHeightPlaneEntity(viewer, Cesium, previewPoint));
      entities.push(createCesiumHeightPlaneRingEntity(viewer, Cesium, previewPoint));
    }

    entities.push(viewer.entities.add({
      label: createCesiumLabelOptions(
        Cesium,
        `${formatDistance(previewDistance)} ${distanceKind === 'space' ? '空间' : '贴地'}`,
      ),
      point: createCesiumPointOptions(Cesium),
      position: toCartesian(previewPoint),
    }));
  }

  viewer.scene.requestRender?.();
  return entities;
}

function createCesiumMeasuredLineEntities(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  points: MeasurePoint[],
  distanceKind: DistanceKind,
) {
  const orange = Cesium.Color.fromCssColorString('#e58a00');

  if (distanceKind === 'surface') {
    return [viewer.entities.add({
      polyline: {
        clampToGround: true,
        material: orange,
        positions: points.map((point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height || 0)),
        width: 3,
      },
    })];
  }

  const entities: unknown[] = [];
  const chunks = splitMeasureLineByGround(viewer, Cesium, points);
  const undergroundMaterial = new Cesium.PolylineDashMaterialProperty({
    color: Cesium.Color.fromAlpha(orange, 0.52),
    dashLength: 24,
  });
  const undergroundDepthMaterial = new Cesium.PolylineDashMaterialProperty({
    color: Cesium.Color.fromAlpha(orange, 0.46),
    dashLength: 24,
  });
  const undergroundHaloMaterial = new Cesium.PolylineDashMaterialProperty({
    color: Cesium.Color.fromAlpha(Cesium.Color.fromCssColorString('#261910'), 0.34),
    dashLength: 24,
  });

  chunks.segments.forEach((chunk) => {
    if (chunk.points.length < 2) {
      return;
    }

    if (chunk.isBelowGround) {
      entities.push(viewer.entities.add({
        polyline: {
          clampToGround: false,
          depthFailMaterial: undergroundHaloMaterial,
          material: undergroundHaloMaterial,
          positions: chunk.points.map((point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height || 0)),
          width: 5,
        },
      }));
    }

    entities.push(viewer.entities.add({
      polyline: {
        clampToGround: false,
        depthFailMaterial: chunk.isBelowGround ? undergroundDepthMaterial : Cesium.Color.fromAlpha(orange, 0.62),
        material: chunk.isBelowGround ? undergroundMaterial : orange,
        positions: chunk.points.map((point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height || 0)),
        width: chunk.isBelowGround ? 2 : 3,
      },
    }));
  });

  chunks.crossings.forEach((point) => {
    entities.push(viewer.entities.add({
      point: {
        color: Cesium.Color.fromAlpha(Cesium.Color.fromCssColorString('#0f1418'), 0.22),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        outlineColor: orange,
        outlineWidth: 2,
        pixelSize: 11,
      },
      position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height || 0),
    }));
  });

  return entities;
}

function splitMeasureLineByGround(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  points: MeasurePoint[],
) {
  const chunks: { isBelowGround: boolean; points: MeasurePoint[] }[] = [];
  const crossings: MeasurePoint[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const samples = createMeasureLineTerrainSamples(viewer, Cesium, points[index - 1], points[index]);

    for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
      const previous = samples[sampleIndex - 1];
      const current = samples[sampleIndex];
      const isBelowGround = previous.relativeHeight < 0 && current.relativeHeight < 0;
      const crossesGround = previous.relativeHeight * current.relativeHeight < 0;

      if (crossesGround) {
        const t = Math.abs(previous.relativeHeight)
          / (Math.abs(previous.relativeHeight) + Math.abs(current.relativeHeight));
        const groundPoint = interpolateMeasurePoint(previous.point, current.point, t);
        groundPoint.height = getCesiumGroundHeight(viewer, Cesium, groundPoint);

        crossings.push(groundPoint);
        pushMeasureLineChunk(chunks, previous.relativeHeight < 0, [previous.point, groundPoint]);
        pushMeasureLineChunk(chunks, current.relativeHeight < 0, [groundPoint, current.point]);
      } else {
        pushMeasureLineChunk(chunks, isBelowGround, [previous.point, current.point]);
      }
    }
  }

  return {
    crossings,
    segments: chunks,
  };
}

function createMeasureLineTerrainSamples(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  start: MeasurePoint,
  end: MeasurePoint,
) {
  const samples: { point: MeasurePoint; relativeHeight: number }[] = [];
  const sampleCount = getCesiumLineTerrainSampleCount(start, end);

  for (let index = 0; index <= sampleCount; index += 1) {
    const point = interpolateMeasurePoint(start, end, index / sampleCount);
    const groundHeight = getCesiumGroundHeight(viewer, Cesium, point);

    samples.push({
      point,
      relativeHeight: (point.height || 0) - groundHeight,
    });
  }

  return samples;
}

function getCesiumLineTerrainSampleCount(start: MeasurePoint, end: MeasurePoint) {
  const distance = Math.max(distanceBetweenSurfacePoints(start, end), distanceBetweenSpacePoints(start, end));
  const count = Math.ceil(distance / CESIUM_LINE_TERRAIN_SAMPLE_SPACING_METERS);

  return Math.max(
    CESIUM_LINE_TERRAIN_SAMPLE_MIN_COUNT,
    Math.min(CESIUM_LINE_TERRAIN_SAMPLE_MAX_COUNT, count),
  );
}

function interpolateMeasurePoint(start: MeasurePoint, end: MeasurePoint, t: number): MeasurePoint {
  return {
    height: start.height + (end.height - start.height) * t,
    lat: start.lat + (end.lat - start.lat) * t,
    lon: start.lon + shortestLongitudeDelta(start.lon, end.lon) * t,
  };
}

function shortestLongitudeDelta(startLon: number, endLon: number) {
  let delta = endLon - startLon;

  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }

  return delta;
}

function pushMeasureLineChunk(
  chunks: { isBelowGround: boolean; points: MeasurePoint[] }[],
  isBelowGround: boolean,
  points: MeasurePoint[],
) {
  const last = chunks.at(-1);

  if (last && last.isBelowGround === isBelowGround) {
    last.points.push(...points.slice(1));
    return;
  }

  chunks.push({ isBelowGround, points });
}

function getCesiumGroundHeight(viewer: CesiumViewer, Cesium: CesiumNamespace, point: MeasurePoint) {
  const height = viewer.scene.globe.getHeight?.(Cesium.Cartographic.fromDegrees(point.lon, point.lat, 0));

  return Number.isFinite(height) ? height ?? 0 : 0;
}

function createCesiumDistanceDimensionEntities(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  points: MeasurePoint[],
  dimensionOffsets: Record<string, number>,
) {
  const entities: unknown[] = [];
  const green = Cesium.Color.fromCssColorString('#32d74b');
  const mutedGreen = Cesium.Color.fromAlpha(green, 0.62);
  const guideGreen = Cesium.Color.fromAlpha(green, 0.78);

  for (let index = 1; index < points.length; index += 1) {
    const startIndex = index;
    const endIndex = index + 1;
    const startPoint = points[index - 1];
    const endPoint = points[index];
    const startPosition = Cesium.Cartesian3.fromDegrees(startPoint.lon, startPoint.lat, startPoint.height || 0);
    const endPosition = Cesium.Cartesian3.fromDegrees(endPoint.lon, endPoint.lat, endPoint.height || 0);
    const distance = Cesium.Cartesian3.distance(startPosition, endPosition);
    const id = `${index - 1}:${index}`;
    const annotation: DistanceDimensionAnnotation = {
      distance,
      endIndex,
      endPosition,
      id,
      offsetMeters: dimensionOffsets[id] ?? Math.max(distance * 0.08, 25),
      startIndex,
      startPosition,
    };

    if (distance < 0.001) {
      entities.push(viewer.entities.add({
        label: createCesiumDimensionLabelOptions(Cesium, formatDistance(distance)),
        position: startPosition,
      }));
      continue;
    }

    addCesiumDimensionPolyline(
      viewer,
      Cesium,
      entities,
      () => [annotation.startPosition, annotation.endPosition],
      new Cesium.PolylineDashMaterialProperty({
        color: mutedGreen,
        dashLength: 16,
      }),
      1.5,
    );
    addCesiumDimensionPolyline(
      viewer,
      Cesium,
      entities,
      () => {
        const geometry = computeDistanceDimensionGeometry(Cesium, annotation);

        return [annotation.startPosition, geometry.startTop];
      },
      new Cesium.PolylineDashMaterialProperty({
        color: guideGreen,
        dashLength: 16,
      }),
      1.5,
    );
    addCesiumDimensionPolyline(
      viewer,
      Cesium,
      entities,
      () => {
        const geometry = computeDistanceDimensionGeometry(Cesium, annotation);

        return [annotation.endPosition, geometry.endTop];
      },
      new Cesium.PolylineDashMaterialProperty({
        color: guideGreen,
        dashLength: 16,
      }),
      1.5,
    );
    addCesiumDimensionPolyline(
      viewer,
      Cesium,
      entities,
      () => {
        const geometry = computeDistanceDimensionGeometry(Cesium, annotation);

        return [geometry.startTop, geometry.endTop];
      },
      green,
      2,
    );

    [0, 1].forEach((wingIndex) => {
      addCesiumDimensionPolyline(
        viewer,
        Cesium,
        entities,
        () => createDistanceDimensionArrowPositions(Cesium, annotation, true, wingIndex),
        green,
        2,
      );
      addCesiumDimensionPolyline(
        viewer,
        Cesium,
        entities,
        () => createDistanceDimensionArrowPositions(Cesium, annotation, false, wingIndex),
        green,
        2,
      );
    });

    entities.push(viewer.entities.add({
      label: createCesiumDimensionLabelOptions(Cesium, formatDistance(distance)),
      position: new Cesium.CallbackProperty(() => (
        computeDistanceDimensionGeometry(Cesium, annotation).labelPosition
      ), false),
    }));

    entities.push(viewer.entities.add({
      point: {
        color: green,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
        outlineWidth: 2,
        pixelSize: 11,
      },
      position: new Cesium.CallbackProperty(() => (
        computeDistanceDimensionGeometry(Cesium, annotation).handlePosition
      ), false),
      properties: {
        measureDimensionAnnotation: annotation,
      },
    }));
  }

  return entities;
}

function addCesiumDimensionPolyline(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  entities: unknown[],
  positions: () => unknown[],
  material: unknown,
  width: number,
) {
  entities.push(viewer.entities.add({
    polyline: {
      clampToGround: false,
      material,
      positions: new Cesium.CallbackProperty(positions, false),
      width,
    },
  }));
}

function computeDistanceDimensionGeometry(Cesium: CesiumNamespace, annotation: DistanceDimensionAnnotation) {
  const startCartographic = Cesium.Cartographic.fromCartesian(annotation.startPosition);
  const endCartographic = Cesium.Cartographic.fromCartesian(annotation.endPosition);
  const dimensionHeight = Math.max(startCartographic.height, endCartographic.height) + annotation.offsetMeters;
  const startTop = Cesium.Cartesian3.fromRadians(
    startCartographic.longitude,
    startCartographic.latitude,
    dimensionHeight,
  );
  const endTop = Cesium.Cartesian3.fromRadians(
    endCartographic.longitude,
    endCartographic.latitude,
    dimensionHeight,
  );
  const handlePosition = Cesium.Cartesian3.midpoint(startTop, endTop, new Cesium.Cartesian3());
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(handlePosition);
  const inverseTransform = Cesium.Matrix4.inverse(transform, new Cesium.Matrix4());
  const startLocal = Cesium.Matrix4.multiplyByPoint(inverseTransform, startTop, new Cesium.Cartesian3());
  const endLocal = Cesium.Matrix4.multiplyByPoint(inverseTransform, endTop, new Cesium.Cartesian3());
  const lineDirection = Cesium.Cartesian3.subtract(endLocal, startLocal, new Cesium.Cartesian3());

  Cesium.Cartesian3.normalize(lineDirection, lineDirection);

  let perpendicular = Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, lineDirection, new Cesium.Cartesian3());

  if (Cesium.Cartesian3.magnitude(perpendicular) < 1e-5) {
    perpendicular = Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_X);
  } else {
    Cesium.Cartesian3.normalize(perpendicular, perpendicular);
  }

  const arrowLength = Math.max(Math.min(annotation.distance * 0.045, 300), 18);
  const arrowWidth = arrowLength * 0.45;
  const labelLift = Math.max(arrowLength * 0.55, 16);
  const labelPosition = Cesium.Matrix4.multiplyByPoint(
    transform,
    new Cesium.Cartesian3(0, 0, labelLift),
    new Cesium.Cartesian3(),
  );

  return {
    arrowLength,
    arrowWidth,
    endLocal,
    endTop,
    handlePosition,
    labelPosition,
    lineDirection,
    perpendicular,
    startLocal,
    startTop,
    transform,
  };
}

function createDistanceDimensionArrowPositions(
  Cesium: CesiumNamespace,
  annotation: DistanceDimensionAnnotation,
  isStart: boolean,
  wingIndex: number,
) {
  const geometry = computeDistanceDimensionGeometry(Cesium, annotation);
  const tipLocal = isStart ? geometry.startLocal : geometry.endLocal;
  const inwardSign = isStart ? 1 : -1;
  const baseOffset = Cesium.Cartesian3.multiplyByScalar(
    geometry.lineDirection,
    inwardSign * geometry.arrowLength,
    new Cesium.Cartesian3(),
  );
  const wingOffset = Cesium.Cartesian3.multiplyByScalar(
    geometry.perpendicular,
    (wingIndex === 0 ? 1 : -1) * geometry.arrowWidth,
    new Cesium.Cartesian3(),
  );
  const base = Cesium.Cartesian3.add(tipLocal, baseOffset, new Cesium.Cartesian3());
  const wing = Cesium.Cartesian3.add(base, wingOffset, new Cesium.Cartesian3());

  return [
    Cesium.Matrix4.multiplyByPoint(geometry.transform, tipLocal, new Cesium.Cartesian3()),
    Cesium.Matrix4.multiplyByPoint(geometry.transform, wing, new Cesium.Cartesian3()),
  ];
}

function createCesiumVerticalAxisEntities(viewer: CesiumViewer, Cesium: CesiumNamespace, point: MeasurePoint) {
  const groundHeight = getCesiumGroundHeight(viewer, Cesium, point);
  const green = Cesium.Color.fromCssColorString('#32d74b');
  const lowerMaterial = new Cesium.PolylineDashMaterialProperty({
    color: Cesium.Color.fromAlpha(green, 0.5),
    dashLength: 22,
  });
  const lowerDepthMaterial = new Cesium.PolylineDashMaterialProperty({
    color: Cesium.Color.fromAlpha(green, 0.68),
    dashLength: 22,
  });
  const upperMaterial = new Cesium.PolylineGlowMaterialProperty({
    color: green,
    glowPower: 0.18,
  });

  return [
    viewer.entities.add({
      polyline: {
        clampToGround: false,
        depthFailMaterial: lowerDepthMaterial,
        material: lowerMaterial,
        positions: createCesiumVerticalLinePositions(
          Cesium,
          point,
          groundHeight - VERTICAL_AXIS_BELOW_GROUND_METERS,
          groundHeight,
        ),
        width: 2,
      },
    }),
    viewer.entities.add({
      polyline: {
        clampToGround: false,
        depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
          color: Cesium.Color.fromAlpha(green, 0.82),
          glowPower: 0.18,
        }),
        material: upperMaterial,
        positions: createCesiumVerticalLinePositions(
          Cesium,
          point,
          groundHeight,
          groundHeight + VERTICAL_AXIS_ABOVE_GROUND_METERS,
        ),
        width: 4,
      },
    }),
  ];
}

function createCesiumVerticalLinePositions(Cesium: CesiumNamespace, point: MeasurePoint, startHeight: number, endHeight: number) {
  const position = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height);
  const cartographic = Cesium.Cartographic.fromCartesian(position);

  return [
    Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      startHeight,
    ),
    Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      endHeight,
    ),
  ];
}

function createCesiumHeightPlaneEntity(viewer: CesiumViewer, Cesium: CesiumNamespace, point: MeasurePoint) {
  return viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(createHeightCirclePositions(viewer, Cesium, point)),
      material: Cesium.Color.fromAlpha(Cesium.Color.fromCssColorString('#32d74b'), 0.16),
      outline: false,
      perPositionHeight: true,
    },
  });
}

function createCesiumHeightPlaneRingEntity(viewer: CesiumViewer, Cesium: CesiumNamespace, point: MeasurePoint) {
  const positions = createHeightCirclePositions(viewer, Cesium, point);

  if (positions.length > 0) {
    positions.push(Cesium.Cartesian3.clone(positions[0]));
  }

  return viewer.entities.add({
    polyline: {
      clampToGround: false,
      material: Cesium.Color.fromCssColorString('#32d74b'),
      positions,
      width: 2,
    },
  });
}

function createHeightCirclePositions(viewer: CesiumViewer, Cesium: CesiumNamespace, point: MeasurePoint) {
  const positions: unknown[] = [];
  const segments = 96;
  const radius = Math.max(estimateCesiumViewRangeMeters(viewer) / 12, 10);
  const center = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height);
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);

  for (let index = 0; index < segments; index += 1) {
    const angle = Math.PI * 2 * index / segments;

    positions.push(Cesium.Matrix4.multiplyByPoint(
      transform,
      new Cesium.Cartesian3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0),
      new Cesium.Cartesian3(),
    ));
  }

  return positions;
}

function createCesiumPointOptions(Cesium: CesiumNamespace) {
  return {
    color: Cesium.Color.fromCssColorString('#ffffff'),
    outlineColor: Cesium.Color.fromCssColorString('#e58a00'),
    outlineWidth: 2,
    pixelSize: 8,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function createCesiumLabelOptions(Cesium: CesiumNamespace, text: string) {
  return {
    backgroundColor: Cesium.Color.fromCssColorString('#ffffff'),
    fillColor: Cesium.Color.fromCssColorString('#17202a'),
    font: '12px "Segoe UI", "Microsoft YaHei", Arial, sans-serif',
    outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
    outlineWidth: 2,
    pixelOffset: new Cesium.Cartesian2(0, -18),
    showBackground: true,
    text,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function createCesiumDimensionLabelOptions(Cesium: CesiumNamespace, text: string) {
  return {
    backgroundColor: Cesium.Color.fromAlpha(Cesium.Color.fromCssColorString('#0f1418'), 0.72),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    fillColor: Cesium.Color.fromCssColorString('#32d74b'),
    font: '700 14px "Segoe UI", "Microsoft YaHei", Arial, sans-serif',
    outlineColor: Cesium.Color.fromCssColorString('#000000'),
    outlineWidth: 3,
    pixelOffset: new Cesium.Cartesian2(0, -4),
    showBackground: true,
    text,
  };
}

function ensureDistanceMeasureLayers(map: maplibregl.Map) {
  if (!map.isStyleLoaded()) {
    return;
  }

  if (!map.getSource(MEASURE_SOURCE_ID)) {
    map.addSource(MEASURE_SOURCE_ID, {
      data: emptyFeatureCollection(),
      type: 'geojson',
    });
  }

  if (!map.getLayer(MEASURE_LINE_LAYER_ID)) {
    map.addLayer({
      id: MEASURE_LINE_LAYER_ID,
      source: MEASURE_SOURCE_ID,
      type: 'line',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'preview'], true]],
      paint: {
        'line-color': '#e58a00',
        'line-width': 3,
      },
    });
  }

  if (!map.getLayer(MEASURE_PREVIEW_LINE_LAYER_ID)) {
    map.addLayer({
      id: MEASURE_PREVIEW_LINE_LAYER_ID,
      source: MEASURE_SOURCE_ID,
      type: 'line',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'preview'], true]],
      paint: {
        'line-color': '#0f766e',
        'line-dasharray': [1.2, 1.2],
        'line-width': 2,
      },
    });
  }

  if (!map.getLayer(MEASURE_POINT_LAYER_ID)) {
    map.addLayer({
      id: MEASURE_POINT_LAYER_ID,
      source: MEASURE_SOURCE_ID,
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

  if (!map.getLayer(MEASURE_LABEL_LAYER_ID)) {
    map.addLayer({
      id: MEASURE_LABEL_LAYER_ID,
      source: MEASURE_SOURCE_ID,
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

function updateDistanceMeasureSource(
  map: maplibregl.Map,
  points: MeasurePoint[],
  previewPoint: MeasurePoint | null,
  resultDistance: number,
  totalDistance: number,
  distanceKind: DistanceKind,
) {
  if (!map.isStyleLoaded()) {
    return;
  }

  const source = map.getSource(MEASURE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

  if (!source) {
    return;
  }

  source.setData(createDistanceFeatureCollection(points, previewPoint, resultDistance, totalDistance, distanceKind));
}

function removeDistanceMeasureLayers(map: maplibregl.Map) {
  [
    MEASURE_LABEL_LAYER_ID,
    MEASURE_POINT_LAYER_ID,
    MEASURE_PREVIEW_LINE_LAYER_ID,
    MEASURE_LINE_LAYER_ID,
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  });

  if (map.getSource(MEASURE_SOURCE_ID)) {
    map.removeSource(MEASURE_SOURCE_ID);
  }
}

function createDistanceFeatureCollection(
  points: MeasurePoint[],
  previewPoint: MeasurePoint | null,
  resultDistance: number,
  previewDistance: number,
  distanceKind: DistanceKind,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  if (points.length >= 2) {
    features.push({
      geometry: {
        coordinates: points.map((point) => [point.lon, point.lat]),
        type: 'LineString',
      },
      properties: {
        preview: false,
      },
      type: 'Feature',
    });
  }

  if (previewPoint && points.length > 0) {
    const lastPoint = points[points.length - 1];

    features.push({
      geometry: {
        coordinates: [
          [lastPoint.lon, lastPoint.lat],
          [previewPoint.lon, previewPoint.lat],
        ],
        type: 'LineString',
      },
      properties: {
        preview: true,
      },
      type: 'Feature',
    });
  }

  points.forEach((point, index) => {
    const isLast = index === points.length - 1;
    const label = isLast && points.length > 1 && !previewPoint
      ? `${formatDistance(resultDistance)} ${distanceKind === 'space' ? '空间' : '贴地'}`
      : `P${index + 1}`;

    features.push({
      geometry: {
        coordinates: [point.lon, point.lat],
        type: 'Point',
      },
      properties: {
        label,
      },
      type: 'Feature',
    });
  });

  if (previewPoint) {
    features.push({
      geometry: {
        coordinates: [previewPoint.lon, previewPoint.lat],
        type: 'Point',
      },
      properties: {
        label: `${formatDistance(previewDistance)} ${distanceKind === 'space' ? '空间' : '贴地'}`,
      },
      type: 'Feature',
    });
  }

  return {
    features,
    type: 'FeatureCollection',
  };
}

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    features: [],
    type: 'FeatureCollection',
  };
}
