import { RotateCcw, X } from 'lucide-react';
import { basemapOptions, type BasemapId } from '../../../components/map/basemapOptions';
import { cesiumImageryGroups, type CesiumImageryId } from '../../../components/map/cesiumLayerOptions';
import type { BasemapSourceKind } from '../../../components/map/rasterBasemapSources';
import {
  defaultUploadedLayerStyle,
  type BasemapLayerStyle,
  type RasterLayerStyle,
  type UploadedLayerStyle,
  type VectorOverlayStyle,
} from '../../../gisStore';
import type { LayerListItem } from './layerViewTypes';

export type LayerStylePanelProps = {
  item: LayerListItem;
  rasterStyle: RasterLayerStyle;
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  vectorOverlayStyle: VectorOverlayStyle;
  onClose: () => void;
  onReset: () => void;
  onUpdateBasemap: (
    patch: Partial<BasemapLayerStyle> & {
      basemapId?: BasemapId;
      basemapSourceKind?: BasemapSourceKind;
      cesiumImageryId?: CesiumImageryId;
    },
  ) => void;
  onUpdateRaster: (patch: Partial<RasterLayerStyle>) => void;
  onUpdateUploaded: (id: string, patch: Partial<UploadedLayerStyle>) => void;
  onUpdateVectorOverlay: (patch: Partial<VectorOverlayStyle>) => void;
};

export function LayerStylePanel({
  item,
  rasterStyle,
  uploadedLayerStyles,
  vectorOverlayStyle,
  onClose,
  onReset,
  onUpdateBasemap,
  onUpdateRaster,
  onUpdateUploaded,
  onUpdateVectorOverlay,
}: LayerStylePanelProps) {
  return (
    <section className="layer-style-panel" aria-label={`${item.label} 编辑面板`} onClick={(event) => event.stopPropagation()}>
      <div className="layer-style-header">
        <h4>编辑</h4>
        <button type="button" title="关闭" aria-label="关闭编辑面板" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      {item.kind === 'uploaded' ? (
        <UploadedStyleEditor
          style={uploadedLayerStyles[item.layer.id] ?? defaultUploadedLayerStyle}
          onChange={(patch) => onUpdateUploaded(item.layer.id, patch)}
        />
      ) : null}

      {item.kind === 'raster' ? (
        <RasterStyleEditor style={rasterStyle} onChange={onUpdateRaster} />
      ) : null}

      {item.kind === 'vectorOverlay' ? (
        <VectorOverlayStyleEditor style={vectorOverlayStyle} onChange={onUpdateVectorOverlay} />
      ) : null}

      {item.kind === 'basemap' ? (
        <BasemapStyleEditor
          style={{ opacity: item.opacity }}
          basemapId={item.basemapId}
          basemapSourceKind={item.basemapSourceKind}
          imageryId={item.cesiumImageryId}
          onChange={onUpdateBasemap}
        />
      ) : null}

      <div className="layer-style-actions">
        <button type="button" onClick={onReset}>
          <RotateCcw size={14} />
          <span>重置样式</span>
        </button>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
    </section>
  );
}

function UploadedStyleEditor({
  style,
  onChange,
}: {
  style: UploadedLayerStyle;
  onChange: (patch: Partial<UploadedLayerStyle>) => void;
}) {
  return (
    <div className="layer-style-form">
      <ColorControl label="点颜色" value={style.pointColor} onChange={(value) => onChange({ pointColor: value })} />
      <RangeControl label="点大小" value={style.pointRadius} min={1} max={24} step={0.5} onChange={(value) => onChange({ pointRadius: value })} />
      <RangeControl label="点透明度" value={style.pointOpacity} min={0} max={1} step={0.05} onChange={(value) => onChange({ pointOpacity: value })} />
      <ColorControl label="描边颜色" value={style.pointStrokeColor} onChange={(value) => onChange({ pointStrokeColor: value })} />
      <RangeControl label="描边宽度" value={style.pointStrokeWidth} min={0} max={8} step={0.5} onChange={(value) => onChange({ pointStrokeWidth: value })} />
      <ColorControl label="线颜色" value={style.lineColor} onChange={(value) => onChange({ lineColor: value })} />
      <RangeControl label="线宽" value={style.lineWidth} min={0.5} max={12} step={0.5} onChange={(value) => onChange({ lineWidth: value })} />
      <RangeControl label="线透明度" value={style.lineOpacity} min={0} max={1} step={0.05} onChange={(value) => onChange({ lineOpacity: value })} />
      <ColorControl label="面颜色" value={style.fillColor} onChange={(value) => onChange({ fillColor: value })} />
      <RangeControl label="面透明度" value={style.fillOpacity} min={0} max={1} step={0.05} onChange={(value) => onChange({ fillOpacity: value })} />
    </div>
  );
}

