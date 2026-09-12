import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createDigitizeStore, type DigitizeStore } from './digitizeStore';
import { createDigitizeEditService, type DigitizeEditService } from '../services/digitizeEditService';
import type { DigitizeDataPort } from '../types';

const DigitizeContext = createContext<{ store: DigitizeStore; edits: DigitizeEditService } | null>(null);

export function DigitizeStoreProvider({ children, port, store }: { children: ReactNode; port: DigitizeDataPort; store?: DigitizeStore }) {
  const [ownedStore] = useState(createDigitizeStore);
  const edits = useMemo(() => createDigitizeEditService(port), [port]);
  const value = useMemo(() => ({ store: store ?? ownedStore, edits }), [store, ownedStore, edits]);
  return <DigitizeContext.Provider value={value}>{children}</DigitizeContext.Provider>;
}

export function useDigitizeServices() {
  const value = useContext(DigitizeContext);
  if (!value) throw new Error('useDigitize must be used inside DigitizeProvider');
  return value;
}

export function useDigitize() {
  const { store, edits } = useDigitizeServices();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const clearFeatures = useMemo(() => () => {
    try {
      edits.clearFeatures();
      store.actions.setActiveTool(store.getSnapshot().activeTool);
      store.actions.setFeatureCount(0);
      store.actions.setStatus('已清空当前编辑图层。');
      return true;
    } catch (error) {
      store.actions.setStatus(error instanceof Error ? error.message : '清空图层失败。');
      return false;
    }
  }, [edits, store]);
  return { ...state, ...store.actions, clearFeatures };
}
