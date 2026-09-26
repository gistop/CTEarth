import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { Compass, Eraser, Square, Triangle, X } from 'lucide-react';
import type { MapViewMode } from './MapCommandContext';
import type { CesiumNamespace, CesiumViewer } from './cesiumRuntime';
import { useGeometryMeasure } from './GeometryMeasureContext';
import { pickTerrainCartesian, formatMeasureLength } from './elevationMeasurement';
import {
  arcRadiusMeters,
  bearingDegrees,
  buildArcLngLat,
  buildBearingResult,
  computeSurfaceAreaMeters2,
  createAngleResultEntities,
  createAreaResultEntities,
  createBearingResultEntities,
  destinationPoint,
  formatMeasureAngle,
  formatMeasureArea,
  GEOMETRY_ANGLE_COLOR,
  GEOMETRY_AREA_COLOR,
  GEOMETRY_BEARING_COLOR,
  haversineMeters,
  horizontalAngleDegrees,
  measurePolygonArea,
  measurePolygonPerimeter,
  polygonCentroidMeters,
  segmentPitchDegrees,
  spaceAngleDegrees,
  type AngleMeasureResult,
  type AreaMeasureResult,
  type BearingMeasureResult,
  type GeometryMeasurePoint,
} from './geometryMeasurement';

