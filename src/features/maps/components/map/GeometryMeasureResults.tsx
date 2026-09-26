import { useState } from 'react';
import { ChevronDown, ChevronRight, Compass, Eraser, Trash2 } from 'lucide-react';
import { useGeometryMeasure } from './GeometryMeasureContext';
import { formatMeasureLength } from './elevationMeasurement';
import {
  formatMeasureAngle,
  formatMeasureArea,
  formatSignedMeasureAngle,
  type AngleMeasureResult,
  type AreaMeasureResult,
  type BearingMeasureResult,
  type GeometryMeasurePoint,
} from './geometryMeasurement';

function formatVertex(label: string, point: GeometryMeasurePoint) {
  return `${label} ${point.lon.toFixed(5)}°E, ${point.lat.toFixed(5)}°N, ${point.height.toFixed(1)} m`;
}

function bearingDirectionLabel(bearing: number) {
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

  return directions[Math.round(bearing / 45) % 8];
}

export function GeometryMeasureResults() {
  const { clearResults, removeResult, results } = useGeometryMeasure();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="elevation-result-list" aria-label="几何测量结果">
      <div className="elevation-result-toolbar">
        <span>几何测量结果（{results.length}）</span>
        <button type="button" disabled={results.length === 0} onClick={clearResults}>
          <Eraser size={13} />
          清除全部
        </button>
      </div>
      {results.length === 0 ? (
        <div className="elevation-result-empty">
          暂无测量结果。在「地图 → 测量」使用 面积 / 角度 / 方位角 工具。
        </div>
      ) : (
        results.map((result, index) => {
          const isExpanded = expandedId === result.id;
          const isArea = 'area' in result;
          const isBearing = !isArea && 'bearing' in result;

          return (
            <article className="elevation-result-item" key={result.id}>
              <div className="elevation-result-item-header">
                <button
                  className="elevation-result-expand"
                  type="button"
                  aria-expanded={isExpanded}
                  title={isExpanded ? '收起结果' : '展开结果'}
                  onClick={() => setExpandedId(isExpanded ? null : result.id)}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>
                    {isArea ? '面积' : isBearing ? '方位角' : '角度'} {index + 1}
                    <em>
                      {isArea
                        ? formatMeasureArea((result as AreaMeasureResult).area)
                        : isBearing
                          ? `${(result as BearingMeasureResult).bearing.toFixed(2)}°`
                          : formatMeasureAngle((result as AngleMeasureResult).horizontalAngle)}
                    </em>
                  </span>
                </button>
                <button
                  type="button"
                  title="删除该测量"
                  aria-label="删除该测量"
                  onClick={() => removeResult(result.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {isExpanded ? (
                <div className="elevation-result-body">
                  {isArea ? (
                    <div className="elevation-result-grid">
                      <span>水平面积</span>
                      <b>{formatMeasureArea((result as AreaMeasureResult).area)}</b>
                      {(result as AreaMeasureResult).surfaceArea != null ? (
                        <>
                          <span>贴地面积</span>
                          <b>{formatMeasureArea((result as AreaMeasureResult).surfaceArea as number)}</b>
                        </>
                      ) : null}
                      <span>周长</span>
                      <b>{formatMeasureLength((result as AreaMeasureResult).perimeter)}</b>
                      <span>顶点数</span>
                      <b>{(result as AreaMeasureResult).points.length}</b>
                    </div>
                  ) : isBearing ? (
                    <div className="elevation-result-grid">
                      <span>方位角</span>
                      <b>
                        {(result as BearingMeasureResult).bearing.toFixed(2)}°
                        （{bearingDirectionLabel((result as BearingMeasureResult).bearing)}）
                      </b>
                      <span>水平距离</span>
                      <b>{formatMeasureLength((result as BearingMeasureResult).horizontalDistance)}</b>
                    </div>
                  ) : (
                    <div className="elevation-result-grid">
                      <span>水平角</span>
                      <b>{formatMeasureAngle((result as AngleMeasureResult).horizontalAngle)}</b>
                      <span>空间角</span>
                      <b>{(result as AngleMeasureResult).spaceAngle !== undefined
                        ? formatMeasureAngle((result as AngleMeasureResult).spaceAngle as number)
                        : '--（平面模式无高程）'}</b>
                      <span>俯仰角 A</span>
                      <b>{(result as AngleMeasureResult).firstPitch !== undefined
                        ? formatSignedMeasureAngle((result as AngleMeasureResult).firstPitch as number)
                        : '--'}</b>
                      <span>俯仰角 B</span>
                      <b>{(result as AngleMeasureResult).secondPitch !== undefined
                        ? formatSignedMeasureAngle((result as AngleMeasureResult).secondPitch as number)
                        : '--'}</b>
                    </div>
                  )}
                  <div className="elevation-result-points">
                    {isArea
                      ? (result as AreaMeasureResult).points.map((point, pointIndex) => (
                        <div key={pointIndex}>{formatVertex(String(pointIndex + 1), point)}</div>
                      ))
                      : isBearing
                        ? ['起点', '终点'].map((label, pointIndex) => (
                          <div key={label}>{formatVertex(label, (result as BearingMeasureResult).points[pointIndex])}</div>
                        ))
                        : ['A', 'B(角点)', 'C'].map((label, pointIndex) => (
                          <div key={label}>{formatVertex(label, (result as AngleMeasureResult).points[pointIndex])}</div>
                        ))}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })
      )}
    </section>
  );
}
