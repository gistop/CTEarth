import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Database,
  GripVertical,
  Grid2X2,
  Layers,
  Map as MapIcon,
  PenTool,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  TableProperties,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import { useAttributeTable } from '../attributes/AttributeTableContext';
import { AddDataSplitButton } from './AddDataSplitButton';
import { SaveAsSplitButton } from './SaveAsSplitButton';
import {
  defaultBasemapStyle,
  defaultRasterStyle,
  defaultUploadedLayerStyle,
  defaultVectorOverlayStyle,
  displayLayerName,
  getPointBounds,
  useGis,
  type BasemapLayerStyle,
  type LayerOrderId,
  type RasterLayerStyle,
  type RasterOverlay,
  type UploadedLayer,
  type UploadedLayerStyle,
  type VectorOverlayStyle,
} from '../../gisStore';

type LayerListItem =
  | { id: 'basemap'; kind: 'basemap'; label: string; checked: boolean }
  | { id: `uploaded:${string}`; kind: 'uploaded'; layer: UploadedLayer; label: string; checked: boolean }
  | { id: `raster:${string}`; kind: 'raster'; raster: RasterOverlay; label: string; checked: boolean }
  | { id: 'vectorOverlay'; kind: 'vectorOverlay'; label: string; checked: boolean };

export function ContentsPanel() {
  return (
    <aside className="panel-shell contents-panel">
      <LayerSection />
    </aside>
  );
}

