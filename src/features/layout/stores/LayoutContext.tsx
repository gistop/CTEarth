import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LayoutExportFormat } from '../types';
import { getLayoutDerivedState } from '../services/layoutDocumentService';
import { createLayoutExportController } from '../services/layoutExportController';
import { createLayoutStore, type LayoutStore } from './layoutStore';

const LayoutContext = createContext<{
  store: LayoutStore;
  exports: ReturnType<typeof createLayoutExportController>;
} | null>(null);

export function LayoutStoreProvider({ children, store }: { children: ReactNode; store?: LayoutStore }) {
  const [ownedStore] = useState(createLayoutStore);
  const [exports] = useState(createLayoutExportController);
  const value = useMemo(() => ({ store: store ?? ownedStore, exports }), [store, ownedStore, exports]);
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayoutServices() {
  const context = useContext(LayoutContext);
  if (!context) throw new Error('useLayout must be used inside LayoutProvider');
  return context;
}

export function useLayout() {
  const { store, exports } = useLayoutServices();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const isExporting = useSyncExternalStore(exports.subscribe, exports.getSnapshot, exports.getSnapshot);
  const exportPaper = useMemo(() => (format: LayoutExportFormat = 'pdf') => exports.export({ format }), [exports]);
  return { ...state, ...getLayoutDerivedState(state), ...store.actions, exportPaper, isExporting, cancelExport: exports.cancel };
}
