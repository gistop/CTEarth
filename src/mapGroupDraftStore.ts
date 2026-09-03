import type { LayerOrderId } from './gisStore';

export type WorkspaceMapGroupLayerItem = {
  instanceId: string;
  layerId: LayerOrderId;
  visible: boolean;
};

export type WorkspaceMapGroup = {
  id: string;
  name: string;
  layerItems: WorkspaceMapGroupLayerItem[];
};

export type WorkspaceMapGroupDraft = {
  version: 1;
  savedAt: string;
  currentMapGroupId: string;
  mapGroups: WorkspaceMapGroup[];
  collapsedMapGroupIds: string[];
};

const mapGroupDraftDbName = 'ctearth-map-group-drafts';
const mapGroupDraftStoreName = 'drafts';
const mapGroupDraftKey = 'current';

export async function readMapGroupDraft(): Promise<WorkspaceMapGroupDraft | null> {
  const database = await openMapGroupDraftDb();

  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(mapGroupDraftStoreName, 'readonly');
    const request = transaction.objectStore(mapGroupDraftStoreName).get(mapGroupDraftKey);

    request.addEventListener('success', () => resolve(isMapGroupDraft(request.result) ? request.result : null));
    request.addEventListener('error', () => reject(request.error));
    transaction.addEventListener('complete', () => database.close());
    transaction.addEventListener('error', () => database.close());
  });
}

export async function writeMapGroupDraft(draft: WorkspaceMapGroupDraft): Promise<void> {
  const database = await openMapGroupDraftDb();

  if (!database) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(mapGroupDraftStoreName, 'readwrite');

    transaction.objectStore(mapGroupDraftStoreName).put(draft, mapGroupDraftKey);
    transaction.addEventListener('complete', () => {
      database.close();
      resolve();
    });
    transaction.addEventListener('error', () => {
      database.close();
      reject(transaction.error);
    });
  });
}

export async function deleteMapGroupDraft(): Promise<void> {
  const database = await openMapGroupDraftDb();

  if (!database) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(mapGroupDraftStoreName, 'readwrite');

    transaction.objectStore(mapGroupDraftStoreName).delete(mapGroupDraftKey);
    transaction.addEventListener('complete', () => {
      database.close();
      resolve();
    });
    transaction.addEventListener('error', () => {
      database.close();
      reject(transaction.error);
    });
  });
}

async function openMapGroupDraftDb(): Promise<IDBDatabase | null> {
  if (!('indexedDB' in window)) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(mapGroupDraftDbName, 1);

    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(mapGroupDraftStoreName)) {
        request.result.createObjectStore(mapGroupDraftStoreName);
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function isMapGroupDraft(value: unknown): value is WorkspaceMapGroupDraft {
  return isRecord(value)
    && value.version === 1
    && typeof value.savedAt === 'string'
    && typeof value.currentMapGroupId === 'string'
    && Array.isArray(value.mapGroups)
    && Array.isArray(value.collapsedMapGroupIds);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