function LayerSection() {
  const rootCheckboxRef = useRef<HTMLInputElement | null>(null);
  const [draggingId, setDraggingId] = useState<LayerOrderId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<LayerOrderId | null>(null);
  const [expandedStyleId, setExpandedStyleId] = useState<LayerOrderId | null>(null);
  const {
    layers,
    activeLayerId,
    raster,
    rasters,
    vectorOverlay,
    message,
    basemapStyle,
    rasterStyle,
    vectorOverlayStyle,
    uploadedLayerStyles,
    layerVisibility,
    rasterLayerVisibility,
    uploadedLayerVisibility,
    layerOrder,
    createBlankGeoJsonLayer,
    deleteUploadedLayer,
    saveGeoJsonLayer,
    saveGeoPackageLayer,
    setLayerVisibility,
    setRasterLayerVisibility,
    setUploadedLayerVisibility,
    setAllLayerVisibility,
    setBasemapStyle,
    setRasterStyle,
    setVectorOverlayStyle,
    setUploadedLayerStyle,
    moveLayerOrder,
    setActiveLayer,
    setActiveRaster,
    zoomToLayer,
  } = useGis();
  const { openAttributeTable } = useAttributeTable();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const layerItems = useMemo(
    () => buildLayerItems({
      layers,
      layerOrder,
      layerVisibility,
      rasterLayerVisibility,
      rasters,
      uploadedLayerVisibility,
      vectorOverlayLabel: displayLayerName(vectorOverlay?.name ?? ''),
      hasVectorOverlay: Boolean(vectorOverlay),
    }),
    [layerOrder, layerVisibility, layers, rasterLayerVisibility, rasters, uploadedLayerVisibility, vectorOverlay],
  );

  const allVisible = layerItems.every((item) => item.checked);
  const someVisible = layerItems.some((item) => item.checked);
  const selectedUploadedLayer = selectedItemId?.startsWith('uploaded:')
    ? layers.find((item) => `uploaded:${item.id}` === selectedItemId) ?? null
    : null;
  const selectedVectorOverlay = selectedItemId === 'vectorOverlay' ? vectorOverlay : null;
  const selectedLayerBounds = selectedUploadedLayer ? getLayerBounds(selectedUploadedLayer) : null;

  useEffect(() => {
    if (activeLayerId) {
      setSelectedItemId(`uploaded:${activeLayerId}`);
      return;
    }

    if (raster) {
      setSelectedItemId(`raster:${raster.id}`);
      return;
    }

    if (vectorOverlay) {
      setSelectedItemId('vectorOverlay');
      return;
    }

    setSelectedItemId(null);
  }, [activeLayerId, raster?.id, vectorOverlay]);

  useEffect(() => {
    if (rootCheckboxRef.current) {
      rootCheckboxRef.current.indeterminate = someVisible && !allVisible;
    }
  }, [allVisible, someVisible]);

  const handleCreateBlankLayer = () => {
    const fileName = window.prompt('GeoJSON layer name', 'polygon-layer.geojson');

    if (fileName === null) {
      return;
    }

    createBlankGeoJsonLayer({ fileName, geometryType: 'Polygon' });
  };

  const handleDeleteSelectedLayer = () => {
    if (!selectedUploadedLayer) {
      return;
    }

    if (!window.confirm(`删除图层 ${displayLayerName(selectedUploadedLayer.fileName)}？`)) {
      return;
    }

    deleteUploadedLayer(selectedUploadedLayer.id);
    setExpandedStyleId((current) => (current === `uploaded:${selectedUploadedLayer.id}` ? null : current));
  };

  const handleZoomToSelectedLayer = () => {
    if (!selectedUploadedLayer || !selectedLayerBounds) {
      return;
    }

    zoomToLayer(selectedUploadedLayer.id);
  };

  const handleDrop = (targetId: LayerOrderId) => {
    if (draggingId && draggingId !== targetId) {
      moveLayerOrder(draggingId, targetId);
    }

    setDraggingId(null);
    setDropTargetId(null);
  };

  return (
    <section className="contents-layer-section" aria-label="图层内容">
      <div className="panel-search">
        <Search size={15} />
        <input placeholder="搜索" aria-label="搜索内容" />
      </div>
      <div className="contents-tabs">
        <Layers size={18} />
        <Database size={18} />
        <MapIcon size={18} />
        <PenTool size={18} />
        <Grid2X2 size={18} />
        <button
          type="button"
          title="打开属性表"
          aria-label="打开当前矢量图层属性表"
          disabled={!selectedUploadedLayer && !selectedVectorOverlay}
          onClick={() => {
            if (selectedUploadedLayer) {
              openAttributeTable(selectedUploadedLayer.id, displayLayerName(selectedUploadedLayer.fileName));
              return;
            }

            if (selectedVectorOverlay) {
              openAttributeTable('vectorOverlay', displayLayerName(selectedVectorOverlay.name));
            }
          }}
        >
          <TableProperties size={18} />
        </button>
        <button
          type="button"
          title="新建空白 GeoJSON 图层"
          aria-label="新建空白 GeoJSON 图层"
          onClick={handleCreateBlankLayer}
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          title="保存当前 GeoJSON 图层"
          aria-label="保存当前 GeoJSON 图层"
          disabled={!selectedUploadedLayer && !selectedVectorOverlay}
          onClick={() => {
            if (selectedUploadedLayer) {
              void saveGeoJsonLayer(selectedUploadedLayer.id);
              return;
            }

            if (selectedVectorOverlay) {
              void saveGeoJsonLayer('vectorOverlay');
            }
          }}
        >
          <Save size={18} />
        </button>
        <SaveAsSplitButton
          disabled={!selectedUploadedLayer && !selectedVectorOverlay}
          onExport={(format) => {
            if (selectedUploadedLayer) {
              if (format === 'geojson') {
                return saveGeoJsonLayer(selectedUploadedLayer.id, { saveAs: true });
              }

              return saveGeoPackageLayer(selectedUploadedLayer.id, { saveAs: true });
            }

            if (selectedVectorOverlay) {
              if (format === 'geojson') {
                return saveGeoJsonLayer('vectorOverlay', { saveAs: true, fileName: selectedVectorOverlay.name });
              }

              return saveGeoPackageLayer('vectorOverlay', { saveAs: true, fileName: selectedVectorOverlay.name });
            }

            return undefined;
          }}
        />
        <AddDataSplitButton />
        <button
          type="button"
          title="删除选中图层"
          aria-label="删除鼠标选中的图层"
          disabled={!selectedUploadedLayer}
          onClick={handleDeleteSelectedLayer}
        >
          <Trash2 size={18} />
        </button>
        <button
          type="button"
          title="缩放到图层"
          aria-label="缩放到当前图层范围"
          disabled={!selectedUploadedLayer || !selectedLayerBounds}
          onClick={handleZoomToSelectedLayer}
        >
          <ZoomIn size={18} />
        </button>
      </div>
      <section className="layer-tree contents-layer-tree">
        <h3>绘制顺序</h3>
        <label className="tree-row root">
          <span className="tree-drag-spacer" />
          <input
            ref={rootCheckboxRef}
            type="checkbox"
            checked={allVisible}
            aria-label="地图"
            onChange={(event) => setAllLayerVisibility(event.target.checked)}
          />
          <MapIcon size={16} />
          <span>地图</span>
        </label>

        {layerItems.map((item) => {
          const isStyleOpen = item.id === expandedStyleId;

          return (
            <div className="layer-item-block" key={item.id}>
              <LayerRow
                checked={item.checked}
                dragState={item.id === draggingId ? 'dragging' : item.id === dropTargetId ? 'target' : undefined}
                isSelected={selectedItemId === item.id}
                isStyleOpen={isStyleOpen}
                label={item.label}
                orderId={item.id}
                swatchClass={swatchClassForItem(item)}
                swatchStyle={swatchStyleForItem(item, {
                  basemapStyle,
                  rasterStyle,
                  uploadedLayerStyles,
                  vectorOverlayStyle,
                })}
                onChange={(checked) => {
                  if (item.kind === 'uploaded') {
                    setUploadedLayerVisibility(item.layer.id, checked);
                  } else if (item.kind === 'raster') {
                    setRasterLayerVisibility(item.raster.id, checked);
                  } else {
                    setLayerVisibility(item.kind, checked);
                  }
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTargetId(null);
                }}
                onDragEnter={() => {
                  if (draggingId && draggingId !== item.id) {
                    setDropTargetId(item.id);
                  }
                }}
                onDragStart={() => setDraggingId(item.id)}
                onDrop={() => handleDrop(item.id)}
                onSelect={item.kind === 'uploaded'
                  ? () => {
                    setSelectedItemId(item.id);
                    setActiveLayer(item.layer.id);
                  }
                  : item.kind === 'raster'
                    ? () => {
                      setSelectedItemId(item.id);
                      setActiveRaster(item.raster.id);
                    }
                    : item.kind === 'vectorOverlay'
                      ? () => setSelectedItemId(item.id)
                      : undefined}
                onToggleStyle={() => {
                  setExpandedStyleId((current) => (current === item.id ? null : item.id));
                  if (item.kind === 'uploaded') {
                    setSelectedItemId(item.id);
                    setActiveLayer(item.layer.id);
                  } else if (item.kind === 'raster') {
                    setSelectedItemId(item.id);
                    setActiveRaster(item.raster.id);
                  } else if (item.kind === 'vectorOverlay') {
                    setSelectedItemId(item.id);
                  }
                }}
              />
              {isStyleOpen ? (
                <LayerStylePanel
                  item={item}
                  basemapStyle={basemapStyle}
                  rasterStyle={rasterStyle}
                  uploadedLayerStyles={uploadedLayerStyles}
                  vectorOverlayStyle={vectorOverlayStyle}
                  onClose={() => setExpandedStyleId(null)}
                  onReset={() => {
                    if (item.kind === 'uploaded') {
                      setUploadedLayerStyle(item.layer.id, defaultUploadedLayerStyle);
                    } else if (item.kind === 'raster') {
                      setRasterStyle(defaultRasterStyle);
                    } else if (item.kind === 'vectorOverlay') {
                      setVectorOverlayStyle(defaultVectorOverlayStyle);
                    } else {
                      setBasemapStyle(defaultBasemapStyle);
                    }
                  }}
                  onUpdateBasemap={setBasemapStyle}
                  onUpdateRaster={setRasterStyle}
                  onUpdateUploaded={setUploadedLayerStyle}
                  onUpdateVectorOverlay={setVectorOverlayStyle}
                />
              ) : null}
            </div>
          );
        })}

        {layers.length === 0 && rasters.length === 0 ? (
          <div className="layer-note">点击上方添加数据按钮，选择 Shapefile ZIP 或 GeoJSON。</div>
        ) : null}
        <div className="layer-note status">{message}</div>
      </section>
    </section>
  );
}

