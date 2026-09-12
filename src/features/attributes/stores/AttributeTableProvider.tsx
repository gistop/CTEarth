import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useDataViews, type OpenDataView } from '../../../shared/data-views';
import { createAttributeTableStore, type AttributeTableStore } from './attributeTableStore';

type AttributeTableServices = { store: AttributeTableStore; openTable?: OpenDataView; openChart?: OpenDataView };
const AttributeTableContext = createContext<AttributeTableServices | null>(null);

export function AttributeTableProvider({ children, store, onOpenTable, onOpenChart }: {
  children: ReactNode; store?: AttributeTableStore; onOpenTable?: OpenDataView; onOpenChart?: OpenDataView;
}) {
  const [ownedStore] = useState(createAttributeTableStore);
  const { datasets } = useDataViews();
  const current = store ?? ownedStore;
  useEffect(() => current.retain(datasets.map(dataset => dataset.id)), [current, datasets]);
  const value = useMemo(() => ({ store: current, openTable: onOpenTable, openChart: onOpenChart }), [current, onOpenTable, onOpenChart]);
  return <AttributeTableContext.Provider value={value}>{children}</AttributeTableContext.Provider>;
}

export function useAttributeTableActions() {
  const services = useContext(AttributeTableContext);
  if (!services) throw new Error('属性表必须位于 AttributeTableProvider 内。');
  return services;
}

export function useAttributeTableState(datasetId?: string) {
  const { store } = useAttributeTableActions();
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store.get(datasetId);
}
