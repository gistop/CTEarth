import type {
  EditableGeometryType,
  LayerOrderId,
  LayerVisibility,
  RasterLayerStyle,
  RasterToolInput,
  UploadedLayerStyle,
} from './gisStore';

export type WorkspaceVectorLayer = {
  id: string;
  fileName: string;
  geometryType?: EditableGeometryType;
  geojson: {
    type: 'FeatureCollection';
    features: unknown[];
  };
  selectedField: string;
  selectedFeatureIndexes: number[];
};

export type WorkspaceRasterLayer = {
  id: string;
  name: string;
  toolInput: RasterToolInput;
};

export type WorkspaceDraft = {
  version: 2;
  savedAt: string;
  activeLayerId: string | null;
  activeRasterId: string | null;
  vectorLayers: WorkspaceVectorLayer[];
  rasterLayers: WorkspaceRasterLayer[];
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  uploadedLayerVisibility: Record<string, boolean>;
  rasterLayerVisibility: Record<string, boolean>;
  rasterStyle: RasterLayerStyle;
  layerVisibility: LayerVisibility;
  layerOrder: LayerOrderId[];
};

type LegacyVectorDraft = {
  version: 1;
  savedAt: string;
  activeLayerId: string | null;
  layers: WorkspaceVectorLayer[];
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  uploadedLayerVisibility: Record<string, boolean>;
  layerOrder: LayerOrderId[];
};

const workspaceDraftDbName = 'ctearth-vector-drafts';
const workspaceDraftStoreName = 'drafts';
const workspaceDraftKey = 'current';
const defaultRasterStyle: RasterLayerStyle = {
  opacity: 0.82,
};
const defaultLayerVisibility: LayerVisibility = {
  basemap: true,
  raster: true,
  vectorOverlay: true,
};

export async function readWorkspaceDraft(): Promise<WorkspaceDraft | null> {
  const database = await openWorkspaceDraftDb();

  if (!database) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(workspaceDraftStoreName, 'readonly');
    const request = transaction.objectStore(workspaceDraftStoreName).get(workspaceDraftKey);

    request.addEventListener('success', () => resolve(normalizeWorkspaceDraft(request.result)));
    request.addEventListener('error', () => reject(request.error));
    transaction.addEventListener('complete', () => database.close());
    transaction.addEventListener('error', () => database.close());
  });
}

export async function writeWorkspaceDraft(draft: WorkspaceDraft): Promise<void> {
  const database = await openWorkspaceDraftDb();

  if (!database) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(workspaceDraftStoreName, 'readwrite');

    transaction.objectStore(workspaceDraftStoreName).put(draft, workspaceDraftKey);
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

export async function deleteWorkspaceDraft(): Promise<void> {
  const database = await openWorkspaceDraftDb();

  if (!database) {
    return;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(workspaceDraftStoreName, 'readwrite');

    transaction.objectStore(workspaceDraftStoreName).delete(workspaceDraftKey);
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

async function openWorkspaceDraftDb(): Promise<IDBDatabase | null> {
  if (!('indexedDB' in window)) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(workspaceDraftDbName, 1);

    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(workspaceDraftStoreName)) {
        request.result.createObjectStore(workspaceDraftStoreName);
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

function normalizeWorkspaceDraft(value: unknown): WorkspaceDraft | null {
  if (isWorkspaceDraft(value)) {
    return value;
  }

  if (isLegacyVectorDraft(value)) {
    return {
      version: 2,
      savedAt: value.savedAt,
      activeLayerId: value.activeLayerId,
      activeRasterId: null,
      vectorLayers: value.layers,
      rasterLayers: [],
      uploadedLayerStyles: value.uploadedLayerStyles,
      uploadedLayerVisibility: value.uploadedLayerVisibility,
      rasterLayerVisibility: {},
      rasterStyle: defaultRasterStyle,
      layerVisibility: defaultLayerVisibility,
      layerOrder: value.layerOrder,
    };
  }

  return null;
}

function isWorkspaceDraft(value: unknown): value is WorkspaceDraft {
  return isRecord(value)
    && value.version === 2
    && typeof value.savedAt === 'string'
    && Array.isArray(value.vectorLayers)
    && Array.isArray(value.rasterLayers)
    && isRecord(value.uploadedLayerStyles)
    && isRecord(value.uploadedLayerVisibility)
    && isRecord(value.rasterLayerVisibility)
    && isRecord(value.rasterStyle)
    && isRecord(value.layerVisibility)
    && Array.isArray(value.layerOrder);
}

function isLegacyVectorDraft(value: unknown): value is LegacyVectorDraft {
  return isRecord(value)
    && value.version === 1
    && typeof value.savedAt === 'string'
    && Array.isArray(value.layers)
    && isRecord(value.uploadedLayerStyles)
    && isRecord(value.uploadedLayerVisibility)
    && Array.isArray(value.layerOrder);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
