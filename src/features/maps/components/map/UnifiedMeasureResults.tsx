import { useState, type ReactNode } from 'react';
import { Eraser, LocateFixed, Trash2 } from 'lucide-react';
import { useElevationMeasure } from './ElevationMeasureContext';
import { useGeometryMeasure, type GeometryMeasureResult } from './GeometryMeasureContext';
import { useMapMeasure } from './MapMeasureContext';
import { DistanceMeasurementResultItem } from './DistanceMeasurementResults';
import { ElevationMeasureResultItem } from './ElevationMeasureResults';
import { GeometryMeasureResultItem } from './GeometryMeasureResults';

type UnifiedMeasureEntry = {
  category: 'coordinate' | 'distance' | 'elevation' | 'geometry';
  createdAt: number;
  id: string;
  node: ReactNode;
};

function chronologicalNumbers(items: { createdAt?: number; id: string }[]) {
  const sorted = [...items].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  return new Map(sorted.map((item, index) => [item.id, index + 1]));
}

function geometryKindLabel(result: GeometryMeasureResult) {
  if ('area' in result) {
    return '面积';
  }

  if ('bearing' in result) {
    return '方位角';
  }

  return '角度';
}

export function UnifiedMeasureResults() {
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
  const {
    clearResults: clearElevationResults,
    removeResult: removeElevationResult,
    results: elevationResults,
  } = useElevationMeasure();
  const {
    clearResults: clearGeometryResults,
    removeResult: removeGeometryResult,
    results: geometryResults,
  } = useGeometryMeasure();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const coordinateNumbers = chronologicalNumbers(coordinateResults);
  const distanceNumbers = chronologicalNumbers(completedMeasurements);
  const elevationNumbers = chronologicalNumbers(elevationResults);
  const geometryNumbers = chronologicalNumbers(geometryResults);

  const toggleExpanded = (id: string) => setExpandedId(expandedId === id ? null : id);

  const entries: UnifiedMeasureEntry[] = [
    ...coordinateResults.map<UnifiedMeasureEntry>((result) => ({
      category: 'coordinate',
      createdAt: result.createdAt ?? 0,
      id: result.id,
      node: (
        <article className="elevation-result-item" key={result.id}>
          <div className="elevation-result-item-header">
            <span className="elevation-result-expand">
              <LocateFixed size={14} />
              <span>
                坐标 {coordinateNumbers.get(result.id)}
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
      ),
    })),
    ...completedMeasurements.map<UnifiedMeasureEntry>((measurement) => ({
      category: 'distance',
      createdAt: measurement.createdAt ?? 0,
      id: measurement.id,
      node: (
        <DistanceMeasurementResultItem
          key={measurement.id}
          measurement={measurement}
          title={`距离 ${distanceNumbers.get(measurement.id)}`}
          isExpanded={expandedId === measurement.id}
          onToggleExpanded={() => toggleExpanded(measurement.id)}
          onRemove={() => removeCompletedMeasurement(measurement.id)}
          onStyleChange={updateCompletedMeasurementStyle}
          onVisibilityChange={updateCompletedMeasurementVisibility}
        />
      ),
    })),
    ...elevationResults.map<UnifiedMeasureEntry>((result) => ({
      category: 'elevation',
      createdAt: result.createdAt ?? 0,
      id: result.id,
      node: (
        <ElevationMeasureResultItem
          key={result.id}
          result={result}
          title={`高程 ${elevationNumbers.get(result.id)}`}
          isExpanded={expandedId === result.id}
          onToggleExpanded={() => toggleExpanded(result.id)}
          onRemove={() => removeElevationResult(result.id)}
        />
      ),
    })),
    ...geometryResults.map<UnifiedMeasureEntry>((result) => ({
      category: 'geometry',
      createdAt: result.createdAt ?? 0,
      id: result.id,
      node: (
        <GeometryMeasureResultItem
          key={result.id}
          result={result}
          title={`${geometryKindLabel(result)} ${geometryNumbers.get(result.id)}`}
          isExpanded={expandedId === result.id}
          onToggleExpanded={() => toggleExpanded(result.id)}
          onRemove={() => removeGeometryResult(result.id)}
        />
      ),
    })),
  ];

  entries.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));

  const clearAll = () => {
    clearCompletedMeasurements();
    clearCoordinateResults();
    clearElevationResults();
    clearGeometryResults();
    setExpandedId(null);
  };

  return (
    <section className="elevation-result-list" aria-label="测量结果">
      <div className="elevation-result-toolbar">
        <span>测量结果（{entries.length}）</span>
        <button type="button" disabled={entries.length === 0} onClick={clearAll}>
          <Eraser size={13} />
          清除全部
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="elevation-result-empty">
          暂无测量结果。在「地图 → 测量」选择工具后即可在地图上量测，结果按测量先后顺序在此列出。
        </div>
      ) : (
        entries.map((entry) => entry.node)
      )}
    </section>
  );
}
