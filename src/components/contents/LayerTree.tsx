import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Database,
  GripVertical,
  Grid2X2,
  Image,
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
import { InlineRenameLabel } from './InlineRenameLabel';
import { MapGroupEditPanel } from './MapGroupEditPanel';
import { MapGroupSplitButton } from './MapGroupSplitButton';
import { MapGroupSection, type MapGroup, type MapGroupLayerItem, type MapGroupLayerItemId } from './MapGroupSection';
import { SaveAsSplitButton } from './SaveAsSplitButton';
import { useMapCommands } from '../map/MapCommandContext';
import { useMapBasemapSelection } from '../map/MapBasemapSelectionContext';
import { defaultBasemapId, getBasemapLabel, type BasemapId } from '../map/basemapOptions';
import {
  deleteMapGroupDraft,
  readMapGroupDraft,
  writeMapGroupDraft,
} from '../../mapGroupDraftStore';
import {
  defaultBasemapStyle,
  defaultRasterStyle,
  defaultUploadedLayerStyle,
  defaultVectorOverlayStyle,
  displayLayerName,
  getGeoJsonBounds,
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
  | { id: string; kind: 'basemap'; label: string; checked: boolean; basemapId: BasemapId }
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
type EditTarget =
  | { kind: 'group'; groupId: string }
  | { kind: 'layer'; groupId: string; layerInstanceKey: string; itemId: string; layerKind: Exclude<LayerListItem['kind'], 'basemap'> };

const defaultMapGroupId = 'map-1';
const defaultMapGroups: MapGroup[] = [{
  id: defaultMapGroupId,
  name: '地图',
  displayVisible: true,
  layerItems: [createMapGroupLayerItem('basemap', defaultBasemapId)],
}];

export function LayerTree() {
  const [draggingItem, setDraggingItem] = useState<LayerDragState | null>(null);
  const [dropTarget, setDropTarget] = useState<LayerDropTarget | null>(null);
  const [expandedEditTarget, setExpandedEditTarget] = useState<EditTarget | null>(null);
  const [mapGroups, setMapGroups] = useState<MapGroup[]>(defaultMapGroups);
  const [currentMapGroupId, setCurrentMapGroupId] = useState(defaultMapGroupId);
  const [collapsedMapGroupIds, setCollapsedMapGroupIds] = useState<Set<string>>(() => new Set());
  const [mapGroupDraftLoaded, setMapGroupDraftLoaded] = useState(false);
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
    renameUploadedLayer,
    renameRasterLayer,
    renameVectorOverlay,
    setActiveLayer,
    setActiveRaster,
    workspaceDraftLoaded,
    zoomToLayer,
    zoomToRaster,
  } = useGis();
  const { mapCommandState, setBasemap } = useMapCommands();
  const { registerBasemapChangeHandler } = useMapBasemapSelection();
  const { openAttributeTable } = useAttributeTable();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const renameTarget = expandedEditTarget;
  const renameValue = editValue;
  const setRenameValue = setEditValue;
  const setRenameTarget = setExpandedEditTarget;

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
        const item = groupItem.layerId === 'basemap'
          ? {
            id: `${group.id}:${groupItem.instanceId}`,
            kind: 'basemap' as const,
            label: `底图 · ${getBasemapLabel(groupItem.basemapId ?? defaultBasemapId)}`,
            checked: groupItem.visible,
            basemapId: groupItem.basemapId ?? defaultBasemapId,
          }
          : itemById.get(groupItem.layerId);

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
    if (!workspaceDraftLoaded || !mapGroupDraftLoaded) {
      return;
    }

    setMapGroups((current) => assignUnclaimedLayerItemsToCurrentGroup(current, currentMapGroupId, layerItemIds));
  }, [currentMapGroupId, layerItemIds, mapGroupDraftLoaded, workspaceDraftLoaded]);

  useEffect(() => {
    return registerBasemapChangeHandler((basemapId) => {
      const targetBasemapItem = getTargetBasemapItem(mapGroups, currentMapGroupId, selectedItemId);

      if (!targetBasemapItem) {
        setBasemap(basemapId);
        return;
      }

      setBasemap(basemapId);
      setMapGroups((current) => current.map((group) => (
        group.id === targetBasemapItem.groupId
          ? {
            ...group,
            layerItems: group.layerItems.map((item) => (
              item.instanceId === targetBasemapItem.instanceId
                ? { ...item, basemapId }
                : item
            )),
          }
          : group
      )));
      setSelectedItemId(targetBasemapItem.selectionId);
    });
  }, [currentMapGroupId, mapGroups, registerBasemapChangeHandler, selectedItemId, setBasemap]);

  useEffect(() => {
    if (!workspaceDraftLoaded || !mapGroupDraftLoaded) {
      return;
    }

    const activeBasemapItem = getActiveBasemapItem(mapGroups);

    if (!activeBasemapItem) {
      if (layerVisibility.basemap) {
        setLayerVisibility('basemap', false);
      }
      return;
    }

    if (!layerVisibility.basemap) {
      setLayerVisibility('basemap', true);
    }

    if (activeBasemapItem.basemapId !== mapCommandState.basemap) {
      setBasemap(activeBasemapItem.basemapId);
    }
  }, [layerVisibility.basemap, mapCommandState.basemap, mapGroupDraftLoaded, mapGroups, setBasemap, setLayerVisibility, workspaceDraftLoaded]);

  useEffect(() => {
    if (!workspaceDraftLoaded) {
      return undefined;
    }

    let active = true;

    readMapGroupDraft()
      .then((draft) => {
        if (!active) {
          return;
        }

        if (draft) {
          const nextMapGroups = draft.mapGroups.length > 0
            ? normalizeMapGroups(draft.mapGroups as MapGroup[])
            : defaultMapGroups;
          const nextGroupIds = new Set(nextMapGroups.map((group) => group.id));

          setMapGroups(nextMapGroups);
          setCurrentMapGroupId(
            nextGroupIds.has(draft.currentMapGroupId)
              ? draft.currentMapGroupId
              : nextMapGroups[0]?.id ?? defaultMapGroupId,
          );
          setCollapsedMapGroupIds(new Set(draft.collapsedMapGroupIds.filter((id) => nextGroupIds.has(id))));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          console.warn(error);
        }
      })
      .finally(() => {
        if (active) {
          setMapGroupDraftLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [workspaceDraftLoaded]);

  useEffect(() => {
    if (!workspaceDraftLoaded || !mapGroupDraftLoaded) {
      return;
    }

    const shouldShowBasemap = Boolean(getActiveBasemapItem(mapGroups));
    const visibleLayerIds = getVisibleMapGroupLayerIds(mapGroups);
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
    mapGroupDraftLoaded,
    mapGroups,
    rasterLayerVisibility,
    rasters,
    setLayerVisibility,
    setRasterLayerVisibility,
    setUploadedLayerVisibility,
    uploadedLayerVisibility,
    vectorOverlay,
    workspaceDraftLoaded,
  ]);

  useEffect(() => {
    if (!workspaceDraftLoaded || !mapGroupDraftLoaded) {
      return undefined;
    }

    setLayerDrawOrder(getMapGroupLayerDrawOrder(mapGroups));
  }, [mapGroupDraftLoaded, mapGroups, setLayerDrawOrder, workspaceDraftLoaded]);

  useEffect(() => {
    if (!workspaceDraftLoaded || !mapGroupDraftLoaded) {
      return undefined;
    }

    const handle = window.setTimeout(() => {
      if (mapGroups.length === 0) {
        void deleteMapGroupDraft();
        return;
      }

      void writeMapGroupDraft({
        version: 1,
        savedAt: new Date().toISOString(),
        currentMapGroupId,
        mapGroups,
        collapsedMapGroupIds: [...collapsedMapGroupIds],
      });
    }, 500);

    return () => window.clearTimeout(handle);
  }, [collapsedMapGroupIds, currentMapGroupId, mapGroupDraftLoaded, mapGroups, workspaceDraftLoaded]);

  const getLayerEditValue = (item: LayerListItem) => {
    if (item.kind === 'uploaded') {
      return displayLayerName(item.layer.fileName);
    }

    if (item.kind === 'raster') {
      return displayLayerName(item.raster.name);
    }

    if (item.kind === 'vectorOverlay') {
      return displayLayerName(vectorOverlay?.name ?? '');
    }

    return item.label;
  };

  const cancelRename = () => {
    setRenameTarget(null);
    setRenameValue('');
  };

  const commitRename = () => {
    if (!renameTarget) {
      return true;
    }

    if (renameTarget.kind === 'group') {
      const nextName = renameValue.trim();
      const targetGroup = mapGroups.find((group) => group.id === renameTarget.groupId);

      if (!targetGroup) {
        cancelRename();
        return true;
      }

      if (!nextName) {
        window.alert('地图名称不能为空。');
        return false;
      }

      if (
        mapGroups.some((group) => group.id !== targetGroup.id && normalizeMapGroupName(group.name) === normalizeMapGroupName(nextName))
      ) {
        window.alert('地图名称不能重复。');
        return false;
      }

      if (normalizeMapGroupName(targetGroup.name) !== normalizeMapGroupName(nextName)) {
        setMapGroups((current) => current.map((group) => (
          group.id === targetGroup.id
            ? { ...group, name: nextName }
            : group
        )));
      }

      setEditValue(nextName);
      return true;
    }

    const targetItem = layerItems.find((item) => item.id === renameTarget.itemId);

    if (!targetItem) {
      cancelRename();
      return true;
    }

    const nextName = renameValue.trim();

    if (!nextName) {
      window.alert('图层名称不能为空。');
      return false;
    }

    if (targetItem.kind === 'uploaded') {
      if (displayLayerName(targetItem.layer.fileName) !== nextName) {
        renameUploadedLayer(targetItem.layer.id, nextName);
      }
    } else if (targetItem.kind === 'raster') {
      if (displayLayerName(targetItem.raster.name) !== nextName) {
        renameRasterLayer(targetItem.raster.id, nextName);
      }
    } else if (targetItem.kind === 'vectorOverlay' && vectorOverlay) {
      if (displayLayerName(vectorOverlay.name) !== nextName) {
        renameVectorOverlay(nextName);
      }
    }

    setEditValue(nextName);
    return true;
  };

  const closeEditPanel = () => {
    setExpandedEditTarget(null);
    setEditValue('');
  };

  const openGroupEdit = (group: MapGroup) => {
    if (expandedEditTarget?.kind === 'group' && expandedEditTarget.groupId === group.id) {
      closeEditPanel();
      return;
    }

    setExpandedEditTarget({ kind: 'group', groupId: group.id });
    setEditValue(group.name);
  };

  const openLayerEdit = (groupId: string, layerInstanceKey: string, item: LayerListItem) => {
    if (expandedEditTarget?.kind === 'layer' && expandedEditTarget.layerInstanceKey === layerInstanceKey) {
      closeEditPanel();
      return;
    }

    if (item.kind === 'uploaded') {
      setSelectedItemId(item.id);
      setActiveLayer(item.layer.id);
    } else if (item.kind === 'raster') {
      setSelectedItemId(item.id);
      setActiveRaster(item.raster.id);
    } else if (item.kind === 'vectorOverlay') {
      setSelectedItemId(item.id);
    }

    setExpandedEditTarget({
      kind: 'layer',
      groupId,
      layerInstanceKey,
      itemId: item.id,
      layerKind: item.kind as Exclude<LayerListItem['kind'], 'basemap'>,
    });
    setEditValue(getLayerEditValue(item));
  };

  const commitEditPanel = () => commitRename();

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
    const nextGroup: MapGroup = {
      id,
      name,
      displayVisible: true,
      layerItems: [createMapGroupLayerItem('basemap', mapCommandState.basemap)],
    };

    setMapGroups((current) => [...current, nextGroup]);
    setSelectedItemId(null);
    closeEditPanel();
  };

  const handleAddBasemapToCurrentMapGroup = () => {
    setMapGroups((current) => addBasemapLayerItemToCurrentGroup(current, currentMapGroupId, mapCommandState.basemap));
    closeEditPanel();
  };

  const handleSetCurrentMapGroup = (groupId: string) => {
    if (!mapGroups.some((group) => group.id === groupId)) {
      return;
    }

    if (groupId === currentMapGroupId) {
      return;
    }

    setCurrentMapGroupId(groupId);
    setSelectedItemId(null);
    closeEditPanel();
  };

  const handleToggleMapGroupExpanded = (groupId: string) => {
    setCollapsedMapGroupIds((current) => {
      const next = new Set(current);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
    closeEditPanel();
  };

  const handleLayerItemVisibilityChange = (groupId: string, groupItem: MapGroupLayerItem, visible: boolean) => {
    setMapGroupLayerItemVisibility(groupId, groupItem, visible);
  };

  const handleMapGroupVisibilityChange = (groupId: string, visible: boolean) => {
    setMapGroups((current) => current.map((group) => (
      group.id === groupId
        ? { ...group, layerItems: group.layerItems.map((item) => ({ ...item, visible })) }
        : group
    )));
  };

  const handleMapGroupDisplayVisibilityChange = (groupId: string, visible: boolean) => {
    setMapGroups((current) => current.map((group) => (
      group.id === groupId
        ? { ...group, displayVisible: visible }
        : group
    )));
  };

  const setMapGroupLayerItemVisibility = (groupId: string, groupItem: MapGroupLayerItem, visible: boolean) => {
    setMapGroups((current) => current.map((group) => (
      group.id === groupId
        ? {
          ...group,
          layerItems: group.layerItems.map((item) => {
            if (item.instanceId === groupItem.instanceId) {
              return { ...item, visible };
            }

            if (visible && groupItem.layerId === 'basemap' && item.layerId === 'basemap') {
              return { ...item, visible: false };
            }

            return item;
          }),
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
    closeEditPanel();
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
    setSelectedItemId(dragged.layerId);
    closeEditPanel();
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
        <MapGroupSplitButton
          onCreateMapGroup={handleCreateMapGroup}
          onAddBasemapToCurrentMapGroup={handleAddBasemapToCurrentMapGroup}
        />
        <button
          type="button"
          title="删除选中图层"
          aria-label="删除选中图层"
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
        {mapGroupViews.map(({ group, rows, allVisible, someVisible }) => (
          <MapGroupSection
            key={group.id}
            allVisible={allVisible}
            panel={
              expandedEditTarget?.kind === 'group' && expandedEditTarget.groupId === group.id ? (
                <MapGroupEditPanel
                  group={group}
                  onClose={closeEditPanel}
                />
              ) : null
            }
            group={group}
            isExpanded={!collapsedMapGroupIds.has(group.id)}
            isDropTarget={isSameDropTarget(dropTarget, { groupId: group.id, index: null })}
            isCurrent={group.id === currentMapGroupId}
            isEditOpen={expandedEditTarget?.kind === 'group' && expandedEditTarget.groupId === group.id}
            onDisplayVisibilityChange={(visible) => handleMapGroupDisplayVisibilityChange(group.id, visible)}
            nameNode={
              <InlineRenameLabel
                value={expandedEditTarget?.kind === 'group' && expandedEditTarget.groupId === group.id ? editValue : group.name}
                canEdit={false}
                isEditing={expandedEditTarget?.kind === 'group' && expandedEditTarget.groupId === group.id}
                onStartEdit={() => undefined}
                onChange={setEditValue}
                onCommit={commitEditPanel}
                onCancel={closeEditPanel}
              />
            }
            someVisible={someVisible}
            onDragEnter={() => {
              if (draggingItem) {
                setDropTarget({ groupId: group.id, index: null });
              }
            }}
            onEdit={() => openGroupEdit(group)}
            onDrop={() => handleDrop({ groupId: group.id, index: null })}
            onSetCurrent={() => handleSetCurrentMapGroup(group.id)}
            onToggleExpanded={() => handleToggleMapGroupExpanded(group.id)}
            onVisibilityChange={(visible) => handleMapGroupVisibilityChange(group.id, visible)}
          >
            {rows.map(({ groupItem, item }, itemIndex) => {
              const layerInstanceKey = `${group.id}:${groupItem.instanceId}`;
              const selectedRowId = item.kind === 'basemap' ? layerInstanceKey : item.id;
              const isEditOpen = expandedEditTarget?.kind === 'layer' && expandedEditTarget.layerInstanceKey === layerInstanceKey;
              const isDragging = isSameLayerDragState(draggingItem, { groupId: group.id, index: itemIndex });
              const isDropTarget = isSameDropTarget(dropTarget, { groupId: group.id, index: itemIndex });
              const layerLabel = item.kind === 'basemap'
                ? `底图 · ${getBasemapLabel(item.basemapId)}`
                : item.label;

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
                isSelected={selectedItemId === selectedRowId}
                isEditOpen={isEditOpen}
                label={layerLabel}
                nameNode={item.kind !== 'basemap' && isEditOpen ? (
                  <InlineRenameLabel
                    value={editValue}
                    canEdit={false}
                    isEditing
                    onStartEdit={() => undefined}
                    onChange={setEditValue}
                    onCommit={commitEditPanel}
                    onCancel={closeEditPanel}
                  />
                ) : (
                  <span className="tree-row-label">{item.label}</span>
                )}
                orderId={item.kind === 'basemap' ? 'basemap' : item.id}
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
                onDoubleClick={item.kind === 'uploaded'
                  ? () => {
                    setSelectedItemId(item.id);
                    setActiveLayer(item.layer.id);
                    zoomToLayer(item.layer.id);
                  }
                  : item.kind === 'raster'
                    ? () => {
                      setSelectedItemId(item.id);
                      setActiveRaster(item.raster.id);
                      zoomToRaster(item.raster.id);
                    }
                    : undefined}
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
                      ? () => {
                        setSelectedItemId(item.id);
                      }
                : item.kind === 'basemap'
                        ? () => setSelectedItemId(selectedRowId)
                        : undefined}
                onEdit={() => openLayerEdit(group.id, layerInstanceKey, item)}
              />
              {isEditOpen ? (
                <LayerStylePanel
                  item={item}
                  basemapStyle={basemapStyle}
                  rasterStyle={rasterStyle}
                  uploadedLayerStyles={uploadedLayerStyles}
                  vectorOverlayStyle={vectorOverlayStyle}
                  onClose={closeEditPanel}
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
  isEditOpen,
  label,
  nameNode,
  orderId,
  onChange,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onDrop,
  onDoubleClick,
  onEdit,
  onSelect,
}: {
  badge: ReactNode;
  checked: boolean;
  dragState?: 'dragging' | 'target';
  isSelected?: boolean;
  isEditOpen?: boolean;
  label: string;
  nameNode: ReactNode;
  orderId: LayerOrderId;
  onChange: (checked: boolean) => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragStart?: () => void;
  onDrop: () => void;
  onDoubleClick?: () => void;
  onEdit: () => void;
  onSelect?: () => void;
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
      onDoubleClick={onDoubleClick}
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
      {nameNode}
      <div className="tree-row-actions">
        <div className="tree-row-action-spacer" aria-hidden="true" />
        <button
          className={isEditOpen ? 'layer-style-toggle is-open' : 'layer-style-toggle'}
          type="button"
          title="编辑"
          aria-label={`编辑 ${label}`}
          aria-expanded={isEditOpen}
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Settings size={15} strokeWidth={1.8} />
        </button>
      </div>
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

function createMapGroupLayerItem(layerId: MapGroupLayerItemId, basemapId = defaultBasemapId): MapGroupLayerItem {
  return {
    instanceId: `map-layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    layerId,
    visible: true,
    basemapId: layerId === 'basemap' ? basemapId : undefined,
  };
}

function addBasemapLayerItemToCurrentGroup(groups: MapGroup[], currentGroupId: string, basemapId: BasemapId) {
  const nextBasemapItem = createMapGroupLayerItem('basemap', basemapId);

  return groups.map((group) => {
    if (group.id !== currentGroupId) {
      return group;
    }

    const firstBasemapIndex = group.layerItems.findIndex((item) => item.layerId === 'basemap');

    if (firstBasemapIndex < 0) {
      return { ...group, layerItems: [...group.layerItems, nextBasemapItem] };
    }

    const nextLayerItems = [...group.layerItems];
    nextLayerItems.splice(firstBasemapIndex, 0, nextBasemapItem);

    return { ...group, layerItems: nextLayerItems };
  });
}

function findSelectedBasemapItem(groups: MapGroup[], selectedItemId: string) {
  for (const group of groups) {
    for (const item of group.layerItems) {
      if (`${group.id}:${item.instanceId}` === selectedItemId && item.layerId === 'basemap') {
        return {
          groupId: group.id,
          instanceId: item.instanceId,
          basemapId: item.basemapId ?? defaultBasemapId,
          selectionId: `${group.id}:${item.instanceId}`,
        };
      }
    }
  }

  return null;
}

function getTargetBasemapItem(groups: MapGroup[], currentMapGroupId: string, selectedItemId: string | null) {
  if (selectedItemId) {
    const selectedBasemapItem = findSelectedBasemapItem(groups, selectedItemId);

    if (selectedBasemapItem) {
      return selectedBasemapItem;
    }
  }

  const currentGroup = groups.find((group) => group.id === currentMapGroupId);
  const currentBasemapItem = currentGroup?.layerItems.find((item) => item.layerId === 'basemap');

  if (!currentGroup || !currentBasemapItem) {
    return null;
  }

  return {
    groupId: currentGroup.id,
    instanceId: currentBasemapItem.instanceId,
    basemapId: currentBasemapItem.basemapId ?? defaultBasemapId,
    selectionId: `${currentGroup.id}:${currentBasemapItem.instanceId}`,
  };
}

function getActiveBasemapItem(groups: MapGroup[]): { groupId: string; instanceId: string; basemapId: BasemapId; selectionId: string } | null {
  let activeBasemapItem: { groupId: string; instanceId: string; basemapId: BasemapId; selectionId: string } | null = null;

  groups.forEach((group) => {
    if (group.displayVisible === false) {
      return;
    }

    group.layerItems.forEach((item) => {
      if (item.layerId !== 'basemap' || !item.visible) {
        return;
      }

      activeBasemapItem = {
        groupId: group.id,
        instanceId: item.instanceId,
        basemapId: item.basemapId ?? defaultBasemapId,
        selectionId: `${group.id}:${item.instanceId}`,
      };
    });
  });

  return activeBasemapItem;
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
    if (group.displayVisible === false) {
      return;
    }

    group.layerItems.forEach((item) => {
      if (item.visible) {
        visibleIds.add(item.layerId);
      }
    });
  });

  return visibleIds;
}

function normalizeMapGroups(groups: MapGroup[]) {
  return groups.map((group) => ({
    ...group,
    displayVisible: group.displayVisible ?? true,
  }));
}

function getMapGroupLayerDrawOrder(groups: MapGroup[]): LayerOrderId[] {
  const orderedLayerIds: LayerOrderId[] = [];
  let hasBasemap = false;

  groups.forEach((group) => {
    group.layerItems.forEach((item) => {
      if (item.layerId === 'basemap') {
        hasBasemap = true;
        return;
      }

      orderedLayerIds.push(item.layerId);
    });
  });

  return hasBasemap ? [...orderedLayerIds, 'basemap'] : orderedLayerIds;
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
      ? { ...group, layerItems: [...unclaimedIds.map((layerId) => createMapGroupLayerItem(layerId)), ...group.layerItems] }
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
      items.push({ id, kind: 'basemap', label: '底图', checked: layerVisibility.basemap, basemapId: defaultBasemapId });
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
