import { useCallback, useEffect, useRef } from 'react';
import { ArrowUpDown, Eraser, X } from 'lucide-react';
import type { MapViewMode } from './MapCommandContext';
import type { CesiumNamespace, CesiumViewer } from './cesiumRuntime';
import { useElevationMeasure } from './ElevationMeasureContext';
import {
  buildElevationContourSegments,
  computeElevationTriangle,
  createElevationPlanePositions,
  createElevationResultEntities,
  createElevationSampleGrid,
  createElevationTriangleLabelEntities,
  elevationPlaneBounds,
  ELEVATION_HORIZONTAL_COLOR,
  ELEVATION_SLOPE_COLOR,
  ELEVATION_VERTICAL_COLOR,
  formatMeasureLength,
  formatSignedMeasureLength,
  pickTerrainCartesian,
  type ElevationMeasureResult,
  type ElevationTriangle,
} from './elevationMeasurement';

type ElevationMeasurePanelProps = {
  cesiumScene: { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
  mapMode: MapViewMode;
};

const ELEVATION_CONTOUR_DEBOUNCE_MS = 80;

function preventContextMenu(event: Event) {
  event.preventDefault();
}

export function ElevationMeasurePanel({ cesiumScene, mapMode }: ElevationMeasurePanelProps) {
  const {
    addResult,
    clearResults,
    closeMeasure,
    isActive,
    isOcclusionEnabled,
    results,
    setStatus,
    status,
    toggleOcclusion,
  } = useElevationMeasure();
  const anchorPositionRef = useRef<unknown | null>(null);
  const floatingPositionRef = useRef<unknown | null>(null);
  const previewEntitiesRef = useRef<unknown[]>([]);
  const contourEntitiesRef = useRef<unknown[]>([]);
  const resultEntitiesRef = useRef(new Map<string, unknown[]>());
  const contourTimerRef = useRef<number | null>(null);
  const contourRequestIdRef = useRef(0);
  const interactionRequestIdRef = useRef(0);
  const occlusionRef = useRef(false);

  useEffect(() => {
    if (!isActive || mapMode !== 'globe' || !cesiumScene) {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const requestId = ++interactionRequestIdRef.current;
    const isCurrent = () => requestId === interactionRequestIdRef.current && !viewer.isDestroyed();
    const requestRender = () => viewer.scene.requestRender?.();
    const addPreviewEntity = (options: Record<string, unknown>) => {
      const entity = viewer.entities.add(options);
      previewEntitiesRef.current.push(entity);

      return entity;
    };

    const clearPreview = () => {
      previewEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
      previewEntitiesRef.current = [];
      contourEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
      contourEntitiesRef.current = [];
      anchorPositionRef.current = null;
      floatingPositionRef.current = null;
    };

    const cancelContourUpdate = () => {
      if (contourTimerRef.current !== null) {
        window.clearTimeout(contourTimerRef.current);
        contourTimerRef.current = null;
      }
      contourRequestIdRef.current += 1;
    };

    const updateContour = async (contourRequestId: number) => {
      const first = anchorPositionRef.current;
      const second = floatingPositionRef.current;

      if (!first || !second || !isCurrent()) {
        return;
      }

      const height = Cesium.Cartographic.fromCartesian(second).height;
      const grid = createElevationSampleGrid(Cesium, elevationPlaneBounds(Cesium, first, second));

      try {
        const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, grid.cartographics);

        if (!isCurrent() || contourRequestId !== contourRequestIdRef.current) {
          return;
        }

        const segments = buildElevationContourSegments(Cesium, sampled, grid.columns, grid.rows, height);
        contourEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
        contourEntitiesRef.current = segments.map((segment) => viewer.entities.add({
          polyline: {
            positions: segment,
            width: 3,
            material: Cesium.Color.fromCssColorString(ELEVATION_VERTICAL_COLOR),
            arcType: Cesium.ArcType.NONE,
          },
        }));
        requestRender();
      } catch {
        if (isCurrent() && contourRequestId === contourRequestIdRef.current) {
          contourEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
          contourEntitiesRef.current = [];
        }
      }
    };

    const scheduleContourUpdate = () => {
      cancelContourUpdate();
      const contourRequestId = ++contourRequestIdRef.current;

      contourTimerRef.current = window.setTimeout(() => {
        contourTimerRef.current = null;
        void updateContour(contourRequestId);
      }, ELEVATION_CONTOUR_DEBOUNCE_MS);
    };

    const getTriangle = (): ElevationTriangle | null => {
      const first = anchorPositionRef.current;
      const second = floatingPositionRef.current;

      return first && second ? computeElevationTriangle(Cesium, viewer, first, second) : null;
    };

    setStatus('请单击地图选择第一个点 A');
    const previousCursor = viewer.canvas.style.cursor;
    viewer.canvas.style.cursor = 'crosshair';
    viewer.canvas.addEventListener('contextmenu', preventContextMenu);

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

    const startPreview = (anchor: unknown) => {
      anchorPositionRef.current = anchor;
      const occluded = occlusionRef.current;
      const red = Cesium.Color.fromCssColorString(ELEVATION_SLOPE_COLOR);

      addPreviewEntity({
        position: new Cesium.CallbackProperty(() => anchorPositionRef.current, false),
        point: {
          pixelSize: 10,
          color: red,
          outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
          outlineWidth: 2,
          disableDepthTestDistance: occluded ? 0 : Number.POSITIVE_INFINITY,
        },
      });
      addPreviewEntity({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const first = anchorPositionRef.current;
            const second = floatingPositionRef.current;

            return first && second ? [first, second] : [];
          }, false),
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: red,
            gapColor: Cesium.Color.fromAlpha(red, 0),
            dashLength: 18,
          }),
          depthFailMaterial: occluded ? undefined : new Cesium.PolylineDashMaterialProperty({
            color: red,
            gapColor: Cesium.Color.fromAlpha(red, 0),
            dashLength: 18,
          }),
          arcType: Cesium.ArcType.NONE,
        },
      });
      addPreviewEntity({
        polygon: {
          hierarchy: new Cesium.CallbackProperty(() => {
            const first = anchorPositionRef.current;
            const second = floatingPositionRef.current;

            if (!first || !second) {
              return undefined;
            }

            const height = Cesium.Cartographic.fromCartesian(second).height;

            return new Cesium.PolygonHierarchy(
              createElevationPlanePositions(Cesium, elevationPlaneBounds(Cesium, first, second), height),
            );
          }, false),
          perPositionHeight: true,
          material: Cesium.Color.fromAlpha(Cesium.Color.fromCssColorString(ELEVATION_VERTICAL_COLOR), 0.11),
        },
      });
      [
        { color: Cesium.Color.fromCssColorString(ELEVATION_HORIZONTAL_COLOR), end: 'corner' as const, start: 'first' as const },
        { color: Cesium.Color.fromCssColorString(ELEVATION_VERTICAL_COLOR), end: 'second' as const, start: 'corner' as const },
      ].forEach((edge) => {
        const material = new Cesium.PolylineDashMaterialProperty({ color: edge.color, dashLength: 16 });

        addPreviewEntity({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const triangle = getTriangle();

              return triangle ? [triangle[edge.start], triangle[edge.end]] : [];
            }, false),
            width: 2,
            material,
            depthFailMaterial: occluded ? undefined : material,
            arcType: Cesium.ArcType.NONE,
          },
        });
      });
      createElevationTriangleLabelEntities(Cesium, addPreviewEntity, getTriangle, true, occluded);
    };

    const finishMeasure = (secondPosition: unknown) => {
      const first = anchorPositionRef.current;

      if (!first) {
        return;
      }

      const triangle = computeElevationTriangle(Cesium, viewer, first, secondPosition);
      const firstCartographic = Cesium.Cartographic.fromCartesian(first);
      const secondCartographic = Cesium.Cartographic.fromCartesian(secondPosition);
      const result: ElevationMeasureResult = {
        first: {
          height: firstCartographic.height,
          lat: Cesium.Math.toDegrees(firstCartographic.latitude),
          lon: Cesium.Math.toDegrees(firstCartographic.longitude),
        },
        horizontalDistance: triangle.horizontal,
        id: `elevation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        second: {
          height: secondCartographic.height,
          lat: Cesium.Math.toDegrees(secondCartographic.latitude),
          lon: Cesium.Math.toDegrees(secondCartographic.longitude),
        },
        slopeDistance: triangle.slope,
        verticalDistance: triangle.vertical,
      };

      cancelContourUpdate();
      clearPreview();
      resultEntitiesRef.current.set(
        result.id,
        createElevationResultEntities(Cesium, viewer, result, occlusionRef.current),
      );
      addResult(result);
      setStatus('测量完成，结果已加入「测量结果」面板；单击地图可继续测量，Esc 退出');
      requestRender();
    };

    handler.setInputAction((event) => {
      if (!isCurrent() || anchorPositionRef.current) {
        return;
      }

      const position = pickTerrainCartesian(Cesium, viewer, event.position);

      if (!position) {
        return;
      }

      startPreview(position);
      setStatus('移动鼠标预览，双击确认第二个点 B');
      requestRender();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((event) => {
      if (!isCurrent() || !anchorPositionRef.current) {
        return;
      }

      const position = pickTerrainCartesian(Cesium, viewer, event.endPosition);

      if (!position) {
        return;
      }

      floatingPositionRef.current = position;
      scheduleContourUpdate();
      requestRender();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((event) => {
      if (!isCurrent() || !anchorPositionRef.current) {
        return;
      }

      const position = floatingPositionRef.current
        ?? pickTerrainCartesian(Cesium, viewer, event.position);

      if (position) {
        finishMeasure(position);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isCurrent()) {
        return;
      }

      event.preventDefault();

      if (anchorPositionRef.current) {
        cancelContourUpdate();
        clearPreview();
        setStatus('已取消本次选择，请单击地图重新选择第一个点 A');
        requestRender();
        return;
      }

      closeMeasure();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      viewer.canvas.removeEventListener('contextmenu', preventContextMenu);
      handler.destroy();
      viewer.canvas.style.cursor = previousCursor;
      cancelContourUpdate();
      clearPreview();
      interactionRequestIdRef.current += 1;
      requestRender();
    };
  }, [addResult, isActive, mapMode, cesiumScene, closeMeasure, setStatus]);

  useEffect(() => {
    return () => {
      if (contourTimerRef.current !== null) {
        window.clearTimeout(contourTimerRef.current);
        contourTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!cesiumScene) {
      return;
    }

    const { viewer } = cesiumScene;
    const drawnResults = resultEntitiesRef.current;

    drawnResults.forEach((entities, resultId) => {
      if (!results.some((item) => item.id === resultId)) {
        entities.forEach((entity) => viewer.entities.remove(entity));
        drawnResults.delete(resultId);
      }
    });

    if (!viewer.isDestroyed()) {
      viewer.scene.requestRender?.();
    }
  }, [results, cesiumScene]);

  useEffect(() => {
    occlusionRef.current = isOcclusionEnabled;

    if (!cesiumScene || cesiumScene.viewer.isDestroyed()) {
      return;
    }

    const { viewer } = cesiumScene;
    const labelDepthDistance = isOcclusionEnabled ? 0 : Number.POSITIVE_INFINITY;

    const syncEntityOcclusion = (entity: unknown) => {
      const graphics = entity as {
        label?: { disableDepthTestDistance: unknown };
        point?: { disableDepthTestDistance: unknown };
        polyline?: { depthFailMaterial: unknown; material: unknown };
      };

      if (graphics.polyline) {
        graphics.polyline.depthFailMaterial = isOcclusionEnabled ? undefined : graphics.polyline.material;
      }

      if (graphics.label) {
        graphics.label.disableDepthTestDistance = labelDepthDistance;
      }

      if (graphics.point) {
        graphics.point.disableDepthTestDistance = labelDepthDistance;
      }
    };

    previewEntitiesRef.current.forEach(syncEntityOcclusion);
    resultEntitiesRef.current.forEach((entities) => entities.forEach(syncEntityOcclusion));
    viewer.scene.requestRender?.();
  }, [isOcclusionEnabled, cesiumScene]);

  if (mapMode !== 'globe' || !isActive) {
    return null;
  }

  const latestResult = results[0];

  return (
    <aside className="map-terrain-panel" aria-label="两点高程测量">
      <header className="map-terrain-panel-header">
        <div>
          <ArrowUpDown size={15} strokeWidth={1.8} />
          <span>两点高程测量</span>
        </div>
        <button type="button" title="关闭" aria-label="关闭" onClick={closeMeasure}>
          <X size={14} strokeWidth={1.8} />
        </button>
      </header>
      <div className="map-terrain-panel-body">
        <div className="map-terrain-status" aria-live="polite">{status}</div>
        {latestResult ? (
          <div className="map-elevation-summary">
            <span>斜距 {formatMeasureLength(latestResult.slopeDistance)}</span>
            <span>高程差 {formatSignedMeasureLength(latestResult.second.height - latestResult.first.height)}</span>
          </div>
        ) : null}
        <div className="map-elevation-actions">
          <label className="map-elevation-occlusion" title="开启后测量线和标注会被地形遮挡">
            <input
              type="checkbox"
              checked={isOcclusionEnabled}
              onChange={toggleOcclusion}
            />
            允许地形遮挡
          </label>
          <button type="button" disabled={results.length === 0} onClick={clearResults}>
            <Eraser size={13} />
            清除全部结果
          </button>
        </div>
      </div>
    </aside>
  );
}
