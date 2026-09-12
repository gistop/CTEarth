import type { DataViewDataset } from '../types';
export function createDataViewDataset(id = 'roads'): DataViewDataset {
  return {
    id, name: id, records: [{ name: 'Alpha', value: 10, category: 'A' }, { name: 'Beta', value: 2, category: 'B' }, { name: 'Gamma', value: null, category: 'A' }],
    fields: ['name', 'value', 'category'], selectedIndexes: [1], selectable: true,
  };
}
