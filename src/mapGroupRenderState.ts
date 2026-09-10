import { useSyncExternalStore } from 'react';
import type { MapGroup, MapGroupLayerItem } from './features/layers/types';
import { defaultBasemapId } from './components/map/basemapOptions';
import type { BasemapId } from './components/map/basemapOptions';
import { defaultCesiumImageryId } from './components/map/cesiumLayerOptions';
import type { CesiumImageryId } from './components/map/cesiumLayerOptions';
import type { BasemapSourceKind } from './components/map/rasterBasemapSources';

export type MapGroupRenderEntry = {
  id: string;
  groupId: string;
  instanceId: string;
  layerId: MapGroupLayerItem['layerId'];
  visible: boolean;
  basemapId?: BasemapId;
  basemapSourceKind?: BasemapSourceKind;
  cesiumImageryId?: CesiumImageryId;
  opacity?: number;
};

export type MapGroupRenderState = {
  initialized: boolean;
  entries: MapGroupRenderEntry[];
};

const defaultMapGroupRenderState: MapGroupRenderState = {
  initialized: false,
  entries: [],
};

let currentState = defaultMapGroupRenderState;
const listeners = new Set<() => void>();

export function createMapGroupRenderState(groups: MapGroup[]): MapGroupRenderState {
  return {
    initialized: true,
    entries: groups.flatMap((group) => (
      group.layerItems.map((item) => ({
        id: item.layerId === 'basemap'
          ? `basemap:${group.id}:${item.instanceId}`
          : item.layerId,
        groupId: group.id,
        instanceId: item.instanceId,
        layerId: item.layerId,
        visible: group.displayVisible !== false && item.visible !== false,
        basemapId: item.layerId === 'basemap' ? (item.basemapId ?? defaultBasemapId) : undefined,
        basemapSourceKind: item.layerId === 'basemap' ? (item.basemapSourceKind ?? 'basemap') : undefined,
        cesiumImageryId: item.layerId === 'basemap' ? (item.cesiumImageryId ?? defaultCesiumImageryId) : undefined,
        opacity: item.layerId === 'basemap' ? (item.opacity ?? 1) : undefined,
      }))
    )),
  };
}

export function setMapGroupRenderState(nextState: MapGroupRenderState) {
  const normalizedState = normalizeMapGroupRenderState(nextState);

  if (areMapGroupRenderStatesEqual(currentState, normalizedState)) {
    return;
  }

  currentState = normalizedState;
  listeners.forEach((listener) => listener());
}

export function resetMapGroupRenderState() {
  setMapGroupRenderState(defaultMapGroupRenderState);
}

export function useMapGroupRenderState() {
  return useSyncExternalStore(subscribeMapGroupRenderState, getMapGroupRenderSnapshot, getMapGroupRenderSnapshot);
}

function subscribeMapGroupRenderState(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getMapGroupRenderSnapshot() {
  return currentState;
}

function normalizeMapGroupRenderState(state: MapGroupRenderState) {
  return {
    initialized: state.initialized,
    entries: state.entries.map((entry) => ({ ...entry })),
  };
}

function areMapGroupRenderStatesEqual(left: MapGroupRenderState, right: MapGroupRenderState) {
  if (left.initialized !== right.initialized || left.entries.length !== right.entries.length) {
    return false;
  }

  return left.entries.every((entry, index) => {
    const other = right.entries[index];

    return other
      && entry.id === other.id
      && entry.groupId === other.groupId
      && entry.instanceId === other.instanceId
      && entry.layerId === other.layerId
      && entry.visible === other.visible
      && entry.basemapId === other.basemapId
      && entry.basemapSourceKind === other.basemapSourceKind
      && entry.cesiumImageryId === other.cesiumImageryId
      && entry.opacity === other.opacity;
  });
}
