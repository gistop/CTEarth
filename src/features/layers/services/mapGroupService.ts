import type { LayerOrderId } from '../../../gisStore';
import { defaultBasemapId, getBasemapLabel, type BasemapId } from '../../maps/components/map/basemapOptions';
import {
  defaultCesiumImageryId,
  getCesiumImageryLabel,
  type CesiumImageryId,
} from '../../maps/components/map/cesiumLayerOptions';
import type { BasemapSourceKind } from '../../maps/components/map/rasterBasemapSources';
import type { MapGroup, MapGroupLayerItem, MapGroupLayerItemId } from '../types';

export const DEFAULT_MAP_GROUP_ID = 'map-1';
export const DEFAULT_BASEMAP_OPACITY = 1;

export type LayerDragDescriptor = {
  groupId: string;
  instanceId: string;
  layerId: MapGroupLayerItemId;
};

export type LayerDropDescriptor = {
  groupId: string;
  targetInstanceId: string | null;
};

export type MapGroupDragDescriptor = {
  groupId: string;
};

export type MapGroupDropDescriptor = {
  groupId: string;
  position: 'before' | 'after';
};

export type SelectedBasemapItem = {
  groupId: string;
  instanceId: string;
  basemapId: BasemapId;
  basemapSourceKind: BasemapSourceKind;
  cesiumImageryId: CesiumImageryId;
  opacity: number;
  selectionId: string;
};

export function createDefaultMapGroups(): MapGroup[] {
  return [{
    id: DEFAULT_MAP_GROUP_ID,
    name: '地图',
    displayVisible: true,
    layerItems: [{ ...createMapGroupLayerItem('basemap', defaultBasemapId), visible: false }],
  }];
}

export function normalizeMapGroupName(name: string) {
  return name.trim().toLocaleLowerCase();
}

export function nextMapGroupName(groups: MapGroup[]) {
  const names = new Set(groups.map((group) => normalizeMapGroupName(group.name)));
  let index = groups.length + 1;

  while (names.has(normalizeMapGroupName(`地图 ${index}`))) {
    index += 1;
  }

  return `地图 ${index}`;
}

export function isDuplicateMapGroupName(groups: MapGroup[], name: string) {
  const normalized = normalizeMapGroupName(name);
  return groups.some((group) => normalizeMapGroupName(group.name) === normalized);
}

export function createMapGroupId() {
  return `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createMapGroupLayerItem(
  layerId: MapGroupLayerItemId,
  basemapId = defaultBasemapId,
  basemapSourceKind: BasemapSourceKind = 'basemap',
  cesiumImageryId = defaultCesiumImageryId,
): MapGroupLayerItem {
  return {
    instanceId: `map-layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    layerId,
    visible: true,
    basemapId: layerId === 'basemap' ? basemapId : undefined,
    basemapSourceKind: layerId === 'basemap' ? basemapSourceKind : undefined,
    cesiumImageryId: layerId === 'basemap' ? cesiumImageryId : undefined,
    opacity: layerId === 'basemap' ? DEFAULT_BASEMAP_OPACITY : undefined,
  };
}

export function addBasemapLayerItemToCurrentGroup(
  groups: MapGroup[],
  currentGroupId: string,
  basemapId: BasemapId,
  basemapSourceKind: BasemapSourceKind,
  cesiumImageryId: CesiumImageryId,
) {
  const nextBasemapItem = createMapGroupLayerItem('basemap', basemapId, basemapSourceKind, cesiumImageryId);

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

export function getMapGroupLayerSelectionId(groupId: string, item: Pick<MapGroupLayerItem, 'instanceId' | 'layerId'>) {
  return item.layerId === 'basemap' ? `${groupId}:${item.instanceId}` : item.layerId;
}

export function findSelectedBasemapItem(groups: MapGroup[], selectedItemId: string): SelectedBasemapItem | null {
  for (const group of groups) {
    for (const item of group.layerItems) {
      if (`${group.id}:${item.instanceId}` === selectedItemId && item.layerId === 'basemap') {
        return toSelectedBasemapItem(group.id, item);
      }
    }
  }

  return null;
}

export function getTargetBasemapItem(groups: MapGroup[], currentMapGroupId: string, selectedItemId: string | null) {
  if (selectedItemId) {
    const selectedBasemapItem = findSelectedBasemapItem(groups, selectedItemId);

    if (selectedBasemapItem) {
      return selectedBasemapItem;
    }
  }

  const currentGroup = groups.find((group) => group.id === currentMapGroupId);
  const currentBasemapItem = currentGroup?.layerItems.find((item) => item.layerId === 'basemap');
  return currentGroup && currentBasemapItem ? toSelectedBasemapItem(currentGroup.id, currentBasemapItem) : null;
}

export function getActiveBasemapItem(groups: MapGroup[]): SelectedBasemapItem | null {
  let activeBasemapItem: SelectedBasemapItem | null = null;

  groups.forEach((group) => {
    if (group.displayVisible === false) {
      return;
    }

    group.layerItems.forEach((item) => {
      if (item.layerId === 'basemap' && item.visible) {
        activeBasemapItem = toSelectedBasemapItem(group.id, item);
      }
    });
  });

  return activeBasemapItem;
}

export function getMapGroupBasemapLabel(
  basemapId: BasemapId,
  basemapSourceKind: BasemapSourceKind,
  cesiumImageryId: CesiumImageryId,
) {
  return basemapSourceKind === 'imagery'
    ? getCesiumImageryLabel(cesiumImageryId)
    : getBasemapLabel(basemapId);
}

export function moveLayerItemInMapGroups(
  groups: MapGroup[],
  dragged: LayerDragDescriptor,
  target: LayerDropDescriptor,
) {
  const sourceGroup = groups.find((group) => group.id === dragged.groupId);
  const targetGroup = groups.find((group) => group.id === target.groupId);
  const draggedItem = sourceGroup?.layerItems.find((item) => item.instanceId === dragged.instanceId);

  if (!sourceGroup || !targetGroup || !draggedItem || draggedItem.layerId !== dragged.layerId) {
    return groups;
  }

  if (target.targetInstanceId === dragged.instanceId && target.groupId === dragged.groupId) {
    return groups;
  }

  if (target.targetInstanceId && !targetGroup.layerItems.some((item) => item.instanceId === target.targetInstanceId)) {
    return groups;
  }

  return groups.map((group) => {
    let layerItems = group.layerItems;

    if (group.id === dragged.groupId) {
      layerItems = layerItems.filter((item) => item.instanceId !== dragged.instanceId);
    }

    if (group.id !== target.groupId) {
      return layerItems === group.layerItems ? group : { ...group, layerItems };
    }

    const nextLayerItems = [...layerItems];
    const targetIndex = target.targetInstanceId
      ? nextLayerItems.findIndex((item) => item.instanceId === target.targetInstanceId)
      : nextLayerItems.length;

    nextLayerItems.splice(targetIndex < 0 ? nextLayerItems.length : targetIndex, 0, draggedItem);
    return { ...group, layerItems: nextLayerItems };
  });
}

export function moveLayerItemByOffset(groups: MapGroup[], groupId: string, instanceId: string, offset: -1 | 1) {
  return groups.map((group) => {
    if (group.id !== groupId) {
      return group;
    }

    const sourceIndex = group.layerItems.findIndex((item) => item.instanceId === instanceId);
    const targetIndex = sourceIndex + offset;

    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= group.layerItems.length) {
      return group;
    }

    const layerItems = [...group.layerItems];
    [layerItems[sourceIndex], layerItems[targetIndex]] = [layerItems[targetIndex], layerItems[sourceIndex]];
    return { ...group, layerItems };
  });
}

