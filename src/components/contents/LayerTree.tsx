import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Database,
  GripVertical,
  Grid2X2,
  Image,
  Layers,
  Map as MapIcon,
  MapPlus,
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
import { MapGroupSection, type MapGroup, type MapGroupLayerItem, type MapGroupLayerItemId } from './MapGroupSection';
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
  type EditableGeometryType,
  type LayerOrderId,
  type RasterLayerStyle,
  type RasterOverlay,
  type UploadedLayer,
  type UploadedLayerStyle,
  type VectorOverlayStyle,
} from '../../gisStore';

type LayerGeometryKind = 'point' | 'line' | 'polygon' | 'mixed' | 'empty';

type LayerListItem =
  | { id: 'basemap'; kind: 'basemap'; label: string; checked: boolean }
  | { id: `uploaded:${string}`; kind: 'uploaded'; layer: UploadedLayer; label: string; checked: boolean; geometryKind: LayerGeometryKind }
  | { id: `raster:${string}`; kind: 'raster'; raster: RasterOverlay; label: string; checked: boolean }
  | { id: 'vectorOverlay'; kind: 'vectorOverlay'; label: string; checked: boolean; geometryKind: LayerGeometryKind };
type MapGroupLayerRow = {
  groupItem: MapGroupLayerItem;
  item: LayerListItem;
};

type LayerBadgeIcon = React.ComponentType<{ size?: number; strokeWidth?: number }>;
type LayerBadgeStyle = CSSProperties & {
  '--layer-symbol-fill'?: string;
  '--layer-symbol-node-fill'?: string;
};
type LayerDragState = {
  groupId: string;
  index: number;
  instanceId: string;
  layerId: MapGroupLayerItemId;
};
type LayerDropTarget = {
  groupId: string;
  index: number | null;
};

const defaultMapGroupId = 'map-1';
const defaultMapGroups: MapGroup[] = [{ id: defaultMapGroupId, name: '地图', layerItems: [createMapGroupLayerItem('basemap')] }];