type GeometryMeasurePanelProps = {
  cesiumScene: { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
  map: maplibregl.Map | null;
  mapMode: MapViewMode;
  mapReady: boolean;
};

const GEOMETRY_SOURCE_ID = 'cte-measure-geometry';
const GEOMETRY_FILL_LAYER_ID = 'cte-measure-geometry-fill';
const GEOMETRY_LINE_LAYER_ID = 'cte-measure-geometry-line';
const GEOMETRY_PREVIEW_LINE_LAYER_ID = 'cte-measure-geometry-preview-line';
const GEOMETRY_POINT_LAYER_ID = 'cte-measure-geometry-points';
const GEOMETRY_LABEL_LAYER_ID = 'cte-measure-geometry-labels';
const VERTEX_MERGE_DISTANCE_METERS = 0.5;

function preventContextMenu(event: Event) {
  event.preventDefault();
}

function createMeasureId(kind: 'angle' | 'area' | 'bearing') {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toMeasurePoint(lon: number, lat: number, height: number): GeometryMeasurePoint {
  return { height, lat, lon };
}

function dedupePoints(points: GeometryMeasurePoint[]) {
  return points.filter((point, index) => (
    index === 0 || haversineMeters(points[index - 1], point) > VERTEX_MERGE_DISTANCE_METERS
  ));
}

function buildAreaResult(points: GeometryMeasurePoint[]): AreaMeasureResult {
  return {
    area: measurePolygonArea(points),
    id: createMeasureId('area'),
    perimeter: measurePolygonPerimeter(points),
    points,
  };
}

function buildAngleResult(points: GeometryMeasurePoint[]): AngleMeasureResult {
  const [first, vertex, second] = points;
  const spaceAngle = spaceAngleDegrees(first, vertex, second);

  return {
    firstPitch: segmentPitchDegrees(vertex, first),
    horizontalAngle: horizontalAngleDegrees(first, vertex, second),
    id: createMeasureId('angle'),
    points: [first, vertex, second],
    secondPitch: segmentPitchDegrees(vertex, second),
    spaceAngle: spaceAngle ?? undefined,
  };
}

function statusTextForMode(mode: 'angle' | 'area' | 'area-surface' | 'bearing') {
  if (mode === 'area-surface') {
    return '单击地图添加顶点（至少 3 个），双击后采样地形计算贴地面积，Esc 取消';
  }

  if (mode === 'area') {
    return '单击地图添加顶点（至少 3 个），双击完成，Esc 取消';
  }

  if (mode === 'bearing') {
    return '依次单击两个点：起点、终点，计算连线方位角，Esc 取消';
  }

  return '依次单击三个点：起点、角点、终点，Esc 取消';
}

function ensureGeometryLayers(map: maplibregl.Map) {
  if (!map.getSource(GEOMETRY_SOURCE_ID)) {
    map.addSource(GEOMETRY_SOURCE_ID, {
      data: { features: [], type: 'FeatureCollection' },
      type: 'geojson',
    });
  }

  if (!map.getLayer(GEOMETRY_FILL_LAYER_ID)) {
    map.addLayer({
      id: GEOMETRY_FILL_LAYER_ID,
      source: GEOMETRY_SOURCE_ID,
      type: 'fill',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.16,
      },
    });
  }

  if (!map.getLayer(GEOMETRY_LINE_LAYER_ID)) {
    map.addLayer({
      id: GEOMETRY_LINE_LAYER_ID,
      source: GEOMETRY_SOURCE_ID,
      type: 'line',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'preview'], true]],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
      },
    });
  }

  if (!map.getLayer(GEOMETRY_PREVIEW_LINE_LAYER_ID)) {
    map.addLayer({
      id: GEOMETRY_PREVIEW_LINE_LAYER_ID,
      source: GEOMETRY_SOURCE_ID,
      type: 'line',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'preview'], true]],
      paint: {
        'line-color': ['get', 'color'],
        'line-dasharray': [1.2, 1.2],
        'line-width': 2,
      },
    });
  }

  if (!map.getLayer(GEOMETRY_POINT_LAYER_ID)) {
    map.addLayer({
      id: GEOMETRY_POINT_LAYER_ID,
      source: GEOMETRY_SOURCE_ID,
      type: 'circle',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': '#ffffff',
        'circle-radius': 4,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 2,
      },
    });
  }

  if (!map.getLayer(GEOMETRY_LABEL_LAYER_ID)) {
    map.addLayer({
      id: GEOMETRY_LABEL_LAYER_ID,
      source: GEOMETRY_SOURCE_ID,
      type: 'symbol',
      filter: ['has', 'label'],
      layout: {
        'text-anchor': 'top',
        'text-field': ['to-string', ['get', 'label']],
        'text-offset': [0, 0.9],
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

export function GeometryMeasurePanel({ cesiumScene, map, mapMode, mapReady }: GeometryMeasurePanelProps) {
  const {
    activeMode,
    addResult,
    clearResults,
    closeMeasure,
    isActive,
    results,
    setStatus,
    status,
  } = useGeometryMeasure();
  const draftPointsRef = useRef<GeometryMeasurePoint[]>([]);
  const floatingPointRef = useRef<GeometryMeasurePoint | null>(null);
  const previewEntitiesRef = useRef<unknown[]>([]);
  const resultEntitiesRef = useRef(new Map<string, unknown[]>());
  const interactionRequestIdRef = useRef(0);
  const [draftVersion, setDraftVersion] = useState(0);
  const bumpDraft = useCallback(() => {
    setDraftVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    draftPointsRef.current = [];
    floatingPointRef.current = null;
    setStatus(statusTextForMode(activeMode ?? 'area'));
  }, [activeMode, isActive, setStatus]);

  useEffect(() => {
    if (mapMode !== 'globe' || !isActive || !cesiumScene || !activeMode) {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const requestId = ++interactionRequestIdRef.current;
    const isCurrent = () => requestId === interactionRequestIdRef.current && !viewer.isDestroyed();
    const requestRender = () => viewer.scene.requestRender?.();
    const areaColor = Cesium.Color.fromCssColorString(GEOMETRY_AREA_COLOR);
    const angleColor = Cesium.Color.fromCssColorString(GEOMETRY_ANGLE_COLOR);
    const white = Cesium.Color.fromCssColorString('#ffffff');
    const isSurfaceArea = activeMode === 'area-surface';
    const toPreviewCartesian = (point: GeometryMeasurePoint) => Cesium.Cartesian3.fromDegrees(
      point.lon,
      point.lat,
      isSurfaceArea ? 0 : point.height,
    );

    const clearPreview = () => {
      previewEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
      previewEntitiesRef.current = [];
    };

    const addPreviewEntity = (options: Record<string, unknown>) => {
      const entity = viewer.entities.add(options);
      previewEntitiesRef.current.push(entity);

      return entity;
    };

    const addVertexEntity = (point: GeometryMeasurePoint, color: unknown) => {
      addPreviewEntity({
        position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height),
        point: {
          pixelSize: 9,
          color,
          outlineColor: white,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    };

    const dashedMaterial = (color: unknown) => new Cesium.PolylineDashMaterialProperty({
      color,
      gapColor: Cesium.Color.fromAlpha(color, 0),
      dashLength: 16,
    });

    const resetDraft = () => {
      clearPreview();
      draftPointsRef.current = [];
      floatingPointRef.current = null;
    };

    const commitResult = (result: AngleMeasureResult | AreaMeasureResult | BearingMeasureResult) => {
      resetDraft();
      resultEntitiesRef.current.set(
        result.id,
        'area' in result
          ? createAreaResultEntities(Cesium, viewer, result)
          : 'bearing' in result
            ? createBearingResultEntities(Cesium, viewer, result)
            : createAngleResultEntities(Cesium, viewer, result),
      );
      addResult(result);
      setStatus('测量完成，结果已加入「测量结果」面板；可继续测量，Esc 退出');
      requestRender();
    };

    const pickMeasurePoint = (windowPosition: unknown) => {
      const position = pickTerrainCartesian(Cesium, viewer, windowPosition);

      if (!position) {
        return null;
      }

      const cartographic = Cesium.Cartographic.fromCartesian(position);

      return toMeasurePoint(
        Cesium.Math.toDegrees(cartographic.longitude),
        Cesium.Math.toDegrees(cartographic.latitude),
        cartographic.height,
      );
    };

    const installCommonCleanup = (handler: { destroy: () => void }, handleKeyDown: (event: KeyboardEvent) => void) => {
      document.addEventListener('keydown', handleKeyDown);
      viewer.canvas.style.cursor = 'crosshair';
      viewer.canvas.addEventListener('contextmenu', preventContextMenu);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        viewer.canvas.removeEventListener('contextmenu', preventContextMenu);
        viewer.canvas.style.cursor = '';
        handler.destroy();
        clearPreview();
        interactionRequestIdRef.current += 1;
        requestRender();
      };
    };

    const handleEscape = (onCancel: () => void) => (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isCurrent()) {
        return;
      }

      event.preventDefault();

      if (draftPointsRef.current.length > 0) {
        onCancel();
        return;
      }

      closeMeasure();
    };

    const handleMouseMove = (handler: {
      setInputAction: (
        callback: (event: { endPosition?: unknown; position?: unknown }) => void,
        type: unknown,
      ) => void;
    }) => {
      handler.setInputAction((event) => {
        if (!isCurrent() || draftPointsRef.current.length === 0 || !event.endPosition) {
          return;
        }

        const point = pickMeasurePoint(event.endPosition);

        if (point) {
          floatingPointRef.current = point;
          requestRender();
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    };

    const finishDraft = () => {
      const points = dedupePoints(draftPointsRef.current);

      if (activeMode === 'area' || activeMode === 'area-surface') {
        if (points.length < 3) {
          setStatus('至少需要 3 个不同位置的顶点才能完成面积测量');
          return;
        }

        if (activeMode === 'area-surface') {
          setStatus('正在采样地形计算贴地面积…');
          computeSurfaceAreaMeters2(Cesium, viewer, points).then((surfaceArea) => {
            if (!isCurrent()) {
              return;
            }

            commitResult({
              ...buildAreaResult(points),
              isSurfaceArea: true,
              surfaceArea: surfaceArea ?? undefined,
            });
          });
          return;
        }

        commitResult(buildAreaResult(points));
        return;
      }

      if (activeMode === 'bearing') {
        if (points.length < 2) {
          setStatus('方位角测量需要 2 个不同的点，Esc 取消重选');
          return;
        }

        commitResult(buildBearingResult([points[0], points[1]]));
        return;
      }

      if (points.length < 3) {
        setStatus('角度测量需要 3 个不同的点，Esc 取消重选');
        return;
      }

      commitResult(buildAngleResult(points.slice(0, 3)));
    };

    if (activeMode === 'area' || activeMode === 'area-surface') {
      addPreviewEntity({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const points = draftPointsRef.current;
            const floating = floatingPointRef.current;

            if (points.length === 0 || (points.length === 1 && !floating)) {
              return [];
            }

            const positions = floating ? [...points, floating, points[0]] : [...points, points[0]];

            return positions.map(toPreviewCartesian);
          }, false),
          width: 3,
          material: dashedMaterial(areaColor),
          arcType: isSurfaceArea ? Cesium.ArcType.GEODESIC : Cesium.ArcType.NONE,
          clampToGround: isSurfaceArea,
        },
      });
      addPreviewEntity({
        polygon: {
          hierarchy: new Cesium.CallbackProperty(() => {
            const points = draftPointsRef.current;
            const floating = floatingPointRef.current;
            const positions = floating ? [...points, floating] : points;

            if (positions.length < 3) {
              return undefined;
            }

            return new Cesium.PolygonHierarchy(positions.map(toPreviewCartesian));
          }, false),
          clampToGround: isSurfaceArea,
          material: Cesium.Color.fromAlpha(areaColor, 0.16),
          perPositionHeight: !isSurfaceArea,
        },
      });
      addPreviewEntity({
        position: new Cesium.CallbackProperty(() => {
          const points = draftPointsRef.current;

          if (points.length < 3) {
            return undefined;
          }

          const centroid = polygonCentroidMeters(points);
          const height = isSurfaceArea
            ? 0
            : points.reduce((total, point) => total + point.height, 0) / points.length;

          return Cesium.Cartesian3.fromDegrees(centroid.lon, centroid.lat, height);
        }, false),
        label: {
          text: new Cesium.CallbackProperty(() => {
            const points = draftPointsRef.current;

            return points.length < 3 ? '' : `面积 ${formatMeasureArea(measurePolygonArea(points))}`;
          }, false),
          font: '700 13px "Segoe UI", "Microsoft YaHei", Arial, sans-serif',
          fillColor: areaColor,
          outlineColor: Cesium.Color.fromCssColorString('#101820'),
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, 16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

      handler.setInputAction((event: { position?: unknown }) => {
        if (!isCurrent() || !event.position) {
          return;
        }

        const point = pickMeasurePoint(event.position);

        if (!point) {
          return;
        }

        draftPointsRef.current.push(point);
        addVertexEntity(point, areaColor);
        setStatus(`已添加 ${draftPointsRef.current.length} 个顶点，双击完成`);
        requestRender();
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      handleMouseMove(handler);
      handler.setInputAction(() => {
        if (isCurrent()) {
          finishDraft();
        }
      }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

      const handleKeyDown = handleEscape(() => {
        resetDraft();
        setStatus('已取消本次绘制，请重新单击添加顶点');
        requestRender();
      });

      return installCommonCleanup(handler, handleKeyDown);
    }

    if (activeMode === 'bearing') {
      const bearingColor = Cesium.Color.fromCssColorString(GEOMETRY_BEARING_COLOR);

      addPreviewEntity({
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const points = draftPointsRef.current;
            const floating = floatingPointRef.current;

            if (points.length === 0 || !floating) {
              return [];
            }

            return [points[points.length - 1], floating];
          }, false),
          width: 3,
          material: dashedMaterial(bearingColor),
          arcType: Cesium.ArcType.NONE,
        },
      });
      addPreviewEntity({
        position: new Cesium.CallbackProperty(() => {
          const floating = floatingPointRef.current;

          return floating
            ? Cesium.Cartesian3.fromDegrees(floating.lon, floating.lat, floating.height)
            : undefined;
        }, false),
        label: {
          text: new Cesium.CallbackProperty(() => {
            const points = draftPointsRef.current;
            const floating = floatingPointRef.current;

            return points.length >= 1 && floating
              ? `方位角 ${bearingDegrees(points[0], floating).toFixed(2)}°`
              : '';
          }, false),
          font: '700 13px "Segoe UI", "Microsoft YaHei", Arial, sans-serif',
          fillColor: bearingColor,
          outlineColor: Cesium.Color.fromCssColorString('#101820'),
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, 14),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

      handler.setInputAction((event: { position?: unknown }) => {
        if (!isCurrent() || !event.position) {
          return;
        }

        const point = pickMeasurePoint(event.position);

        if (!point) {
          return;
        }

        draftPointsRef.current.push(point);
        addVertexEntity(point, bearingColor);

        if (draftPointsRef.current.length >= 2) {
          finishDraft();
          return;
        }

        setStatus('已选择 1 / 2 个点');
        requestRender();
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      handleMouseMove(handler);

      const handleKeyDown = handleEscape(() => {
        resetDraft();
        setStatus('已取消本次选择，请重新单击选择起点');
        requestRender();
      });

      return installCommonCleanup(handler, handleKeyDown);
    }

    addPreviewEntity({
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const points = draftPointsRef.current;
          const floating = floatingPointRef.current;

          if (points.length === 0 || !floating) {
            return [];
          }

          return [points[Math.min(points.length, 2) - 1], floating];
        }, false),
        width: 3,
        material: dashedMaterial(angleColor),
        arcType: Cesium.ArcType.NONE,
      },
    });
    addPreviewEntity({
      position: new Cesium.CallbackProperty(() => {
        const points = draftPointsRef.current;

        if (points.length < 2) {
          return undefined;
        }

        return Cesium.Cartesian3.fromDegrees(points[1].lon, points[1].lat, points[1].height);
      }, false),
      label: {
        text: new Cesium.CallbackProperty(() => {
          const points = draftPointsRef.current;
          const floating = floatingPointRef.current;

          if (points.length < 2 || !floating) {
            return '';
          }

          return formatMeasureAngle(horizontalAngleDegrees(points[0], points[1], floating));
        }, false),
        font: '700 13px "Segoe UI", "Microsoft YaHei", Arial, sans-serif',
        fillColor: angleColor,
        outlineColor: Cesium.Color.fromCssColorString('#101820'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, 14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

    handler.setInputAction((event: { position?: unknown }) => {
      if (!isCurrent() || !event.position) {
        return;
      }

      const point = pickMeasurePoint(event.position);

      if (!point) {
        return;
      }

      draftPointsRef.current.push(point);
      addVertexEntity(point, angleColor);

      if (draftPointsRef.current.length >= 3) {
        finishDraft();
        return;
      }

      setStatus(`已选择 ${draftPointsRef.current.length} / 3 个点`);
      requestRender();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handleMouseMove(handler);

    const handleKeyDown = handleEscape(() => {
      resetDraft();
      setStatus('已取消本次选择，请重新单击选择起点');
      requestRender();
    });

    return installCommonCleanup(handler, handleKeyDown);
  }, [activeMode, addResult, cesiumScene, closeMeasure, isActive, mapMode, setStatus]);

  useEffect(() => {
    if (mapMode !== 'globe' || !cesiumScene || cesiumScene.viewer.isDestroyed()) {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const drawn = resultEntitiesRef.current;

    drawn.forEach((entities, resultId) => {
      if (!results.some((item) => item.id === resultId)) {
        entities.forEach((entity) => viewer.entities.remove(entity));
        drawn.delete(resultId);
      }
    });
    results.forEach((result) => {
      if (drawn.has(result.id)) {
        return;
      }

      drawn.set(
        result.id,
        'area' in result
          ? createAreaResultEntities(Cesium, viewer, result)
          : 'bearing' in result
            ? createBearingResultEntities(Cesium, viewer, result)
            : createAngleResultEntities(Cesium, viewer, result),
      );
    });
    viewer.scene.requestRender?.();
  }, [results, cesiumScene, mapMode]);

  useEffect(() => {
    if (mapMode === 'globe' || !map || !mapReady) {
      return;
    }

    ensureGeometryLayers(map);
    const source = map.getSource(GEOMETRY_SOURCE_ID) as GeoJSONSource | undefined;

    if (!source) {
      return;
    }

    const features: GeoJSON.Feature[] = [];

    results.forEach((result) => {
      if ('area' in result) {
        const areaResult = result;
        const ring = [...areaResult.points.map((point) => [point.lon, point.lat]), [
          areaResult.points[0].lon,
          areaResult.points[0].lat,
        ]];
        const centroid = polygonCentroidMeters(areaResult.points);
        features.push({
          geometry: { coordinates: [ring], type: 'Polygon' },
          id: result.id,
          properties: { color: GEOMETRY_AREA_COLOR },
          type: 'Feature',
        });
        features.push({
          geometry: { coordinates: [centroid.lon, centroid.lat], type: 'Point' },
          properties: {
            color: GEOMETRY_AREA_COLOR,
            label: areaResult.surfaceArea != null
              ? `水平 ${formatMeasureArea(areaResult.area)} 贴地 ${formatMeasureArea(areaResult.surfaceArea)}`
              : `面积 ${formatMeasureArea(areaResult.area)} 周长 ${formatMeasureLength(areaResult.perimeter)}`,
          },
          type: 'Feature',
        });
        return;
      }

      if ('bearing' in result) {
        const [start, end] = result.points;
        const color = GEOMETRY_BEARING_COLOR;
        const radius = Math.max(haversineMeters(start, end) * 0.35, 2);
        const north = destinationPoint(start, 0, radius);

        features.push({
          geometry: { coordinates: [[start.lon, start.lat], [end.lon, end.lat]], type: 'LineString' },
          id: `${result.id}-line`,
          properties: { color },
          type: 'Feature',
        });
        features.push({
          geometry: { coordinates: [[start.lon, start.lat], [north.lon, north.lat]], type: 'LineString' },
          id: `${result.id}-north`,
          properties: { color },
          type: 'Feature',
        });
        features.push({
          geometry: {
            coordinates: buildArcLngLat(start, 0, result.bearing, radius).map((point) => [point.lon, point.lat]),
            type: 'LineString',
          },
          id: `${result.id}-arc`,
          properties: { color },
          type: 'Feature',
        });
        features.push({
          geometry: { coordinates: [(start.lon + end.lon) / 2, (start.lat + end.lat) / 2], type: 'Point' },
          id: `${result.id}-label`,
          properties: {
            color,
            label: `方位角 ${result.bearing.toFixed(2)}° · ${formatMeasureLength(result.horizontalDistance)}`,
          },
          type: 'Feature',
        });
        return;
      }

      const angleResult = result as AngleMeasureResult;
      const [first, vertex, second] = angleResult.points;
      const color = GEOMETRY_ANGLE_COLOR;
      features.push({
        geometry: { coordinates: [[first.lon, first.lat], [vertex.lon, vertex.lat]], type: 'LineString' },
        id: `${result.id}-a`,
        properties: { color },
        type: 'Feature',
      });
      features.push({
        geometry: { coordinates: [[vertex.lon, vertex.lat], [second.lon, second.lat]], type: 'LineString' },
        id: `${result.id}-b`,
        properties: { color },
        type: 'Feature',
      });
      features.push({
        geometry: {
          coordinates: buildArcLngLat(
            vertex,
            bearingDegrees(vertex, first),
            bearingDegrees(vertex, second),
            arcRadiusMeters(vertex, first, second),
          ).map((point) => [point.lon, point.lat]),
          type: 'LineString',
        },
        id: `${result.id}-arc`,
        properties: { color },
        type: 'Feature',
      });
      features.push({
        geometry: { coordinates: [vertex.lon, vertex.lat], type: 'Point' },
        id: `${result.id}-label`,
        properties: { color, label: formatMeasureAngle(angleResult.horizontalAngle) },
        type: 'Feature',
      });
    });

    if (isActive && activeMode) {
      const color = activeMode === 'area' || activeMode === 'area-surface'
        ? GEOMETRY_AREA_COLOR
        : activeMode === 'bearing'
          ? GEOMETRY_BEARING_COLOR
          : GEOMETRY_ANGLE_COLOR;
      const points = draftPointsRef.current;
      const floating = floatingPointRef.current;

      points.forEach((point) => {
        features.push({
          geometry: { coordinates: [point.lon, point.lat], type: 'Point' },
          properties: { color },
          type: 'Feature',
        });
      });

      if (activeMode === 'bearing' && floating && points.length >= 1) {
        features.push({
          geometry: { coordinates: [[points[0].lon, points[0].lat], [floating.lon, floating.lat]], type: 'LineString' },
          properties: { color },
          type: 'Feature',
        });
        features.push({
          geometry: { coordinates: [floating.lon, floating.lat], type: 'Point' },
          properties: { color, label: `方位角 ${bearingDegrees(points[0], floating).toFixed(2)}°` },
          type: 'Feature',
        });
      } else if (activeMode === 'area' || activeMode === 'area-surface') {
        const draft = floating ? [...points, floating] : points;

        if (draft.length >= 3) {
          const ring = [...draft.map((point) => [point.lon, point.lat]), [draft[0].lon, draft[0].lat]];
          features.push({
            geometry: { coordinates: [ring], type: 'Polygon' },
            properties: { color, preview: true },
            type: 'Feature',
          });
          const centroid = polygonCentroidMeters(draft);
          features.push({
            geometry: { coordinates: [centroid.lon, centroid.lat], type: 'Point' },
            properties: { color, label: `面积 ${formatMeasureArea(measurePolygonArea(draft))}` },
            type: 'Feature',
          });
        }

        if (draft.length >= 2) {
          features.push({
            geometry: {
              coordinates: [...draft.map((point) => [point.lon, point.lat]), [draft[0].lon, draft[0].lat]],
              type: 'LineString',
            },
            properties: { color, preview: true },
            type: 'Feature',
          });
        }
      } else if (points.length >= 2) {
        const firstRay: [number, number] = [points[0].lon, points[0].lat];
        const secondRay: [number, number] = [points[1].lon, points[1].lat];
        features.push({
          geometry: { coordinates: [firstRay, secondRay], type: 'LineString' },
          properties: { color },
          type: 'Feature',
        });
        features.push({
          geometry: { coordinates: [points[1].lon, points[1].lat], type: 'Point' },
          properties: {
            color,
            label: floating
              ? formatMeasureAngle(horizontalAngleDegrees(points[0], points[1], floating))
              : undefined,
          },
          type: 'Feature',
        });
      }

      if (floating && points.length > 0 && activeMode !== 'bearing' && (activeMode !== 'angle' || points.length < 3)) {
        const anchor = activeMode === 'angle' ? points[Math.min(points.length, 2) - 1] : points[points.length - 1];
        features.push({
          geometry: {
            coordinates: [[anchor.lon, anchor.lat], [floating.lon, floating.lat]],
            type: 'LineString',
          },
          properties: { color, preview: true },
          type: 'Feature',
        });
      }
    }

    source.setData({ features, type: 'FeatureCollection' });
  }, [activeMode, draftVersion, isActive, map, mapMode, mapReady, results]);

  useEffect(() => {
    if (mapMode === 'globe' || !isActive || !activeMode || !map || !mapReady) {
      return;
    }

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    const wasDoubleClickZoomEnabled = map.doubleClickZoom.isEnabled();
    const resetDraft2D = () => {
      draftPointsRef.current = [];
      floatingPointRef.current = null;
    };

    if (wasDoubleClickZoomEnabled) {
      map.doubleClickZoom.disable();
    }
    canvas.style.cursor = 'crosshair';

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      const point = toMeasurePoint(event.lngLat.lng, event.lngLat.lat, 0);

      draftPointsRef.current.push(point);

      if (activeMode === 'angle' && draftPointsRef.current.length >= 3) {
        const points = dedupePoints(draftPointsRef.current).slice(0, 3);

        if (points.length < 3) {
          draftPointsRef.current = points;
          setStatus('点位置太近，请重新选择第三个点');
        } else {
          addResult(buildAngleResult(points));
          resetDraft2D();
          setStatus('测量完成，结果已加入「测量结果」面板；可继续测量，Esc 退出');
        }
      } else if (activeMode === 'bearing' && draftPointsRef.current.length >= 2) {
        const points = dedupePoints(draftPointsRef.current).slice(0, 2);

        if (points.length < 2) {
          draftPointsRef.current = points;
          setStatus('点位置太近，请重新选择第二个点');
        } else {
          addResult(buildBearingResult([points[0], points[1]]));
          resetDraft2D();
          setStatus('测量完成，结果已加入「测量结果」面板；可继续测量，Esc 退出');
        }
      } else {
        setStatus(
          activeMode === 'area' || activeMode === 'area-surface'
            ? `已添加 ${draftPointsRef.current.length} 个顶点，双击完成`
            : activeMode === 'bearing'
              ? `已选择 ${draftPointsRef.current.length} / 2 个点`
              : `已选择 ${draftPointsRef.current.length} / 3 个点`,
        );
      }

      bumpDraft();
    };

    const handleDoubleClick = (event: maplibregl.MapMouseEvent) => {
      event.preventDefault();

      if (activeMode !== 'area' && activeMode !== 'area-surface') {
        return;
      }

      const points = dedupePoints(draftPointsRef.current);

      if (points.length < 3) {
        setStatus('至少需要 3 个不同位置的顶点才能完成面积测量');
        bumpDraft();
        return;
      }

      addResult(buildAreaResult(points));
      resetDraft2D();
      setStatus('测量完成，结果已加入「测量结果」面板；可继续测量，Esc 退出');
      bumpDraft();
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      if (draftPointsRef.current.length === 0) {
        return;
      }

      const current = floatingPointRef.current;
      const lng = event.lngLat.lng;
      const lat = event.lngLat.lat;

      if (current && Math.abs(current.lon - lng) < 1e-7 && Math.abs(current.lat - lat) < 1e-7) {
        return;
      }

      floatingPointRef.current = toMeasurePoint(lng, lat, 0);
      bumpDraft();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();

      if (draftPointsRef.current.length > 0) {
        resetDraft2D();
        setStatus(activeMode === 'area' ? '已取消本次绘制，请重新单击添加顶点' : '已取消本次选择，请重新单击选择起点');
        bumpDraft();
        return;
      }

      closeMeasure();
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDoubleClick);
    map.on('mousemove', handleMouseMove);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDoubleClick);
      map.off('mousemove', handleMouseMove);
      document.removeEventListener('keydown', handleKeyDown);
      canvas.style.cursor = previousCursor;

      if (wasDoubleClickZoomEnabled) {
        map.doubleClickZoom.enable();
      }

      resetDraft2D();
      bumpDraft();
    };
  }, [activeMode, addResult, bumpDraft, closeMeasure, isActive, map, mapMode, mapReady, setStatus]);

  if (!isActive) {
    return null;
  }

  const ModeIcon = activeMode === 'angle'
    ? Triangle
    : activeMode === 'bearing'
      ? Compass
      : Square;
  const modeLabel = activeMode === 'angle'
    ? '角度测量'
    : activeMode === 'bearing'
      ? '方位角测量'
      : activeMode === 'area-surface'
        ? '贴地面积测量'
        : '面积测量';

  return (
    <aside className="map-terrain-panel" aria-label={modeLabel}>
      <header className="map-terrain-panel-header">
        <div>
          <ModeIcon size={15} strokeWidth={1.8} />
          <span>{modeLabel}</span>
        </div>
        <button type="button" title="关闭" aria-label="关闭" onClick={closeMeasure}>
          <X size={14} strokeWidth={1.8} />
        </button>
      </header>
      <div className="map-terrain-panel-body">
        <div className="map-terrain-status" aria-live="polite">{status}</div>
        <div className="map-elevation-actions">
          <span className="map-elevation-summary">
            {mapMode === 'globe' ? '三维模式：贴地取点' : '平面模式：平面取点'}
          </span>
          <button type="button" disabled={results.length === 0} onClick={clearResults}>
            <Eraser size={13} />
            清除全部结果
          </button>
        </div>
      </div>
    </aside>
  );
}