function RasterStyleEditor({
  style,
  onChange,
}: {
  style: RasterLayerStyle;
  onChange: (patch: Partial<RasterLayerStyle>) => void;
}) {
  return (
    <div className="layer-style-form">
      <RangeControl label="透明度" value={style.opacity} min={0} max={1} step={0.05} onChange={(value) => onChange({ opacity: value })} />
    </div>
  );
}

function VectorOverlayStyleEditor({
  style,
  onChange,
}: {
  style: VectorOverlayStyle;
  onChange: (patch: Partial<VectorOverlayStyle>) => void;
}) {
  return (
    <div className="layer-style-form">
      <ColorControl label="填充颜色" value={style.fillColor} onChange={(value) => onChange({ fillColor: value })} />
      <RangeControl label="填充透明度" value={style.fillOpacity} min={0} max={1} step={0.05} onChange={(value) => onChange({ fillOpacity: value })} />
      <ColorControl label="边线颜色" value={style.lineColor} onChange={(value) => onChange({ lineColor: value })} />
      <RangeControl label="边线宽度" value={style.lineWidth} min={0.5} max={12} step={0.5} onChange={(value) => onChange({ lineWidth: value })} />
    </div>
  );
}

function BasemapStyleEditor({
  style,
  basemapId,
  basemapSourceKind,
  imageryId,
  onChange,
}: {
  style: BasemapLayerStyle;
  basemapId: BasemapId;
  basemapSourceKind: BasemapSourceKind;
  imageryId: CesiumImageryId;
  onChange: LayerStylePanelProps['onUpdateBasemap'];
}) {
  const selectedValue = basemapSourceKind === 'imagery'
    ? `imagery:${imageryId}`
    : `basemap:${basemapId}`;

  return (
    <div className="layer-style-form">
      <label className="layer-style-field">
        <span>图源</span>
        <select
          className="layer-basemap-select"
          value={selectedValue}
          onChange={(event) => {
            const [kind, rawValue] = event.target.value.split(':', 2);

            if (kind === 'imagery') {
              onChange({ cesiumImageryId: rawValue as CesiumImageryId, basemapSourceKind: 'imagery' });
              return;
            }

            onChange({ basemapId: rawValue as BasemapId, basemapSourceKind: 'basemap' });
          }}
        >
          <optgroup label="2D">
            {basemapOptions.map((option) => (
              <option key={option.id} value={`basemap:${option.id}`}>
                {option.label}
              </option>
            ))}
          </optgroup>
          {cesiumImageryGroups.map((group) => (
            <optgroup key={group.title} label={group.title}>
              {group.options.map((option) => (
                <option key={option.id} value={`imagery:${option.id}`}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <RangeControl label="透明度" value={style.opacity} min={0} max={1} step={0.05} onChange={(value) => onChange({ opacity: value })} />
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="layer-style-field">
      <span className="tree-row-label">{label}</span>
      <div className="layer-color-control">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input value={value} readOnly aria-label={`${label} 颜色`} />
      </div>
    </label>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
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
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max))}
        />
        <output>{formatStyleNumber(value)}</output>
      </div>
    </label>
  );
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function formatStyleNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
