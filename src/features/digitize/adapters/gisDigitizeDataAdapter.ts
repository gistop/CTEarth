import type { DigitizeDataPort, DigitizeEditableLayer, DigitizeFeatureCollection } from '../types';

export type DigitizeGisBindings = {
  activeLayerId: string | null;
  layers: DigitizeEditableLayer[];
  updateUploadedLayerGeoJson(layerId: string, geojson: DigitizeFeatureCollection): void;
};

export function createGisDigitizeDataAdapter(initial: DigitizeGisBindings) {
  let bindings = initial;
  const pending = new Map<string, { base: DigitizeFeatureCollection; next: DigitizeFeatureCollection }>();
  const getLayer = (layerId: string) => {
    const layer = bindings.layers.find(item => item.id === layerId);
    if (!layer) return null;
    const change = pending.get(layerId);
    return change && layer.geojson === change.base ? { ...layer, geojson: change.next } : layer;
  };
  const port: DigitizeDataPort = {
    getLayer,
    getActiveLayer() {
      const id = bindings.layers.some(layer => layer.id === bindings.activeLayerId) ? bindings.activeLayerId : bindings.layers.at(-1)?.id;
      return id ? getLayer(id) : null;
    },
    replaceFeatures(layerId, next, expected) {
      const current = getLayer(layerId);
      if (!current || current.geojson !== expected) throw new Error('数据已变化，编辑结果未覆盖当前数据。');
      bindings.updateUploadedLayerGeoJson(layerId, next);
      const existing = pending.get(layerId);
      pending.set(layerId, { base: existing?.base ?? expected, next });
    },
  };
  return {
    port,
    sync(next: DigitizeGisBindings) {
      bindings = next;
      pending.forEach((change, id) => {
        if (bindings.layers.find(layer => layer.id === id)?.geojson !== change.base) pending.delete(id);
      });
    },
  };
}
