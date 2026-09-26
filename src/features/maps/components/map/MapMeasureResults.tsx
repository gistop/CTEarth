import { Eraser, LocateFixed, Trash2 } from 'lucide-react';
import { useMapMeasure } from './MapMeasureContext';
import { DistanceMeasurementResults } from './DistanceMeasurementResults';

export function MapMeasureResults() {
  const {
    clearCompletedMeasurements,
    clearCoordinateResults,
    completedMeasurements,
    coordinateResults,
    removeCompletedMeasurement,
    removeCoordinateResult,
    updateCompletedMeasurementStyle,
    updateCompletedMeasurementVisibility,
  } = useMapMeasure();

  return (
    <>
      <section className="elevation-result-list" aria-label="坐标测量结果">
        <div className="elevation-result-toolbar">
          <span>坐标测量结果（{coordinateResults.length}）</span>
          <button
            type="button"
            disabled={coordinateResults.length === 0}
            onClick={clearCoordinateResults}
          >
            <Eraser size={13} />
            清除全部
          </button>
        </div>
        {coordinateResults.length === 0 ? (
          <div className="elevation-result-empty">
            暂无坐标结果。在「地图 → 测量 → 坐标」单击地图取点。
          </div>
        ) : (
          coordinateResults.slice(0, 12).map((result, index) => (
            <article className="elevation-result-item" key={result.id}>
              <div className="elevation-result-item-header">
                <span className="elevation-result-expand">
                  <LocateFixed size={14} />
                  <span>
                    坐标 {index + 1}
                    <em>{`${result.lon.toFixed(6)}°E, ${result.lat.toFixed(6)}°N`}</em>
                  </span>
                </span>
                <button
                  type="button"
                  title="删除该坐标"
                  aria-label="删除该坐标"
                  onClick={() => removeCoordinateResult(result.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="elevation-result-body">
                <div className="elevation-result-grid">
                  <span>经度</span>
                  <b>{result.lon.toFixed(6)}°E</b>
                  <span>纬度</span>
                  <b>{result.lat.toFixed(6)}°N</b>
                  <span>高程</span>
                  <b>{result.height.toFixed(2)} m</b>
                </div>
              </div>
            </article>
          ))
        )}
        {coordinateResults.length > 12 ? (
          <div className="elevation-result-empty">
            仅显示最近 12 条，共 {coordinateResults.length} 条。
          </div>
        ) : null}
      </section>
      <DistanceMeasurementResults
        measurements={completedMeasurements}
        onClearAll={clearCompletedMeasurements}
        onRemove={removeCompletedMeasurement}
        onStyleChange={updateCompletedMeasurementStyle}
        onVisibilityChange={updateCompletedMeasurementVisibility}
      />
    </>
  );
}
