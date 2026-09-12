import { createKeyedViewStore } from './keyedViewStore';
import type { DataViewFilter } from './types';

export const defaultDataViewFilter: DataViewFilter = Object.freeze({ query: '', showSelectedOnly: false });
export function createDataViewFilterStore() {
  return createKeyedViewStore<DataViewFilter>(defaultDataViewFilter, (previous, patch) => {
    const next = { ...previous, ...patch };
    if (typeof next.query !== 'string' || typeof next.showSelectedOnly !== 'boolean') throw new Error('数据视图筛选参数无效。');
    return { query: next.query, showSelectedOnly: next.showSelectedOnly };
  });
}
export type DataViewFilterStore = ReturnType<typeof createDataViewFilterStore>;
