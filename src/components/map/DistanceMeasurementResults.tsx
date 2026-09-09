import { ChevronDown, ChevronRight, Eye, EyeOff, RotateCcw, Settings2, Trash2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  createDefaultDistanceMeasurementStyle,
  type CompletedDistanceMeasurement,
  type DistanceMeasurementStyle,
} from './distanceMeasurement';

type DistanceMeasurementResultsProps = {
  measurements: CompletedDistanceMeasurement[];
  onRemove: (id: string) => void;
  onStyleChange: (id: string, patch: Partial<DistanceMeasurementStyle>) => void;
  onVisibilityChange: (id: string, isVisible: boolean) => void;
};

export function DistanceMeasurementResults({
  measurements,
  onRemove,
  onStyleChange,
  onVisibilityChange,
}: DistanceMeasurementResultsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (measurements.length === 0) {
    return null;
  }

  return (
    <section className="measure-result-list" aria-label="测量结果">
      <div className="map-measure-result-title">测量结果</div>
      {measurements.map((measurement) => {
        const isExpanded = expandedId === measurement.id;
        const isEditing = editingId === measurement.id;

        return (
          <article className="measure-result-item" key={measurement.id}>
            <div className="measure-result-item-header">
              <button
                className="measure-result-expand"
                type="button"
                aria-expanded={isExpanded}
                title={isExpanded ? '收起结果' : '展开结果'}
                onClick={() => setExpandedId(isExpanded ? null : measurement.id)}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>{measurement.name}</span>
              </button>
              <button
                type="button"
                title={measurement.isVisible ? '隐藏测量结果' : '显示测量结果'}
                aria-label={measurement.isVisible ? '隐藏测量结果' : '显示测量结果'}
                onClick={() => onVisibilityChange(measurement.id, !measurement.isVisible)}
              >
                {measurement.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                className={isEditing ? 'is-active' : undefined}
                type="button"
                title="编辑样式"
                aria-label="编辑测量样式"
                onClick={() => setEditingId(isEditing ? null : measurement.id)}
              >
                <Settings2 size={14} />
              </button>
              <button
                type="button"
                title="删除测量结果"
                aria-label="删除测量结果"
                onClick={() => {
                  onRemove(measurement.id);
                  if (expandedId === measurement.id) setExpandedId(null);
                  if (editingId === measurement.id) setEditingId(null);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isExpanded ? (
              <dl className="measure-result-summary">
                <div><dt>总长</dt><dd>{formatDistance(measurement.totalDistance)}</dd></div>
                <div><dt>点数</dt><dd>{measurement.points.length}</dd></div>
                <div><dt>状态</dt><dd>已完成</dd></div>
              </dl>
            ) : null}

            {isEditing ? (
              <DistanceMeasurementStyleEditor
                style={measurement.style}
                onChange={(patch) => onStyleChange(measurement.id, patch)}
                onClose={() => setEditingId(null)}
                onReset={() => onStyleChange(measurement.id, createDefaultDistanceMeasurementStyle())}
              />
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

function DistanceMeasurementStyleEditor({
  style,
  onChange,
  onClose,
  onReset,
}: {
  style: DistanceMeasurementStyle;
  onChange: (patch: Partial<DistanceMeasurementStyle>) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <section className="measure-style-panel" aria-label="测量结果样式编辑">
      <div className="layer-style-header">
        <h4>样式</h4>
        <button type="button" title="关闭" aria-label="关闭样式编辑" onClick={onClose}><X size={15} /></button>
      </div>
      <div className="measure-style-form">
        <StyleGroup title="地上直线（a / b）">
          <ColorControl label="颜色" value={style.aboveGroundColor} onChange={(value) => onChange({ aboveGroundColor: value })} />
          <RangeControl label="线宽" value={style.aboveGroundWidth} min={1} max={8} step={0.5} onChange={(value) => onChange({ aboveGroundWidth: value })} />
        </StyleGroup>
        <StyleGroup title="地下虚线（c）">
          <ColorControl label="颜色" value={style.belowGroundColor} onChange={(value) => onChange({ belowGroundColor: value })} />
          <RangeControl label="线宽" value={style.belowGroundWidth} min={1} max={8} step={0.5} onChange={(value) => onChange({ belowGroundWidth: value })} />
        </StyleGroup>
        <StyleGroup title="地表交点球（d）">
          <ColorControl label="颜色" value={style.crossingColor} onChange={(value) => onChange({ crossingColor: value })} />
          <RangeControl label="大小" value={style.crossingRadius} min={3} max={60} step={1} onChange={(value) => onChange({ crossingRadius: value })} />
        </StyleGroup>
        <StyleGroup title="竖直线地面锚点">
          <ColorControl label="颜色" value={style.groundAnchorColor} onChange={(value) => onChange({ groundAnchorColor: value })} />
          <RangeControl label="大小" value={style.groundAnchorRadius} min={3} max={40} step={1} onChange={(value) => onChange({ groundAnchorRadius: value })} />
        </StyleGroup>
        <StyleGroup title="尺寸标注">
          <ColorControl label="尺寸线" value={style.dimensionColor} onChange={(value) => onChange({ dimensionColor: value })} />
          <RangeControl label="尺寸线宽" value={style.dimensionWidth} min={1} max={8} step={0.5} onChange={(value) => onChange({ dimensionWidth: value })} />
          <ColorControl label="尺寸界线" value={style.extensionColor} onChange={(value) => onChange({ extensionColor: value })} />
          <RangeControl label="界线宽" value={style.extensionWidth} min={1} max={8} step={0.5} onChange={(value) => onChange({ extensionWidth: value })} />
        </StyleGroup>
      </div>
      <div className="layer-style-actions">
        <button type="button" onClick={onReset}><RotateCcw size={14} /><span>重置样式</span></button>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
    </section>
  );
}

function StyleGroup({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="measure-style-group"><legend>{title}</legend>{children}</fieldset>;
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="layer-style-field">
      <span>{label}</span>
      <div className="layer-color-control">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input value={value} readOnly aria-label={`${label}颜色`} />
      </div>
    </label>
  );
}

function RangeControl({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="layer-style-field">
      <span>{label}</span>
      <div className="layer-range-control">
        <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
        <output>{Number.isInteger(value) ? value : value.toFixed(1)}</output>
      </div>
    </label>
  );
}

function formatDistance(value: number) {
  return value < 1000 ? `${value.toFixed(2)} m` : `${(value / 1000).toFixed(3)} km`;
}
