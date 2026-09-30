import { useEffect, useRef } from 'react';
import type { CesiumNamespace, CesiumViewer } from '../maps/components/map/cesiumRuntime';
import type { MapViewMode } from '../maps/components/map/MapCommandContext';
import { useTeaching } from './TeachingContext';
import { addLandformMarkers, clearLandformMarkers, flyToLandform } from './landformFlyToCesium';

// 桥接组件：科教面板（dockview 面板）无法直接访问 Cesium viewer，
// 通过 TeachingContext 的请求状态驱动挂在 MapPanel 内的本组件执行 flyTo 与标注管理。
type LandformFlyToBridgeProps = {
  cesiumScene: { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
  mapMode: MapViewMode;
};

export function LandformFlyToBridge({ cesiumScene, mapMode }: LandformFlyToBridgeProps) {
  const { landformFlyToRequest } = useTeaching();
  const markersRef = useRef<unknown[]>([]);

  useEffect(() => {
    if (!landformFlyToRequest || !cesiumScene || mapMode !== 'globe') {
      return;
    }

    const { Cesium, viewer } = cesiumScene;

    clearLandformMarkers(viewer, markersRef.current);
    markersRef.current = addLandformMarkers(Cesium, viewer, landformFlyToRequest.landform);
    flyToLandform(Cesium, viewer, landformFlyToRequest.landform);
  }, [landformFlyToRequest, cesiumScene, mapMode]);

  // 切换/销毁场景与卸载组件时清理标注
  useEffect(() => {
    return () => {
      if (cesiumScene) {
        clearLandformMarkers(cesiumScene.viewer, markersRef.current);
      }

      markersRef.current = [];
    };
  }, [cesiumScene]);

  return null;
}
