import { SceneModelVertexSnapToggle } from './SceneModelVertexSnapToggle';
import { useElevationMeasure } from './ElevationMeasureContext';
import { useGeometryMeasure } from './GeometryMeasureContext';
import type { MapViewMode } from './MapCommandContext';

/**
 * 测量工具内联设置条：几何（角度/方位角/面积）或两点高程测量激活时显示，
 * 位于功能区分组工具按钮右侧，仅承载开关设置；
 * 状态提示与清除结果分别在地图交互和测量结果面板中呈现。
 */
export function MeasureSettingsInline({ mapMode }: { mapMode: MapViewMode }) {
  const geometry = useGeometryMeasure();
  const elevation = useElevationMeasure();
  const isElevationActive = elevation.isActive;

  if (!geometry.isActive && !isElevationActive) {
    return null;
  }

  return (
    <div className="ribbon-measure-settings">
      <div className="ribbon-measure-toggles">
        <SceneModelVertexSnapToggle />
        {isElevationActive ? (
          <label className="map-elevation-occlusion" title="开启后测量线和标注会被地形遮挡">
            <input
              type="checkbox"
              checked={elevation.isOcclusionEnabled}
              onChange={elevation.toggleOcclusion}
            />
            地形遮挡
          </label>
        ) : (
          <span className="ribbon-measure-mode">{mapMode === 'globe' ? '三维贴地取点' : '平面取点'}</span>
        )}
      </div>
    </div>
  );
}
