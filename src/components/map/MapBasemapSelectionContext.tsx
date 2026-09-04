import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BasemapId } from './basemapOptions';

type BasemapChangeHandler = (basemapId: BasemapId) => void;

type MapBasemapSelectionContextValue = {
  registerBasemapChangeHandler: (handler: BasemapChangeHandler) => () => void;
  requestBasemapChange: (basemapId: BasemapId) => void;
};

const MapBasemapSelectionContext = createContext<MapBasemapSelectionContextValue | null>(null);

export function MapBasemapSelectionProvider({ children }: { children: ReactNode }) {
  const [handler, setHandler] = useState<BasemapChangeHandler | null>(null);

  const registerBasemapChangeHandler = useCallback((nextHandler: BasemapChangeHandler) => {
    setHandler(() => nextHandler);

    return () => {
      setHandler((current: BasemapChangeHandler | null) => (current === nextHandler ? null : current));
    };
  }, []);

  const requestBasemapChange = useCallback((basemapId: BasemapId) => {
    handler?.(basemapId);
  }, [handler]);

  const value = useMemo(
    () => ({ registerBasemapChangeHandler, requestBasemapChange }),
    [registerBasemapChangeHandler, requestBasemapChange],
  );

  return <MapBasemapSelectionContext.Provider value={value}>{children}</MapBasemapSelectionContext.Provider>;
}

export function useMapBasemapSelection() {
  const value = useContext(MapBasemapSelectionContext);

  if (!value) {
    throw new Error('useMapBasemapSelection must be used inside MapBasemapSelectionProvider');
  }

  return value;
}
