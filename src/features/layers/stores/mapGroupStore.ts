import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { LayerOrderId } from '../../../gisStore';
import { createMapGroupRenderState, setMapGroupRenderState } from '../../../mapGroupRenderState';
import {
  deleteMapGroupDraft,
  readMapGroupDraft,
  writeMapGroupDraft,
} from '../services/layerPersistenceService';
import {
  DEFAULT_MAP_GROUP_ID,
  assignUnclaimedLayerItemsToCurrentGroup,
  createDefaultMapGroups,
  getMapGroupLayerDrawOrder,
  normalizeMapGroups,
} from '../services/mapGroupService';
import type { MapGroup, MapGroupLayerItemId } from '../types';

type UseMapGroupStoreOptions = {
  layerItemIds: MapGroupLayerItemId[];
  setLayerDrawOrder: (order: LayerOrderId[]) => void;
  workspaceDraftLoaded: boolean;
};

export type MapGroupStore = {
  collapsedMapGroupIds: Set<string>;
  currentMapGroupId: string;
  mapGroupDraftLoaded: boolean;
  mapGroups: MapGroup[];
  setCollapsedMapGroupIds: Dispatch<SetStateAction<Set<string>>>;
  setCurrentMapGroupId: Dispatch<SetStateAction<string>>;
  setMapGroups: Dispatch<SetStateAction<MapGroup[]>>;
};

export function useMapGroupStore({
  layerItemIds,
  setLayerDrawOrder,
  workspaceDraftLoaded,
}: UseMapGroupStoreOptions): MapGroupStore {
  const [mapGroups, setMapGroups] = useState<MapGroup[]>(createDefaultMapGroups);
  const [currentMapGroupId, setCurrentMapGroupId] = useState(DEFAULT_MAP_GROUP_ID);
  const [collapsedMapGroupIds, setCollapsedMapGroupIds] = useState<Set<string>>(() => new Set());
  const [mapGroupDraftLoaded, setMapGroupDraftLoaded] = useState(false);

  useEffect(() => {
    if (!workspaceDraftLoaded || !mapGroupDraftLoaded) {
      return;
    }

    setMapGroups((current) => assignUnclaimedLayerItemsToCurrentGroup(current, currentMapGroupId, layerItemIds));
  }, [currentMapGroupId, layerItemIds, mapGroupDraftLoaded, workspaceDraftLoaded]);

  useEffect(() => {
    if (!workspaceDraftLoaded) {
      return undefined;
    }

    let active = true;

    readMapGroupDraft()
      .then((draft) => {
        if (!active || !draft) {
          return;
        }

        const nextMapGroups = draft.mapGroups.length > 0
          ? normalizeMapGroups(draft.mapGroups as MapGroup[])
          : createDefaultMapGroups();
        const nextGroupIds = new Set(nextMapGroups.map((group) => group.id));

        setMapGroups(nextMapGroups);
        setCurrentMapGroupId(
          nextGroupIds.has(draft.currentMapGroupId)
            ? draft.currentMapGroupId
            : nextMapGroups[0]?.id ?? DEFAULT_MAP_GROUP_ID,
        );
        setCollapsedMapGroupIds(new Set(draft.collapsedMapGroupIds.filter((id) => nextGroupIds.has(id))));
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
    setMapGroupRenderState(createMapGroupRenderState(mapGroups));
  }, [mapGroups]);

  useEffect(() => {
    if (workspaceDraftLoaded && mapGroupDraftLoaded) {
      setLayerDrawOrder(getMapGroupLayerDrawOrder(mapGroups));
    }
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

  return {
    collapsedMapGroupIds,
    currentMapGroupId,
    mapGroupDraftLoaded,
    mapGroups,
    setCollapsedMapGroupIds,
    setCurrentMapGroupId,
    setMapGroups,
  };
}
