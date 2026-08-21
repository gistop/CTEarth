import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Database, FolderPlus, GripVertical, Grid2X2, Layers, Map as MapIcon, PenTool, Search } from 'lucide-react';
import { useGis, type LayerOrderId, type UploadedLayer } from '../../gisStore';

type LayerListItem =
  | { id: 'basemap'; kind: 'basemap'; label: string; checked: boolean }
  | { id: `uploaded:${string}`; kind: 'uploaded'; layer: UploadedLayer; label: string; checked: boolean }
  | { id: 'raster'; kind: 'raster'; label: string; checked: boolean }
  | { id: 'vectorOverlay'; kind: 'vectorOverlay'; label: string; checked: boolean };

export function ContentsPanel() {
  return (
    <aside className="panel-shell contents-panel">
      <LayerSection />
    </aside>
  );
}

function LayerSection() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rootCheckboxRef = useRef<HTMLInputElement | null>(null);
  const [draggingId, setDraggingId] = useState<LayerOrderId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<LayerOrderId | null>(null);
  const {
    layer,
    layers,
    activeLayerId,
    raster,
    vectorOverlay,
    layerVisibility,
    uploadedLayerVisibility,
    layerOrder,
    message,
    uploadGeoJson,
    uploadShapefileZip,
    setLayerVisibility,
    setUploadedLayerVisibility,
    setAllLayerVisibility,
    moveLayerOrder,
    setActiveLayer,
  } = useGis();

  const layerItems = useMemo(
    () => buildLayerItems({
      layers,
      layerOrder,
      layerVisibility,
      uploadedLayerVisibility,
      hasRaster: Boolean(raster),
      rasterLabel: raster ? `IDW 插值 ${raster.width} x ${raster.height}` : '',
      vectorOverlayLabel: vectorOverlay?.name ?? '',
      hasVectorOverlay: Boolean(vectorOverlay),
    }),
    [layerOrder, layerVisibility, layers, raster, uploadedLayerVisibility, vectorOverlay],
  );

  const allVisible = layerItems.every((item) => item.checked);
  const someVisible = layerItems.some((item) => item.checked);

  useEffect(() => {
    if (rootCheckboxRef.current) {
      rootCheckboxRef.current.indeterminate = someVisible && !allVisible;
    }
  }, [allVisible, someVisible]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (/\.geojson$/i.test(file.name) || /\.json$/i.test(file.name)) {
      await uploadGeoJson(file);
    } else {
      await uploadShapefileZip(file);
    }

    event.target.value = '';
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
          title="添加数据"
          aria-label="添加 Shapefile ZIP 或 GeoJSON 数据"
          onClick={() => fileInputRef.current?.click()}
        >
          <FolderPlus size={18} />
        </button>
        <input
          ref={fileInputRef}
          className="hidden-file-input"
          type="file"
          accept=".zip,.geojson,.json"
          onChange={handleFileChange}
        />
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

        {layerItems.map((item) => (
          <LayerRow
            key={item.id}
            checked={item.checked}
            dragState={item.id === draggingId ? 'dragging' : item.id === dropTargetId ? 'target' : undefined}
            isSelected={item.kind === 'uploaded' && item.layer.id === (activeLayerId ?? layer?.id)}
            label={item.label}
            orderId={item.id}
            swatchClass={swatchClassForItem(item)}
            onChange={(checked) => {
              if (item.kind === 'uploaded') {
                setUploadedLayerVisibility(item.layer.id, checked);
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
            onSelect={item.kind === 'uploaded' ? () => setActiveLayer(item.layer.id) : undefined}
          />
        ))}

        {layers.length === 0 ? (
          <div className="layer-note">点击上方添加数据按钮，选择 Shapefile ZIP 或 GeoJSON。</div>
        ) : null}

        {layer ? (
          <div className="layer-note active-layer-note">
            当前图层：{layer.fileName}
          </div>
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
  label,
  orderId,
  swatchClass,
  onChange,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onDrop,
  onSelect,
}: {
  checked: boolean;
  dragState?: 'dragging' | 'target';
  isSelected?: boolean;
  label: string;
  orderId: LayerOrderId;
  swatchClass: string;
  onChange: (checked: boolean) => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onSelect?: () => void;
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
      <span className={`layer-swatch ${swatchClass}`} />
      <span>{label}</span>
    </div>
  );
}

function buildLayerItems({
  layers,
  layerOrder,
  layerVisibility,
  uploadedLayerVisibility,
  hasRaster,
  rasterLabel,
  hasVectorOverlay,
  vectorOverlayLabel,
}: {
  layers: UploadedLayer[];
  layerOrder: LayerOrderId[];
  layerVisibility: ReturnType<typeof useGis>['layerVisibility'];
  uploadedLayerVisibility: Record<string, boolean>;
  hasRaster: boolean;
  rasterLabel: string;
  hasVectorOverlay: boolean;
  vectorOverlayLabel: string;
}) {
  const uploadedById = new Map(layers.map((item) => [item.id, item]));
  const seen = new Set<LayerOrderId>();
  const normalizedOrder = [
    ...layerOrder,
    ...layers.map((item) => `uploaded:${item.id}` as const),
    'basemap' as const,
    ...(hasRaster ? ['raster' as const] : []),
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
      if (hasRaster) {
        items.push({ id, kind: 'raster', label: rasterLabel, checked: layerVisibility.raster });
      }

      continue;
    }

    if (id === 'vectorOverlay') {
      if (hasVectorOverlay) {
        items.push({ id, kind: 'vectorOverlay', label: vectorOverlayLabel, checked: layerVisibility.vectorOverlay });
      }

      continue;
    }

    const layerId = id.slice('uploaded:'.length);
    const uploadedLayer = uploadedById.get(layerId);

    if (uploadedLayer) {
      items.push({
        id,
        kind: 'uploaded',
        layer: uploadedLayer,
        label: uploadedLayer.fileName,
        checked: uploadedLayerVisibility[uploadedLayer.id] ?? true,
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