export function moveMapGroupsInOrder(
  groups: MapGroup[],
  dragged: MapGroupDragDescriptor,
  target: MapGroupDropDescriptor,
) {
  const sourceIndex = groups.findIndex((group) => group.id === dragged.groupId);
  const targetIndex = groups.findIndex((group) => group.id === target.groupId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return groups;
  }

  const nextGroups = [...groups];
  const [movedGroup] = nextGroups.splice(sourceIndex, 1);
  let insertIndex = target.position === 'before' ? targetIndex : targetIndex + 1;

  if (sourceIndex < insertIndex) {
    insertIndex -= 1;
  }

  nextGroups.splice(insertIndex, 0, movedGroup);
  return nextGroups;
}

export function moveMapGroupByOffset(groups: MapGroup[], groupId: string, offset: -1 | 1) {
  const sourceIndex = groups.findIndex((group) => group.id === groupId);
  const targetIndex = sourceIndex + offset;

  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= groups.length) {
    return groups;
  }

  const nextGroups = [...groups];
  [nextGroups[sourceIndex], nextGroups[targetIndex]] = [nextGroups[targetIndex], nextGroups[sourceIndex]];
  return nextGroups;
}

export function getVisibleMapGroupLayerIds(groups: MapGroup[]) {
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

export function normalizeMapGroups(groups: MapGroup[]) {
  return groups.map((group) => ({
    ...group,
    displayVisible: group.displayVisible ?? true,
    layerItems: group.layerItems.map((item) => (
      item.layerId === 'basemap'
        ? {
          ...item,
          visible: item.visible ?? true,
          basemapId: item.basemapId ?? defaultBasemapId,
          basemapSourceKind: item.basemapSourceKind ?? 'basemap',
          cesiumImageryId: item.cesiumImageryId ?? defaultCesiumImageryId,
          opacity: item.opacity ?? DEFAULT_BASEMAP_OPACITY,
        }
        : item
    )),
  }));
}

export function getMapGroupLayerDrawOrder(groups: MapGroup[]): LayerOrderId[] {
  const orderedLayerIds: LayerOrderId[] = [];
  let basemapInsertIndex = -1;

  groups.forEach((group) => {
    group.layerItems.forEach((item) => {
      if (item.layerId === 'basemap') {
        basemapInsertIndex = orderedLayerIds.length;
        return;
      }

      orderedLayerIds.push(item.layerId);
    });
  });

  if (basemapInsertIndex < 0) {
    return orderedLayerIds;
  }

  const nextLayerOrder = [...orderedLayerIds];
  nextLayerOrder.splice(basemapInsertIndex, 0, 'basemap');
  return nextLayerOrder;
}

export function assignUnclaimedLayerItemsToCurrentGroup(
  groups: MapGroup[],
  currentGroupId: string,
  layerItemIds: MapGroupLayerItemId[],
) {
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

  return normalizedGroups.map((group) => (
    group.id === currentGroupId
      ? { ...group, layerItems: [...unclaimedIds.map((layerId) => createMapGroupLayerItem(layerId)), ...group.layerItems] }
      : group
  ));
}

function toSelectedBasemapItem(groupId: string, item: MapGroupLayerItem): SelectedBasemapItem {
  return {
    groupId,
    instanceId: item.instanceId,
    basemapId: item.basemapId ?? defaultBasemapId,
    basemapSourceKind: item.basemapSourceKind ?? (item.cesiumImageryId ? 'imagery' : 'basemap'),
    cesiumImageryId: item.cesiumImageryId ?? defaultCesiumImageryId,
    opacity: item.opacity ?? DEFAULT_BASEMAP_OPACITY,
    selectionId: `${groupId}:${item.instanceId}`,
  };
}
