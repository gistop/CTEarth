import type { UploadedLayer, VectorOverlay } from '../../gisStore';
import { isDataRecord } from '../../shared/data-views/dataViewQueryService';
import type { DataRecord, DataViewDataset } from '../../shared/data-views/types';

const emptyRecord: DataRecord = Object.freeze({});
export function createGisDataViewAdapter() {
  const cache = new WeakMap<object, { records: readonly DataRecord[]; fields: readonly string[] }>();
  const read = (geojson: { features: unknown[] }) => {
    const cached = cache.get(geojson);
    if (cached) return cached;
    const records = geojson.features.map(feature => isDataRecord(feature) && isDataRecord(feature.properties) ? feature.properties : emptyRecord);
    const fieldNames = new Set<string>();
    records.forEach(record => Object.keys(record).forEach(field => fieldNames.add(field)));
    const fields = [...fieldNames].sort();
    const result = { records, fields }; cache.set(geojson, result); return result;
  };
  return {
    read(layers: readonly UploadedLayer[], overlay: VectorOverlay | null, displayName: (name: string) => string): DataViewDataset[] {
      const datasets: DataViewDataset[] = layers.map(layer => ({
        id: layer.id, name: displayName(layer.fileName), records: read(layer.geojson).records,
        fields: [...new Set(layer.fields)], selectedIndexes: layer.selectedFeatureIndexes, selectable: true,
      }));
      if (overlay) datasets.push({ id: 'vectorOverlay', name: displayName(overlay.name), ...read(overlay.geojson), selectedIndexes: [], selectable: false });
      return datasets;
    },
  };
}