function LayerRow({
  checked,
  dragState,
  isSelected,
  isStyleOpen,
  label,
  orderId,
  swatchClass,
  swatchStyle,
  onChange,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onDrop,
  onSelect,
  onToggleStyle,
}: {
  checked: boolean;
  dragState?: 'dragging' | 'target';
  isSelected?: boolean;
  isStyleOpen?: boolean;
  label: string;
  orderId: LayerOrderId;
  swatchClass: string;
  swatchStyle?: CSSProperties;
  onChange: (checked: boolean) => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onSelect?: () => void;
  onToggleStyle: () => void;
}) {
  const className = [
    'tree-row',
    isSelected ? 'selected' : '',
    dragState === 'dragging' ? 'is-dragging' : '',
    dragState === 'target' ? 'is-drop-target' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      draggable
      onClick={onSelect}
      onDragEnd={onDragEnd}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', orderId);
        onDragStart();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onKeyDown={(event) => {
        if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onSelect();
        }
      }}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <GripVertical className="tree-drag-handle" size={15} aria-hidden="true" />
      <input
        type="checkbox"
        checked={checked}
        aria-label={`${label} 图层`}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={`layer-swatch ${swatchClass}`} style={swatchStyle} />
      <span>{label}</span>
      <button
        className={isStyleOpen ? 'layer-style-toggle is-open' : 'layer-style-toggle'}
        type="button"
        title="编辑样式"
        aria-label={`编辑 ${label} 样式`}
        aria-expanded={isStyleOpen}
        onClick={(event) => {
          event.stopPropagation();
          onToggleStyle();
        }}
      >
        <Settings size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function LayerStylePanel({
  item,
  basemapStyle,
  rasterStyle,
  uploadedLayerStyles,
  vectorOverlayStyle,
  onClose,
  onReset,
  onUpdateBasemap,
  onUpdateRaster,
  onUpdateUploaded,
  onUpdateVectorOverlay,
}: {
  item: LayerListItem;
  basemapStyle: BasemapLayerStyle;
  rasterStyle: RasterLayerStyle;
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  vectorOverlayStyle: VectorOverlayStyle;
  onClose: () => void;
  onReset: () => void;
  onUpdateBasemap: (patch: Partial<BasemapLayerStyle>) => void;
  onUpdateRaster: (patch: Partial<RasterLayerStyle>) => void;
  onUpdateUploaded: (id: string, patch: Partial<UploadedLayerStyle>) => void;
  onUpdateVectorOverlay: (patch: Partial<VectorOverlayStyle>) => void;
}) {
  return (
    <section className="layer-style-panel" aria-label={`${item.label} 样式设置`} onClick={(event) => event.stopPropagation()}>
      <div className="layer-style-header">
        <h4>编辑样式</h4>
        <button type="button" title="关闭" aria-label="关闭样式设置" onClick={onClose}>
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
        <BasemapStyleEditor style={basemapStyle} onChange={onUpdateBasemap} />
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
  onChange,
}: {
  style: BasemapLayerStyle;
  onChange: (patch: Partial<BasemapLayerStyle>) => void;
}) {
  return (
    <div className="layer-style-form">
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
      <span>{label}</span>
      <div className="layer-color-control">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input value={value} readOnly aria-label={`${label} 色值`} />
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

function getLayerBounds(layer: UploadedLayer) {
  return layer.points.features.length > 0
    ? getPointBounds(layer.points.features)
    : getGeoJsonBounds(layer.geojson);
}

function getGeoJsonBounds(geojson: { features: unknown[] }): [number, number, number, number] | null {
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  for (const feature of geojson.features) {
    if (!isRecord(feature) || !isRecord(feature.geometry)) {
      continue;
    }

    expandCoordinateBounds(feature.geometry.coordinates, bounds);
  }

  if (!Number.isFinite(bounds[0])) {
    return null;
  }

  return bounds;
}

function expandCoordinateBounds(value: unknown, bounds: [number, number, number, number]) {
  if (!Array.isArray(value)) {
    return;
  }

  if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    const lon = Number(value[0]);
    const lat = Number(value[1]);
    bounds[0] = Math.min(bounds[0], lon);
    bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lon);
    bounds[3] = Math.max(bounds[3], lat);
    return;
  }

  value.forEach((item) => expandCoordinateBounds(item, bounds));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildLayerItems({
  layers,
  layerOrder,
  layerVisibility,
  rasterLayerVisibility,
  rasters,
  uploadedLayerVisibility,
  hasVectorOverlay,
  vectorOverlayLabel,
}: {
  layers: UploadedLayer[];
  layerOrder: LayerOrderId[];
  layerVisibility: ReturnType<typeof useGis>['layerVisibility'];
  rasterLayerVisibility: Record<string, boolean>;
  rasters: RasterOverlay[];
  uploadedLayerVisibility: Record<string, boolean>;
  hasVectorOverlay: boolean;
  vectorOverlayLabel: string;
}) {
  const uploadedById = new Map(layers.map((item) => [item.id, item]));
  const rasterById = new Map(rasters.map((item) => [item.id, item]));
  const seen = new Set<LayerOrderId>();
  const normalizedOrder = [
    ...layerOrder,
    ...layers.map((item) => `uploaded:${item.id}` as const),
    ...rasters.map((item) => `raster:${item.id}` as const),
    'basemap' as const,
    ...(hasVectorOverlay ? ['vectorOverlay' as const] : []),
  ];
  const items: LayerListItem[] = [];

  for (const id of normalizedOrder) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);

    if (id === 'basemap') {
      items.push({ id, kind: 'basemap', label: '底图', checked: layerVisibility.basemap });
      continue;
    }

    if (id === 'raster') {
      continue;
    }

    if (id === 'vectorOverlay') {
      if (hasVectorOverlay) {
        items.push({ id, kind: 'vectorOverlay', label: vectorOverlayLabel, checked: layerVisibility.vectorOverlay });
      }

      continue;
    }

    if (id.startsWith('uploaded:')) {
      const itemId = id as `uploaded:${string}`;
      const layerId = id.slice('uploaded:'.length);
      const uploadedLayer = uploadedById.get(layerId);

      if (!uploadedLayer) {
        continue;
      }

      items.push({
        id: itemId,
        kind: 'uploaded',
        layer: uploadedLayer,
        label: displayLayerName(uploadedLayer.fileName),
        checked: uploadedLayerVisibility[uploadedLayer.id] ?? true,
      });
      continue;
    }

    if (id.startsWith('raster:')) {
      const itemId = id as `raster:${string}`;
      const rasterId = id.slice('raster:'.length);
      const raster = rasterById.get(rasterId);

      if (!raster) {
        continue;
      }

      items.push({
        id: itemId,
        kind: 'raster',
        raster,
        label: `${displayLayerName(raster.name)} ${raster.width} x ${raster.height}`,
        checked: rasterLayerVisibility[raster.id] ?? layerVisibility.raster,
      });
    }
  }

  return items;
}

