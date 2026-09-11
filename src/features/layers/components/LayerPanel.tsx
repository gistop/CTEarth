import { useEffect, useMemo, useState } from 'react';
import {
  Database,
  Grid2X2,
  Layers,
  Map as MapIcon,
  PenTool,
  Plus,
  Save,
  Search,
  TableProperties,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import { useAttributeTable } from '../../../components/attributes/AttributeTableContext';
import { AddDataSplitButton } from './AddDataSplitButton';
import { InlineRenameLabel } from './InlineRenameLabel';
import { MapGroupEditPanel } from './MapGroupEditPanel';
import { MapGroupSplitButton } from './MapGroupSplitButton';
import { MapGroupSection, type MapGroup, type MapGroupLayerItem, type MapGroupLayerItemId } from './MapGroupSection';
import { SaveAsSplitButton } from './SaveAsSplitButton';
import { LayerBadge } from './LayerBadge';
import { LayerRow } from './LayerRow';
import { LayerStylePanel } from './LayerStylePanel';
import type { LayerGeometryKind, LayerListItem, MapGroupLayerRow } from './layerViewTypes';
import { useMapCommands } from '../../maps/components/map/MapCommandContext';
import { useMapBasemapSelection } from '../../maps/components/map/MapBasemapSelectionContext';
import { useLayerStore, type LayerStore } from '../stores/layerStore';
import { useMapGroupStore } from '../stores/mapGroupStore';
import { defaultBasemapId, type BasemapId } from '../../maps/components/map/basemapOptions';
import { defaultCesiumImageryId, type CesiumImageryId } from '../../maps/components/map/cesiumLayerOptions';
import type { BasemapSourceKind } from '../../maps/components/map/rasterBasemapSources';
import {
  addBasemapLayerItemToCurrentGroup,
  createMapGroupId,
  createMapGroupLayerItem,
  findSelectedBasemapItem,
  getActiveBasemapItem,
  getMapGroupBasemapLabel,
  getMapGroupLayerSelectionId,
  getTargetBasemapItem,
  getVisibleMapGroupLayerIds,
  isDuplicateMapGroupName,
  moveLayerItemByOffset,
  moveLayerItemInMapGroups,
  moveMapGroupByOffset,
  moveMapGroupsInOrder,
  nextMapGroupName,
  normalizeMapGroupName,
  type LayerDragDescriptor,
  type LayerDropDescriptor,
  type MapGroupDragDescriptor,
  type MapGroupDropDescriptor,
} from '../services/mapGroupService';
import {
  defaultBasemapStyle,
  defaultRasterStyle,
  defaultUploadedLayerStyle,
  defaultVectorOverlayStyle,
  displayLayerName,
  getGeoJsonBounds,
  getPointBounds,
  type BasemapLayerStyle,
  type EditableGeometryType,
  type LayerOrderId,
  type RasterOverlay,
  type UploadedLayer,
} from '../../../gisStore';

type EditTarget =
  | { kind: 'group'; groupId: string }
  | { kind: 'layer'; groupId: string; layerInstanceKey: string; itemId: string; layerKind: Exclude<LayerListItem['kind'], 'basemap'> };

export function LayerPanel() {
  const [draggingItem, setDraggingItem] = useState<LayerDragDescriptor | null>(null);
  const [dropTarget, setDropTarget] = useState<LayerDropDescriptor | null>(null);
  const [draggingMapGroup, setDraggingMapGroup] = useState<MapGroupDragDescriptor | null>(null);
  const [mapGroupDropTarget, setMapGroupDropTarget] = useState<MapGroupDropDescriptor | null>(null);
  const [expandedEditTarget, setExpandedEditTarget] = useState<EditTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    layers,
    activeLayerId,
    raster,
    rasters,
    vectorOverlay,
    message,
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
  } = useLayerStore();
  const { mapCommandState, setBasemap, setCesiumImagery } = useMapCommands();
  const { registerBasemapChangeHandler, registerBasemapImageryChangeHandler } = useMapBasemapSelection();
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
  const {
    collapsedMapGroupIds,
    currentMapGroupId,
    mapGroupDraftLoaded,
    mapGroups,
    setCollapsedMapGroupIds,
    setCurrentMapGroupId,
    setMapGroups,
  } = useMapGroupStore({ layerItemIds, setLayerDrawOrder, workspaceDraftLoaded });
  const selectedBasemapItem = selectedItemId ? findSelectedBasemapItem(mapGroups, selectedItemId) : null;
  const mapGroupViews = useMemo(() => {
    const itemById = new Map(layerItems.map((item) => [item.id, item]));

    return mapGroups.map((group) => {
      const orderedRows: MapGroupLayerRow[] = [];

      for (const groupItem of group.layerItems) {
        const item = groupItem.layerId === 'basemap'
          ? {
            id: `${group.id}:${groupItem.instanceId}`,
            kind: 'basemap' as const,
            label: `底图 · ${getMapGroupBasemapLabel(groupItem.basemapId ?? defaultBasemapId, groupItem.basemapSourceKind ?? (groupItem.cesiumImageryId ? 'imagery' : 'basemap'), groupItem.cesiumImageryId ?? defaultCesiumImageryId)}`,
            checked: groupItem.visible,
            basemapId: groupItem.basemapId ?? defaultBasemapId,
            basemapSourceKind: groupItem.basemapSourceKind ?? (groupItem.cesiumImageryId ? 'imagery' : 'basemap'),
            cesiumImageryId: groupItem.cesiumImageryId ?? defaultCesiumImageryId,
            opacity: groupItem.opacity ?? defaultBasemapStyle.opacity,
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
    });
  }, [layerItems, mapGroups]);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleMapGroupViews = useMemo(() => {
    if (!normalizedSearchQuery) {
      return mapGroupViews;
    }

    return mapGroupViews
      .map((view) => {
        if (view.group.name.toLocaleLowerCase().includes(normalizedSearchQuery)) {
          return view;
        }

        const rows = view.rows.filter(({ item }) => item.label.toLocaleLowerCase().includes(normalizedSearchQuery));

        if (rows.length === 0) {
          return null;
        }

        return {
          ...view,
          rows,
        };
      })
      .filter((view): view is NonNullable<typeof view> => Boolean(view));
  }, [mapGroupViews, normalizedSearchQuery]);
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
    return registerBasemapChangeHandler((basemapId) => {
      const targetBasemapItem = getTargetBasemapItem(mapGroups, currentMapGroupId, selectedItemId);

      if (!targetBasemapItem) {
        setBasemap(basemapId);
        return;
      }

      applyBasemapItemChange(targetBasemapItem.groupId, targetBasemapItem.instanceId, { basemapId, basemapSourceKind: 'basemap' });
      setBasemap(basemapId);
      setSelectedItemId(targetBasemapItem.selectionId);
    });
  }, [currentMapGroupId, mapGroups, registerBasemapChangeHandler, selectedItemId, setBasemap]);

  useEffect(() => {
    return registerBasemapImageryChangeHandler((imageryId) => {
      const targetBasemapItem = getTargetBasemapItem(mapGroups, currentMapGroupId, selectedItemId);

      if (!targetBasemapItem) {
        setCesiumImagery(imageryId);
        return;
      }

      applyBasemapItemChange(targetBasemapItem.groupId, targetBasemapItem.instanceId, { cesiumImageryId: imageryId, basemapSourceKind: 'imagery' });
      setCesiumImagery(imageryId);
      setSelectedItemId(targetBasemapItem.selectionId);
    });
  }, [currentMapGroupId, mapGroups, registerBasemapImageryChangeHandler, selectedItemId, setCesiumImagery]);

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
    if (activeBasemapItem.basemapSourceKind !== mapCommandState.basemapSourceKind) {
      if (activeBasemapItem.basemapSourceKind === 'imagery') {
        setCesiumImagery(activeBasemapItem.cesiumImageryId);
      } else {
        setBasemap(activeBasemapItem.basemapId);
      }
    }
    if (activeBasemapItem.cesiumImageryId !== mapCommandState.cesiumImagery) {
      setCesiumImagery(activeBasemapItem.cesiumImageryId);
    }
  }, [layerVisibility.basemap, mapCommandState.basemap, mapCommandState.basemapSourceKind, mapCommandState.cesiumImagery, mapGroupDraftLoaded, mapGroups, setBasemap, setCesiumImagery, setLayerVisibility, workspaceDraftLoaded]);

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
      layerItems: [createMapGroupLayerItem('basemap', mapCommandState.basemap, mapCommandState.basemapSourceKind, mapCommandState.cesiumImagery)],
    };

    setMapGroups((current) => [...current, nextGroup]);
    setSelectedItemId(null);
    closeEditPanel();
  };

  const handleAddBasemapToCurrentMapGroup = () => {
    setMapGroups((current) => addBasemapLayerItemToCurrentGroup(current, currentMapGroupId, mapCommandState.basemap, mapCommandState.basemapSourceKind, mapCommandState.cesiumImagery));
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

  const applyBasemapItemChange = (
    groupId: string,
    instanceId: string,
    patch: { basemapId?: BasemapId; basemapSourceKind?: BasemapSourceKind; cesiumImageryId?: CesiumImageryId; opacity?: number },
  ) => {
    setMapGroups((current) => current.map((group) => (
      group.id === groupId
        ? {
          ...group,
          layerItems: group.layerItems.map((item) => (
            item.instanceId === instanceId
              ? {
                ...item,
                ...(typeof patch.opacity === 'number' ? { opacity: patch.opacity } : {}),
                ...(patch.basemapId ? { basemapId: patch.basemapId } : {}),
                ...(patch.basemapSourceKind ? { basemapSourceKind: patch.basemapSourceKind } : {}),
                ...(patch.cesiumImageryId ? { cesiumImageryId: patch.cesiumImageryId } : {}),
              }
              : item
          )),
        }
        : group
    )));
  };

  const handleBasemapStyleChange = (
    groupId: string,
    groupItem: MapGroupLayerItem,
    patch: Partial<BasemapLayerStyle> & { basemapId?: BasemapId; basemapSourceKind?: BasemapSourceKind; cesiumImageryId?: CesiumImageryId },
  ) => {
    applyBasemapItemChange(groupId, groupItem.instanceId, patch);

    if (patch.basemapId) {
      setBasemap(patch.basemapId);
    }

    if (patch.basemapSourceKind === 'imagery' && patch.cesiumImageryId) {
      setCesiumImagery(patch.cesiumImageryId);
    }
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

            return item;
          }),
        }
        : group
    )));
  };

  const handleDeleteSelectedLayer = () => {
    if (selectedUploadedLayer) {
      if (!window.confirm(`删除图层 ${displayLayerName(selectedUploadedLayer.fileName)}？`)) {
        return;
      }

      deleteUploadedLayer(selectedUploadedLayer.id);
      setSelectedItemId(null);
      closeEditPanel();
      return;
    }

    if (selectedBasemapItem) {
      if (!window.confirm(`删除底图 · ${getMapGroupBasemapLabel(selectedBasemapItem.basemapId, selectedBasemapItem.basemapSourceKind, selectedBasemapItem.cesiumImageryId)}？`)) {
        return;
      }

      setMapGroups((current) => current.map((group) => (
        group.id === selectedBasemapItem.groupId
          ? {
            ...group,
            layerItems: group.layerItems.filter((item) => item.instanceId !== selectedBasemapItem.instanceId),
          }
          : group
      )));
      setSelectedItemId(null);
      closeEditPanel();
    }
  };

  const handleZoomToSelectedLayer = () => {
    if (!selectedUploadedLayer || !selectedLayerBounds) {
      return;
    }

    zoomToLayer(selectedUploadedLayer.id);
  };

  const handleDrop = (target: LayerDropDescriptor) => {
    if (!draggingItem) {
      setDropTarget(null);
      return;
    }

    moveLayerItemBetweenGroups(draggingItem, target);
    setDraggingItem(null);
    setDropTarget(null);
  };

  const moveLayerItemBetweenGroups = (dragged: LayerDragDescriptor, target: LayerDropDescriptor) => {
    setMapGroups((current) => moveLayerItemInMapGroups(current, dragged, target));
    setSelectedItemId(getMapGroupLayerSelectionId(target.groupId, dragged));
    closeEditPanel();
  };

  const moveLayerItemWithKeyboard = (groupId: string, groupItem: MapGroupLayerItem, offset: -1 | 1) => {
    setMapGroups((current) => moveLayerItemByOffset(current, groupId, groupItem.instanceId, offset));
    setSelectedItemId(getMapGroupLayerSelectionId(groupId, groupItem));
    closeEditPanel();
  };

  const handleMapGroupDragStart = (groupId: string) => {
    setDraggingMapGroup({ groupId });
    setMapGroupDropTarget(null);
    setDraggingItem(null);
    setDropTarget(null);
    closeEditPanel();
  };

  const handleMapGroupDragEnd = () => {
    setDraggingMapGroup(null);
    setMapGroupDropTarget(null);
  };

  const handleMapGroupDragOver = (event: { preventDefault: () => void; currentTarget: HTMLDivElement; clientY: number }, groupId: string) => {
    if (!draggingMapGroup) {
      return;
    }

    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

    setMapGroupDropTarget({ groupId, position });
  };

  const handleMapGroupDrop = (target: MapGroupDropDescriptor) => {
    if (!draggingMapGroup) {
      setMapGroupDropTarget(null);
      return;
    }

    setMapGroups((current) => moveMapGroupsInOrder(current, draggingMapGroup, target));
    setDraggingMapGroup(null);
    setMapGroupDropTarget(null);
  };

  const moveMapGroupWithKeyboard = (groupId: string, offset: -1 | 1) => {
    setMapGroups((current) => moveMapGroupByOffset(current, groupId, offset));
    closeEditPanel();
  };

  return (
    <section className="contents-layer-section" aria-label="图层内容">
      <div className="panel-search">
        <Search size={15} />
        <input
          value={searchQuery}
          placeholder="搜索"
          aria-label="搜索内容"
          onChange={(event) => setSearchQuery(event.target.value)}
        />
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
          disabled={!selectedUploadedLayer && !selectedBasemapItem}
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
      <section className="layer-tree contents-layer-tree" role="tree" aria-label="地图和图层">
        {visibleMapGroupViews.map(({ group, rows, allVisible, someVisible }) => (
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
            isExpanded={Boolean(normalizedSearchQuery) || !collapsedMapGroupIds.has(group.id)}
            isDragging={draggingMapGroup?.groupId === group.id}
            isDropTarget={draggingItem ? isSameDropTarget(dropTarget, { groupId: group.id, targetInstanceId: null }) : mapGroupDropTarget?.groupId === group.id}
            dropPosition={mapGroupDropTarget?.groupId === group.id ? mapGroupDropTarget.position : undefined}
            isCurrent={group.id === currentMapGroupId}
            isEditOpen={expandedEditTarget?.kind === 'group' && expandedEditTarget.groupId === group.id}
            onDisplayVisibilityChange={(visible) => handleMapGroupDisplayVisibilityChange(group.id, visible)}
            onDragStart={() => handleMapGroupDragStart(group.id)}
            onDragEnd={handleMapGroupDragEnd}
            onDragOver={(event) => handleMapGroupDragOver(event, group.id)}
            onMoveDown={() => moveMapGroupWithKeyboard(group.id, 1)}
            onMoveUp={() => moveMapGroupWithKeyboard(group.id, -1)}
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
              if (draggingItem && !draggingMapGroup) {
                setDropTarget({ groupId: group.id, targetInstanceId: null });
              }
            }}
            onEdit={() => openGroupEdit(group)}
            onDrop={() => {
              if (draggingItem && !draggingMapGroup) {
                handleDrop({ groupId: group.id, targetInstanceId: null });
                return;
              }

              if (draggingMapGroup) {
                handleMapGroupDrop(
                  mapGroupDropTarget?.groupId === group.id
                    ? mapGroupDropTarget
                    : { groupId: group.id, position: 'before' },
                );
              }
            }}
            onSetCurrent={() => handleSetCurrentMapGroup(group.id)}
            onToggleExpanded={() => handleToggleMapGroupExpanded(group.id)}
            onVisibilityChange={(visible) => handleMapGroupVisibilityChange(group.id, visible)}
          >
            {rows.map(({ groupItem, item }) => {
              const layerInstanceKey = `${group.id}:${groupItem.instanceId}`;
              const selectedRowId = item.kind === 'basemap' ? layerInstanceKey : item.id;
              const isEditOpen = expandedEditTarget?.kind === 'layer' && expandedEditTarget.layerInstanceKey === layerInstanceKey;
              const isDragging = isSameLayerDragState(draggingItem, {
                groupId: group.id,
                instanceId: groupItem.instanceId,
              });
              const isDropTarget = isSameDropTarget(dropTarget, {
                groupId: group.id,
                targetInstanceId: groupItem.instanceId,
              });
              const isLayerDragActive = Boolean(draggingItem) && !draggingMapGroup;
              const layerLabel = item.kind === 'basemap'
                ? `底图 · ${getMapGroupBasemapLabel(item.basemapId, item.basemapSourceKind, item.cesiumImageryId)}`
                : item.label;

              return (
            <div className="layer-item-block" key={layerInstanceKey}>
              <LayerRow
                badge={(
                  <LayerBadge
                    item={item}
                    rasterStyle={rasterStyle}
                    uploadedLayerStyles={uploadedLayerStyles}
                    vectorOverlayStyle={vectorOverlayStyle}
                  />
                )}
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
                  if (isLayerDragActive) {
                    setDraggingItem(null);
                    setDropTarget(null);
                  }
                }}
                onDragEnter={() => {
                  if (isLayerDragActive && !isDragging) {
                    setDropTarget({ groupId: group.id, targetInstanceId: groupItem.instanceId });
                  }
                }}
                onDragStart={() => {
                  setDraggingItem({ groupId: group.id, instanceId: groupItem.instanceId, layerId: groupItem.layerId });
                  setDraggingMapGroup(null);
                  setMapGroupDropTarget(null);
                }}
                onMoveDown={() => {
                  moveLayerItemWithKeyboard(group.id, groupItem, 1);
                }}
                onMoveUp={() => {
                  moveLayerItemWithKeyboard(group.id, groupItem, -1);
                }}
                onDrop={() => {
                  if (isLayerDragActive) {
                    handleDrop({ groupId: group.id, targetInstanceId: groupItem.instanceId });
                  }
                }}
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
                      handleBasemapStyleChange(group.id, groupItem, {
                        opacity: defaultBasemapStyle.opacity,
                        basemapId: defaultBasemapId,
                        basemapSourceKind: 'basemap',
                        cesiumImageryId: defaultCesiumImageryId,
                      });
                    }
                  }}
                  onUpdateBasemap={(patch) => {
                    handleBasemapStyleChange(group.id, groupItem, patch);
                  }}
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

        {normalizedSearchQuery && visibleMapGroupViews.length === 0 ? (
          <div className="layer-note status" role="status">未找到匹配的地图或图层。</div>
        ) : null}

        {layers.length === 0 && rasters.length === 0 ? (
          <div className="layer-note">点击上方添加数据按钮，选择 Shapefile ZIP 或 GeoJSON。</div>
        ) : null}
        <div className="layer-note status">{message}</div>
      </section>
    </section>
  );
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

function isSameLayerDragState(
  left: LayerDragDescriptor | null,
  right: Pick<LayerDragDescriptor, 'groupId' | 'instanceId'>,
) {
  return Boolean(left && left.groupId === right.groupId && left.instanceId === right.instanceId);
}

function isSameDropTarget(left: LayerDropDescriptor | null, right: LayerDropDescriptor) {
  return Boolean(
    left
    && left.groupId === right.groupId
    && left.targetInstanceId === right.targetInstanceId
  );
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
  layerVisibility: LayerStore['layerVisibility'];
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
      items.push({
        id,
        kind: 'basemap',
        label: '底图',
        checked: layerVisibility.basemap,
        basemapId: defaultBasemapId,
        basemapSourceKind: 'basemap',
        cesiumImageryId: defaultCesiumImageryId,
        opacity: defaultBasemapStyle.opacity,
      });
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
