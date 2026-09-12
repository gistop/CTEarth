import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createDataViewFilterStore, type DataViewFilterStore } from './dataViewFilterStore';
import { queryDataRows } from './dataViewQueryService';
import type { DataViewDataset } from './types';

type DataViewContextValue = { datasets: readonly DataViewDataset[]; filters: DataViewFilterStore; select(datasetId: string, indexes: readonly number[]): void };
const DataViewContext = createContext<DataViewContextValue | null>(null);

export function DataViewProvider({ children, datasets, onSelect, filters }: {
  children: ReactNode; datasets: readonly DataViewDataset[]; onSelect?: (datasetId: string, indexes: number[]) => void; filters?: DataViewFilterStore;
}) {
  const [ownedFilters] = useState(createDataViewFilterStore);
  const store = filters ?? ownedFilters;
  const select = useCallback((datasetId: string, indexes: readonly number[]) => {
    const dataset = datasets.find(item => item.id === datasetId);
    if (!dataset?.selectable || !onSelect) throw new Error('当前数据集不支持选择。');
    if (!indexes.every(index => Number.isInteger(index) && index >= 0 && index < dataset.records.length)) throw new Error('选择包含不存在的记录。');
    onSelect(datasetId, [...new Set(indexes)].sort((first, second) => first - second));
  }, [datasets, onSelect]);
  useEffect(() => store.retain(datasets.map(dataset => dataset.id)), [store, datasets]);
  const value = useMemo(() => ({ datasets, filters: store, select }), [datasets, store, select]);
  return <DataViewContext.Provider value={value}>{children}</DataViewContext.Provider>;
}

export function useDataViews() {
  const context = useContext(DataViewContext);
  if (!context) throw new Error('数据视图必须位于 DataViewProvider 内。');
  return context;
}

export function useDataViewState(datasetId?: string | null) {
  const context = useDataViews();
  useSyncExternalStore(context.filters.subscribe, context.filters.getSnapshot, context.filters.getSnapshot);
  const dataset = context.datasets.find(item => item.id === datasetId) ?? null;
  const filter = context.filters.get(datasetId);
  return { dataset, filter, filters: context.filters, select: context.select };
}

export function useDataView(datasetId?: string | null) {
  const view = useDataViewState(datasetId);
  const rows = useMemo(() => queryDataRows(view.dataset, view.filter), [view.dataset, view.filter]);
  return { ...view, rows };
}
