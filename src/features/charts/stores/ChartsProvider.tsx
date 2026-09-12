import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useDataViews, type OpenDataView } from '../../../shared/data-views';
import { createChartStore, type ChartStore } from './chartStore';

const ChartsContext = createContext<{ store: ChartStore; openChart: OpenDataView; canOpenChart: boolean } | null>(null);
export function ChartsProvider({ children, store, onOpenChart }: { children: ReactNode; store?: ChartStore; onOpenChart?: OpenDataView }) {
  const [ownedStore] = useState(createChartStore);
  const current = store ?? ownedStore;
  const { datasets } = useDataViews();
  useEffect(() => current.retain(datasets.map(dataset => dataset.id)), [current, datasets]);
  const openChart = useCallback<OpenDataView>((datasetId, name, field) => {
    if (field !== undefined) current.update(datasetId, { field });
    onOpenChart?.(datasetId, name, field);
  }, [current, onOpenChart]);
  const value = useMemo(() => ({ store: current, openChart, canOpenChart: Boolean(onOpenChart) }), [current, openChart, onOpenChart]);
  return <ChartsContext.Provider value={value}>{children}</ChartsContext.Provider>;
}
export function useChartActions() {
  const context = useContext(ChartsContext);
  if (!context) throw new Error('图表必须位于 ChartsProvider 内。');
  return context;
}
export function useChartState(datasetId?: string) {
  const { store } = useChartActions();
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store.get(datasetId);
}
