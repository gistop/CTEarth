import { useCallback } from 'react';
import { useElevationMeasure } from './ElevationMeasureContext';
import { useGeometryMeasure } from './GeometryMeasureContext';
import { useMapMeasure } from './MapMeasureContext';
import { useRibbonDistanceMeasure } from './RibbonDistanceMeasure';

export type MeasureToolId =
  | 'coordinate'
  | 'distance-space'
  | 'distance-surface'
  | 'area-horizontal'
  | 'area-surface'
  | 'elevation'
  | 'angle'
  | 'bearing';

export function useMeasureToolkit() {
  const {
    closeMeasure: closeElevationMeasure,
    isActive: isElevationActive,
    toggleMeasure: toggleElevationMeasure,
  } = useElevationMeasure();
  const {
    activeMode: geometryMode,
    closeMeasure: closeGeometryMeasure,
    toggleMeasure: toggleGeometryMeasure,
  } = useGeometryMeasure();
  const {
    closeMeasure: closeMapMeasure,
    isMeasureOpen,
    mode: mapMeasureMode,
    openMeasure,
    setMode: setMapMeasureMode,
  } = useMapMeasure();
  const {
    activate: activateRibbonDistance,
    deactivate: deactivateRibbonDistance,
    distanceKind: ribbonDistanceKind,
  } = useRibbonDistanceMeasure();

  const isRibbonDistanceTool = ribbonDistanceKind !== null;
  const isCoordinateTool = isMeasureOpen && mapMeasureMode === 'coordinate';

  const activeTool: MeasureToolId | null = (() => {
    if (isElevationActive) {
      return 'elevation';
    }

    if (geometryMode === 'area') {
      return 'area-horizontal';
    }

    if (geometryMode === 'area-surface') {
      return 'area-surface';
    }

    if (geometryMode === 'bearing') {
      return 'bearing';
    }

    if (geometryMode === 'angle') {
      return 'angle';
    }

    if (isCoordinateTool) {
      return 'coordinate';
    }

    if (ribbonDistanceKind === 'space') {
      return 'distance-space';
    }

    if (ribbonDistanceKind === 'surface') {
      return 'distance-surface';
    }

    return null;
  })();

  const activate = useCallback((tool: MeasureToolId) => {
    if (isRibbonDistanceTool && tool !== 'distance-space' && tool !== 'distance-surface') {
      deactivateRibbonDistance();
    }

    if (isElevationActive && tool !== 'elevation') {
      closeElevationMeasure();
    }

    if (geometryMode && !(geometryMode === tool)) {
      closeGeometryMeasure();
    }

    if (tool === 'elevation') {
      if (isMeasureOpen) {
        closeMapMeasure();
      }

      if (!isElevationActive) {
        toggleElevationMeasure();
      }

      return;
    }

    if (tool === 'area-horizontal' || tool === 'area-surface' || tool === 'angle' || tool === 'bearing') {
      if (isMeasureOpen) {
        closeMapMeasure();
      }

      const nextGeometryMode = tool === 'area-horizontal' ? 'area' : tool;

      if (geometryMode !== nextGeometryMode) {
        toggleGeometryMeasure(nextGeometryMode);
      }

      return;
    }

    if (tool === 'coordinate') {
      if (isCoordinateTool) {
        return;
      }

      setMapMeasureMode('coordinate');
      openMeasure();

      return;
    }

    if (tool === 'distance-space') {
      if (isMeasureOpen) {
        closeMapMeasure();
      }

      activateRibbonDistance('space');

      return;
    }

    if (isMeasureOpen) {
      closeMapMeasure();
    }

    activateRibbonDistance('surface');
  }, [
    activateRibbonDistance,
    closeElevationMeasure,
    closeGeometryMeasure,
    closeMapMeasure,
    deactivateRibbonDistance,
    geometryMode,
    isCoordinateTool,
    isElevationActive,
    isMeasureOpen,
    isRibbonDistanceTool,
    openMeasure,
    setMapMeasureMode,
    toggleElevationMeasure,
    toggleGeometryMeasure,
  ]);

  const deactivateAll = useCallback(() => {
    if (isElevationActive) {
      closeElevationMeasure();
    }

    if (geometryMode) {
      closeGeometryMeasure();
    }

    if (isMeasureOpen) {
      closeMapMeasure();
    }

    if (isRibbonDistanceTool) {
      deactivateRibbonDistance();
    }
  }, [
    closeElevationMeasure,
    closeGeometryMeasure,
    closeMapMeasure,
    deactivateRibbonDistance,
    geometryMode,
    isElevationActive,
    isMeasureOpen,
    isRibbonDistanceTool,
  ]);

  return { activeTool, activate, deactivateAll };
}
