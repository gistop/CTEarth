import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useDataViews, type OpenDataView } from '../../../shared/data-views';
import { createAttributeTableStore, type AttributeTableStore } from './attributeTableStore';
import { createAttributeFieldStore, type AttributeFieldStore } from './attributeFieldStore';
import { createAttributeFieldDraft } from '../services/attributeFieldService';
import type { AddAttributeFields } from '../types';

type AttributeTableServices = {
  store: AttributeTableStore;
  fieldStore: AttributeFieldStore;
  openTable?: OpenDataView;
  openChart?: OpenDataView;
  openFields?: OpenDataView;
  addFields?: AddAttributeFields;
};
const AttributeTableContext = createContext<AttributeTableServices | null>(null);

export function AttributeTableProvider({ children, store, onOpenTable, onOpenChart, onOpenFields, onAddFields }: {
  children: ReactNode; store?: AttributeTableStore; onOpenTable?: OpenDataView; onOpenChart?: OpenDataView;
  onOpenFields?: OpenDataView; onAddFields?: AddAttributeFields;
}) {
  const [ownedStore] = useState(createAttributeTableStore);
  const [fieldStore] = useState(createAttributeFieldStore);
  const { datasets } = useDataViews();
  const current = store ?? ownedStore;
  useEffect(() => current.retain(datasets.map(dataset => dataset.id)), [current, datasets]);
  useEffect(() => fieldStore.retain(datasets.map(dataset => dataset.id)), [fieldStore, datasets]);
  const value = useMemo<AttributeTableServices>(() => ({
    store: current, fieldStore, openTable: onOpenTable, openChart: onOpenChart, addFields: onAddFields,
    openFields: onOpenFields ? (datasetId, name) => {
      const dataset = datasets.find(item => item.id === datasetId);
      if (!dataset?.editable || !onAddFields) return;
      if (!fieldStore.get(datasetId).drafts.length) {
        fieldStore.update(datasetId, { drafts: [createAttributeFieldDraft(dataset.fields, crypto.randomUUID())], error: '', notice: '' });
      }
      onOpenFields(datasetId, name);
    } : undefined,
  }), [current, fieldStore, datasets, onOpenTable, onOpenChart, onOpenFields, onAddFields]);
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