export function LayerTree() {
  const [draggingItem, setDraggingItem] = useState<LayerDragState | null>(null);
  const [dropTarget, setDropTarget] = useState<LayerDropTarget | null>(null);
  const [expandedStyleId, setExpandedStyleId] = useState<string | null>(null);
  const [mapGroups, setMapGroups] = useState<MapGroup[]>(defaultMapGroups);
  const [currentMapGroupId, setCurrentMapGroupId] = useState(defaultMapGroupId);
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
    setLayerDrawOrder,
    setRasterLayerVisibility,
    setUploadedLayerVisibility,
    setBasemapStyle,
    setRasterStyle,
    setVectorOverlayStyle,
    setUploadedLayerStyle,
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
      vectorOverlay,
    }),
    [layerOrder, layerVisibility, layers, rasterLayerVisibility, rasters, uploadedLayerVisibility, vectorOverlay],
  );

  const layerItemIds = useMemo(
    () => layerItems
      .map((item) => item.id)
      .filter(isMapGroupLayerItemId),
    [layerItems],
  );
  const mapGroupViews = useMemo(
    () => mapGroups.map((group) => {
      const itemById = new Map(layerItems.map((item) => [item.id, item]));
      const orderedRows: MapGroupLayerRow[] = [];

      for (const groupItem of group.layerItems) {
        const item = itemById.get(groupItem.layerId);

        if (!item) {
          continue;
        }

        orderedRows.push({
          groupItem,
          item: { ...item, checked: groupItem.visible },
        });
      }

      const rows = withDuplicateLayerLabels(orderedRows);

      return {
        group,
        rows,
        allVisible: rows.length > 0 && rows.every((row) => row.item.checked),
        someVisible: rows.some((row) => row.item.checked),
      };
    }),
    [layerItems, mapGroups],
  );
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
    setMapGroups((current) => assignUnclaimedLayerItemsToCurrentGroup(current, currentMapGroupId, layerItemIds));
  }, [currentMapGroupId, layerItemIds]);

  useEffect(() => {
    const visibleLayerIds = getVisibleMapGroupLayerIds(mapGroups);
    const shouldShowBasemap = visibleLayerIds.has('basemap');
    const shouldShowVectorOverlay = Boolean(vectorOverlay) && visibleLayerIds.has('vectorOverlay');

    if (layerVisibility.basemap !== shouldShowBasemap) {
      setLayerVisibility('basemap', shouldShowBasemap);
    }

    if (layerVisibility.vectorOverlay !== shouldShowVectorOverlay) {
      setLayerVisibility('vectorOverlay', shouldShowVectorOverlay);
    }

    layers.forEach((layer) => {
      const visible = visibleLayerIds.has(`uploaded:${layer.id}`);

      if ((uploadedLayerVisibility[layer.id] ?? true) !== visible) {
        setUploadedLayerVisibility(layer.id, visible);
      }
    });

    rasters.forEach((raster) => {
      const visible = visibleLayerIds.has(`raster:${raster.id}`);

      if ((rasterLayerVisibility[raster.id] ?? layerVisibility.raster) !== visible) {
        setRasterLayerVisibility(raster.id, visible);
      }
    });
  }, [
    layerVisibility.basemap,
    layerVisibility.raster,
    layerVisibility.vectorOverlay,
    layers,
    mapGroups,
    rasterLayerVisibility,
    rasters,
    setLayerVisibility,
    setRasterLayerVisibility,
    setUploadedLayerVisibility,
    uploadedLayerVisibility,
    vectorOverlay,
  ]);

  useEffect(() => {
    setLayerDrawOrder(mapGroups.flatMap((group) => group.layerItems.map((item) => item.layerId)));
  }, [mapGroups, setLayerDrawOrder]);

  const handleCreateBlankLayer = () => {
    const fileName = window.prompt('GeoJSON layer name', 'polygon-layer.geojson');

    if (fileName === null) {
      return;
    }

    createBlankGeoJsonLayer({ fileName, geometryType: 'Polygon' });
  };

  const handleCreateMapGroup = () => {
    const name = promptForUniqueMapGroupName(mapGroups);

    if (!name) {
      return;
    }

    const id = createMapGroupId();
    const nextGroup: MapGroup = { id, name, layerItems: [createMapGroupLayerItem('basemap')] };

    setMapGroups((current) => [...current, nextGroup]);
    setCurrentMapGroupId(id);
    setSelectedItemId(null);
    setExpandedStyleId(null);
  };

  const handleCurrentMapGroupChange = (groupId: string) => {
    if (!mapGroups.some((group) => group.id === groupId)) {
      return;
    }

    setCurrentMapGroupId(groupId);
    setSelectedItemId(null);
    setExpandedStyleId(null);
  };

  const handleLayerItemVisibilityChange = (groupId: string, groupItem: MapGroupLayerItem, visible: boolean) => {
    setMapGroupLayerItemVisibility(groupId, groupItem.instanceId, visible);
  };

  const handleMapGroupVisibilityChange = (groupId: string, visible: boolean) => {
    setMapGroups((current) => current.map((group) => (
      group.id === groupId
        ? { ...group, layerItems: group.layerItems.map((item) => ({ ...item, visible })) }
        : group
    )));
  };

  const setMapGroupLayerItemVisibility = (groupId: string, instanceId: string, visible: boolean) => {
    setMapGroups((current) => current.map((group) => (
      group.id === groupId
        ? {
          ...group,
          layerItems: group.layerItems.map((item) => (
            item.instanceId === instanceId ? { ...item, visible } : item
          )),
        }
        : group
    )));
  };

  const handleDeleteSelectedLayer = () => {
    if (!selectedUploadedLayer) {
      return;
    }

    if (!window.confirm(`删除图层 ${displayLayerName(selectedUploadedLayer.fileName)}？`)) {
      return;
    }

    deleteUploadedLayer(selectedUploadedLayer.id);
    setExpandedStyleId(null);
  };

  const handleZoomToSelectedLayer = () => {
    if (!selectedUploadedLayer || !selectedLayerBounds) {
      return;
    }

    zoomToLayer(selectedUploadedLayer.id);
  };

  const handleDrop = (target: LayerDropTarget) => {
    if (!draggingItem) {
      setDropTarget(null);
      return;
    }

    moveLayerItemBetweenGroups(draggingItem, target);
    setDraggingItem(null);
    setDropTarget(null);
  };

  const moveLayerItemBetweenGroups = (dragged: LayerDragState, target: LayerDropTarget) => {
    setMapGroups((current) => moveLayerItemInMapGroups(current, dragged, target));
    setCurrentMapGroupId(target.groupId);
    setSelectedItemId(dragged.layerId);
    setExpandedStyleId(null);
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
          title="新建地图"
          aria-label="新建地图"
          onClick={handleCreateMapGroup}
        >
          <MapPlus size={18} />
        </button>
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
        {mapGroupViews.map(({ group, rows, allVisible, someVisible }) => (
          <MapGroupSection
            key={group.id}
            allVisible={allVisible}
            group={group}
            isDropTarget={isSameDropTarget(dropTarget, { groupId: group.id, index: null })}
            isCurrent={group.id === currentMapGroupId}
            someVisible={someVisible}
            onActivate={() => handleCurrentMapGroupChange(group.id)}
            onDragEnter={() => {
              if (draggingItem) {
                setDropTarget({ groupId: group.id, index: null });
              }
            }}
            onDrop={() => handleDrop({ groupId: group.id, index: null })}
            onVisibilityChange={(visible) => handleMapGroupVisibilityChange(group.id, visible)}
          >
            {rows.map(({ groupItem, item }, itemIndex) => {
              const layerInstanceKey = `${group.id}:${groupItem.instanceId}`;
              const isStyleOpen = layerInstanceKey === expandedStyleId && group.id === currentMapGroupId;
              const isDragging = isSameLayerDragState(draggingItem, { groupId: group.id, index: itemIndex });
              const isDropTarget = isSameDropTarget(dropTarget, { groupId: group.id, index: itemIndex });

              return (
            <div className="layer-item-block" key={layerInstanceKey}>
              <LayerRow
                badge={renderLayerBadge(item, {
                  basemapStyle,
                  rasterStyle,
                  uploadedLayerStyles,
                  vectorOverlayStyle,
                })}
                checked={item.checked}
                dragState={isDragging ? 'dragging' : isDropTarget ? 'target' : undefined}
                isSelected={selectedItemId === item.id}
                isStyleOpen={isStyleOpen}
                label={item.label}
                orderId={item.id}
                onChange={(checked) => handleLayerItemVisibilityChange(group.id, groupItem, checked)}
                onDragEnd={() => {
                  setDraggingItem(null);
                  setDropTarget(null);
                }}
                onDragEnter={() => {
                  if (draggingItem && !isDragging) {
                    setDropTarget({ groupId: group.id, index: itemIndex });
                  }
                }}
                onDragStart={() => setDraggingItem({ groupId: group.id, index: itemIndex, instanceId: groupItem.instanceId, layerId: groupItem.layerId })}
                onDrop={() => handleDrop({ groupId: group.id, index: itemIndex })}
                onSelect={item.kind === 'uploaded'
                  ? () => {
                    handleCurrentMapGroupChange(group.id);
                    setSelectedItemId(item.id);
                    setActiveLayer(item.layer.id);
                  }
                  : item.kind === 'raster'
                    ? () => {
                      handleCurrentMapGroupChange(group.id);
                      setSelectedItemId(item.id);
                      setActiveRaster(item.raster.id);
                    }
                    : item.kind === 'vectorOverlay'
                      ? () => {
                        handleCurrentMapGroupChange(group.id);
                        setSelectedItemId(item.id);
                      }
                      : undefined}
                onToggleStyle={() => {
                  handleCurrentMapGroupChange(group.id);
                  setExpandedStyleId((current) => (current === layerInstanceKey ? null : layerInstanceKey));
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
          </MapGroupSection>
        ))}

        {layers.length === 0 && rasters.length === 0 ? (
          <div className="layer-note">点击上方添加数据按钮，选择 Shapefile ZIP 或 GeoJSON。</div>
        ) : null}
        <div className="layer-note status">{message}</div>
      </section>
    </section>
  );
}

function LayerRow({
  badge,
  checked,
  dragState,
  isSelected,
  isStyleOpen,
  label,
  orderId,
  onChange,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onDrop,
  onSelect,
  onToggleStyle,
}: {
  badge: ReactNode;
  checked: boolean;
  dragState?: 'dragging' | 'target';
  isSelected?: boolean;
  isStyleOpen?: boolean;
  label: string;
  orderId: LayerOrderId;
  onChange: (checked: boolean) => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragStart?: () => void;
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
  const isDraggable = Boolean(onDragStart);

  return (
    <div
      className={className}
      draggable={isDraggable}
      onClick={onSelect}
      onDragEnd={onDragEnd}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        if (!onDragStart) {
          event.preventDefault();
          return;
        }

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
      {badge}
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

function renderLayerBadge(
  item: LayerListItem,
  styles: {
    basemapStyle: BasemapLayerStyle;
    rasterStyle: RasterLayerStyle;
    uploadedLayerStyles: Record<string, UploadedLayerStyle>;
    vectorOverlayStyle: VectorOverlayStyle;
  },
) {
  const meta = layerBadgeMetaForItem(item, styles);
  const Icon = meta.icon;

  return (
    <span
      className={`layer-swatch ${meta.className}`}
      style={meta.style}
      title={meta.title}
      aria-hidden="true"
    >
      <Icon size={12} strokeWidth={2} />
    </span>
  );
}

function PointLayerBadgeIcon({ size = 16, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.25" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth + 0.5} />
    </svg>
  );
}

function LineLayerBadgeIcon({ size = 16, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polyline points="5 17 9 7 15 10 19 18" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5" cy="17" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="9" cy="7" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="15" cy="10" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="19" cy="18" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

function PolygonLayerBadgeIcon({ size = 16, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon
        points="5 17 8 6 16 7 20 18"
        fill="var(--layer-symbol-fill, rgb(48 111 172 / 12%))"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle cx="5" cy="17" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="8" cy="6" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="16" cy="7" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="20" cy="18" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

function layerBadgeMetaForItem(
  item: LayerListItem,
  styles: {
    basemapStyle: BasemapLayerStyle;
    rasterStyle: RasterLayerStyle;
    uploadedLayerStyles: Record<string, UploadedLayerStyle>;
    vectorOverlayStyle: VectorOverlayStyle;
  },
): { className: string; style: LayerBadgeStyle; icon: LayerBadgeIcon; title: string } {
  if (item.kind === 'basemap') {
    return {
      className: 'basemap',
      style: {
        background:
          'linear-gradient(135deg, rgb(22 119 184 / 0%) 45%, rgb(22 119 184 / 45%) 45% 55%, rgb(22 119 184 / 0%) 55%), linear-gradient(#dbe9d4 0 44%, #c9dfec 44% 100%)',
        color: '#0f5d8e',
        opacity: styles.basemapStyle.opacity,
      },
      icon: MapIcon,
      title: '底图',
    };
  }

  if (item.kind === 'raster') {
    return {
      className: 'raster',
      style: {
        background: 'linear-gradient(#d64c36, #f8e058, #22a884, #2962a8)',
        color: '#244b7a',
        opacity: styles.rasterStyle.opacity,
      },
      icon: Image,
      title: '栅格',
    };
  }

  if (item.kind === 'vectorOverlay') {
    return layerBadgeMetaForGeometryKind(item.geometryKind, styles.vectorOverlayStyle);
  }

  return layerBadgeMetaForGeometryKind(item.geometryKind, styles.uploadedLayerStyles[item.layer.id] ?? defaultUploadedLayerStyle);
}

function layerBadgeMetaForGeometryKind(
  geometryKind: LayerGeometryKind,
  style: UploadedLayerStyle | VectorOverlayStyle,
): { className: string; style: LayerBadgeStyle; icon: LayerBadgeIcon; title: string } {
  if (geometryKind === 'point') {
    const pointStrokeColor = 'pointStrokeColor' in style ? style.pointStrokeColor : style.lineColor;
    const pointOpacity = 'pointOpacity' in style ? style.pointOpacity : 1;

    return {
      className: 'point',
      style: {
        background: 'transparent',
        borderColor: 'transparent',
        color: pointStrokeColor,
        opacity: pointOpacity,
      },
      icon: PointLayerBadgeIcon,
      title: '点图层',
    };
  }

  if (geometryKind === 'line') {
    const lineColor = style.lineColor;
    const lineOpacity = 'lineOpacity' in style ? style.lineOpacity : 1;

    return {
      className: 'line',
      style: {
        background: 'transparent',
        borderColor: 'transparent',
        color: lineColor,
        opacity: lineOpacity,
      },
      icon: LineLayerBadgeIcon,
      title: '线图层',
    };
  }

  if (geometryKind === 'polygon') {
    const lineColor = style.lineColor;
    const fillColor = style.fillColor;
    const fillOpacity = 'fillOpacity' in style ? style.fillOpacity : 1;

    return {
      className: 'polygon',
      style: {
        background: 'transparent',
        borderColor: 'transparent',
        color: lineColor,
        '--layer-symbol-fill': hexToRgba(fillColor, Math.min(fillOpacity, 0.28)),
      },
      icon: PolygonLayerBadgeIcon,
      title: '面图层',
    };
  }

  if (geometryKind === 'mixed') {
    return {
      className: 'mixed',
      style: {
        background: '#eef3f7',
        borderColor: '#8da1b4',
        color: '#607486',
      },
      icon: Layers,
      title: '混合几何图层',
    };
  }

  return {
    className: 'empty',
    style: {
      background: '#f2f5f8',
      borderColor: '#b0becb',
      color: '#7f8b97',
    },
    icon: Layers,
    title: '空图层',
  };
}

function promptForUniqueMapGroupName(groups: MapGroup[]) {
  const defaultName = nextMapGroupName(groups);

  while (true) {
    const value = window.prompt('地图名称', defaultName);

    if (value === null) {
      return null;
    }

    const name = value.trim();

    if (!name) {
      window.alert('地图名称不能为空。');
      continue;
    }

    if (isDuplicateMapGroupName(groups, name)) {
      window.alert('地图名称不能重复。');
      continue;
    }

    return name;
  }
}

function nextMapGroupName(groups: MapGroup[]) {
  const names = new Set(groups.map((group) => normalizeMapGroupName(group.name)));
  let index = groups.length + 1;

  while (names.has(normalizeMapGroupName(`地图 ${index}`))) {
    index += 1;
  }

  return `地图 ${index}`;
}

function isDuplicateMapGroupName(groups: MapGroup[], name: string) {
  const normalized = normalizeMapGroupName(name);

  return groups.some((group) => normalizeMapGroupName(group.name) === normalized);
}

function normalizeMapGroupName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function createMapGroupId() {
  return `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createMapGroupLayerItem(layerId: MapGroupLayerItemId): MapGroupLayerItem {
  return {
    instanceId: `map-layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    layerId,
    visible: true,
  };
}

function isSameLayerDragState(left: LayerDragState | null, right: { groupId: string; index: number }) {
  return Boolean(left && left.groupId === right.groupId && left.index === right.index);
}

function isSameDropTarget(left: LayerDropTarget | null, right: LayerDropTarget) {
  return Boolean(left && left.groupId === right.groupId && left.index === right.index);
}

function moveLayerItemInMapGroups(groups: MapGroup[], dragged: LayerDragState, target: LayerDropTarget) {
  if (isSameDropTarget(dragged, target)) {
    return groups;
  }

  const sourceGroup = groups.find((group) => group.id === dragged.groupId);
  const draggedItem = sourceGroup?.layerItems[dragged.index];

  if (!draggedItem || draggedItem.instanceId !== dragged.instanceId) {
    return groups;
  }

  let insertIndex = target.index ?? Number.POSITIVE_INFINITY;

  return groups.map((group) => {
    const layerItems = [...group.layerItems];

    if (group.id === dragged.groupId) {
      layerItems.splice(dragged.index, 1);

      if (group.id === target.groupId && Number.isFinite(insertIndex) && dragged.index < insertIndex) {
        insertIndex -= 1;
      }
    }

    if (group.id !== target.groupId) {
      return layerItems.length === group.layerItems.length ? group : { ...group, layerItems };
    }

    const boundedInsertIndex = Math.min(Math.max(insertIndex, 0), layerItems.length);
    layerItems.splice(boundedInsertIndex, 0, draggedItem);

    return { ...group, layerItems };
  });
}

function withDuplicateLayerLabels(rows: MapGroupLayerRow[]) {
  const totals = new Map<string, number>();
  const occurrences = new Map<string, number>();

  rows.forEach(({ item }) => {
    const key = normalizeLayerLabel(item.label);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  });

  return rows.map((row) => {
    const { item } = row;
    const key = normalizeLayerLabel(item.label);
    const total = totals.get(key) ?? 0;

    if (total < 2) {
      return row;
    }

    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);

    return {
      ...row,
      item: { ...item, label: `${item.label} (${occurrence})` },
    };
  });
}

function normalizeLayerLabel(label: string) {
  return label.trim().toLocaleLowerCase();
}

function isMapGroupLayerItemId(id: LayerOrderId | LayerListItem['id']): id is MapGroupLayerItemId {
  return id !== 'raster';
}

function getVisibleMapGroupLayerIds(groups: MapGroup[]) {
  const visibleIds = new Set<MapGroupLayerItemId>();

  groups.forEach((group) => {
    group.layerItems.forEach((item) => {
      if (item.visible) {
        visibleIds.add(item.layerId);
      }
    });
  });

  return visibleIds;
}

function assignUnclaimedLayerItemsToCurrentGroup(groups: MapGroup[], currentGroupId: string, layerItemIds: MapGroupLayerItemId[]) {
  const availableIds = new Set(layerItemIds);
  let changed = false;

  const normalizedGroups = groups.map((group) => {
    const groupItems = group.layerItems.filter((item) => availableIds.has(item.layerId));

    if (groupItems.length !== group.layerItems.length || groupItems.some((item, index) => item !== group.layerItems[index])) {
      changed = true;
      return { ...group, layerItems: groupItems };
    }

    return group;
  });

  const claimedIds = new Set(normalizedGroups.flatMap((group) => group.layerItems.map((item) => item.layerId)));
  const unclaimedIds = layerItemIds.filter((id) => !claimedIds.has(id));

  if (unclaimedIds.length === 0) {
    return changed ? normalizedGroups : groups;
  }

  changed = true;

  return normalizedGroups.map((group) => (
    group.id === currentGroupId
      ? { ...group, layerItems: [...unclaimedIds.map(createMapGroupLayerItem), ...group.layerItems] }
      : group
  ));
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
  vectorOverlay,
}: {
  layers: UploadedLayer[];
  layerOrder: LayerOrderId[];
  layerVisibility: ReturnType<typeof useGis>['layerVisibility'];
  rasterLayerVisibility: Record<string, boolean>;
  rasters: RasterOverlay[];
  uploadedLayerVisibility: Record<string, boolean>;
  hasVectorOverlay: boolean;
  vectorOverlayLabel: string;
  vectorOverlay: { geojson: { features: unknown[] } } | null;
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
        items.push({
          id,
          kind: 'vectorOverlay',
          label: vectorOverlayLabel,
          checked: layerVisibility.vectorOverlay,
          geometryKind: getLayerGeometryKindFromFeatures(vectorOverlay?.geojson.features ?? []),
        });
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
        geometryKind: getLayerGeometryKind(uploadedLayer),
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

function getLayerGeometryKind(layer: UploadedLayer) {
  const fromFeatures = getLayerGeometryKindFromFeatures(layer.geojson.features);

  if (fromFeatures !== 'empty') {
    return fromFeatures;
  }

  return editableGeometryTypeToLayerGeometryKind(layer.geometryType);
}

function getLayerGeometryKindFromFeatures(features: unknown[]) {
  const kinds = new Set<Exclude<LayerGeometryKind, 'mixed' | 'empty'>>();

  for (const feature of features) {
    if (!isRecord(feature) || !isRecord(feature.geometry)) {
      continue;
    }

    const kind = geometryTypeToLayerGeometryKind(typeof feature.geometry.type === 'string' ? feature.geometry.type : undefined);

    if (kind) {
      kinds.add(kind);
    }
  }

  if (kinds.size === 0) {
    return 'empty';
  }

  if (kinds.size > 1) {
    return 'mixed';
  }

  return [...kinds][0];
}

function geometryTypeToLayerGeometryKind(type: string | undefined): Exclude<LayerGeometryKind, 'mixed' | 'empty'> | null {
  if (type === 'Point' || type === 'MultiPoint') {
    return 'point';
  }

  if (type === 'LineString' || type === 'MultiLineString') {
    return 'line';
  }

  if (type === 'Polygon' || type === 'MultiPolygon') {
    return 'polygon';
  }

  return null;
}

function editableGeometryTypeToLayerGeometryKind(type: EditableGeometryType | undefined): LayerGeometryKind {
  if (!type) {
    return 'empty';
  }

  return geometryTypeToLayerGeometryKind(type) ?? 'empty';
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