function swatchClassForItem(item: LayerListItem) {
  if (item.kind === 'basemap') {
    return 'basemap';
  }

  if (item.kind === 'raster') {
    return 'raster';
  }

  if (item.kind === 'vectorOverlay') {
    return 'buffer';
  }

  return 'point';
}

function swatchStyleForItem(
  item: LayerListItem,
  styles: {
    basemapStyle: BasemapLayerStyle;
    rasterStyle: RasterLayerStyle;
    uploadedLayerStyles: Record<string, UploadedLayerStyle>;
    vectorOverlayStyle: VectorOverlayStyle;
  },
): CSSProperties {
  if (item.kind === 'uploaded') {
    const style = styles.uploadedLayerStyles[item.layer.id] ?? defaultUploadedLayerStyle;

    return {
      background: style.pointColor,
      borderColor: style.pointStrokeColor,
      boxShadow: `inset 0 0 0 ${Math.min(style.pointStrokeWidth, 4)}px ${style.pointStrokeColor}`,
      opacity: style.pointOpacity,
    };
  }

  if (item.kind === 'vectorOverlay') {
    return {
      background: hexToRgba(styles.vectorOverlayStyle.fillColor, styles.vectorOverlayStyle.fillOpacity),
      borderColor: styles.vectorOverlayStyle.lineColor,
      boxShadow: `inset 0 0 0 ${Math.min(styles.vectorOverlayStyle.lineWidth, 4)}px ${styles.vectorOverlayStyle.lineColor}`,
    };
  }

  if (item.kind === 'raster') {
    return { opacity: styles.rasterStyle.opacity };
  }

  return { opacity: styles.basemapStyle.opacity };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function formatStyleNumber(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

  if (!normalized) {
    return hex;
  }

  const [, red, green, blue] = normalized;

  return `rgb(${parseInt(red, 16)} ${parseInt(green, 16)} ${parseInt(blue, 16)} / ${opacity})`;
}
