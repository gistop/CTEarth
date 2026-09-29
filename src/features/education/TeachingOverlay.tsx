import { useEffect } from 'react';
import { Earth, X } from 'lucide-react';
import type { MapViewMode } from '../maps/components/map/MapCommandContext';
import type { CesiumNamespace, CesiumViewer } from '../maps/components/map/cesiumRuntime';
import { useTeaching } from './TeachingContext';
import { EARTH_LAYERS, enableEarthLayersCutaway } from './earthLayersCesium';

type TeachingOverlayProps = {
  cesiumScene: { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
  mapMode: MapViewMode;
};

export function TeachingOverlay({ cesiumScene, mapMode }: TeachingOverlayProps) {
  const { activeDemo, closeTeachingDemo } = useTeaching();

  useEffect(() => {
    if (activeDemo !== 'earth-layers' || !cesiumScene || mapMode !== 'globe') {
      return;
    }

    const session = enableEarthLayersCutaway(cesiumScene.Cesium, cesiumScene.viewer);

    return () => {
      session.disable();
    };
  }, [activeDemo, cesiumScene, mapMode]);

  if (activeDemo !== 'earth-layers') {
    return null;
  }

  return (
    <aside className="map-terrain-panel earth-layers-panel" aria-label="地球圈层">
      <header className="map-terrain-panel-header">
        <div>
          <Earth size={15} strokeWidth={1.8} />
          <span>地球圈层剖面</span>
        </div>
        <button type="button" title="关闭" aria-label="关闭" onClick={closeTeachingDemo}>
          <X size={14} strokeWidth={1.8} />
        </button>
      </header>
      <div className="map-terrain-panel-body">
        <div className="earth-layers-list">
          {EARTH_LAYERS.map((layer) => (
            <div className="earth-layer-item" key={layer.name}>
              <span className="earth-layer-dot" style={{ background: layer.color }} />
              <div>
                <div className="earth-layer-title">
                  <span className="earth-layer-name">{layer.name}</span>
                  <span className="earth-layer-range">{layer.range}</span>
                </div>
                <div className="earth-layer-note">{layer.note}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="earth-layers-hint">
          已切掉八分之一球体：赤道面最亮、两立面依次变暗；配色按地温梯度由外向内升温，内核最热。
        </p>
      </div>
    </aside>
  );
}
