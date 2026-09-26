import { useState } from 'react';
import { ChevronDown, ChevronRight, Eraser, Trash2 } from 'lucide-react';
import { useElevationMeasure } from './ElevationMeasureContext';
import {
  formatMeasureLength,
  formatSignedMeasureLength,
  type ElevationMeasureResult,
} from './elevationMeasurement';

function formatPoint(label: string, point: ElevationMeasureResult['first']) {
  return `${label} ${point.lon.toFixed(5)}°E, ${point.lat.toFixed(5)}°N, ${point.height.toFixed(1)} m`;
}

export function ElevationMeasureResults() {
  const { clearResults, removeResult, results } = useElevationMeasure();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="elevation-result-list" aria-label="测量结果">
      <div className="elevation-result-toolbar">
        <span>两点高程测量结果（{results.length}）</span>
        <button type="button" disabled={results.length === 0} onClick={clearResults}>
          <Eraser size={13} />
          清除全部
        </button>
      </div>
      {results.length === 0 ? (
        <div className="elevation-result-empty">
          暂无测量结果。请切换到三维视图，在「地图 → 测量 → 两点高程」进行测量。
        </div>
      ) : (
        results.map((result, index) => {
          const isExpanded = expandedId === result.id;
          const heightDifference = result.second.height - result.first.height;

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
                    测量 {index + 1}
                    <em>{formatSignedMeasureLength(heightDifference)}</em>
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
                  <div className="elevation-result-grid">
                    <span>斜距</span>
                    <b>{formatMeasureLength(result.slopeDistance)}</b>
                    <span>水平投影</span>
                    <b>{formatMeasureLength(result.horizontalDistance)}</b>
                    <span>垂直高差</span>
                    <b>{formatSignedMeasureLength(result.verticalDistance)}</b>
                    <span>高程差</span>
                    <b>{formatSignedMeasureLength(heightDifference)}</b>
                  </div>
                  <div className="elevation-result-points">
                    <div>{formatPoint('A', result.first)}</div>
                    <div>{formatPoint('B', result.second)}</div>
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
