import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BasemapId } from './basemapOptions';
import type { CesiumImageryId } from './cesiumLayerOptions';

type BasemapChangeHandler = (basemapId: BasemapId) => void;
type BasemapImageryChangeHandler = (imageryId: CesiumImageryId) => void;

type MapBasemapSelectionContextValue = {
  registerBasemapChangeHandler: (handler: BasemapChangeHandler) => () => void;
  requestBasemapChange: (basemapId: BasemapId) => void;
  registerBasemapImageryChangeHandler: (handler: BasemapImageryChangeHandler) => () => void;
  requestBasemapImageryChange: (imageryId: CesiumImageryId) => void;
};

const MapBasemapSelectionContext = createContext<MapBasemapSelectionContextValue | null>(null);

export function MapBasemapSelectionProvider({ children }: { children: ReactNode }) {
  const [handler, setHandler] = useState<BasemapChangeHandler | null>(null);
  const [imageryHandler, setImageryHandler] = useState<BasemapImageryChangeHandler | null>(null);

  const registerBasemapChangeHandler = useCallback((nextHandler: BasemapChangeHandler) => {
    setHandler(() => nextHandler);

    return () => {
      setHandler((current: BasemapChangeHandler | null) => (current === nextHandler ? null : current));
    };
  }, []);

  const requestBasemapChange = useCallback((basemapId: BasemapId) => {
    handler?.(basemapId);
  }, [handler]);

  const registerBasemapImageryChangeHandler = useCallback((nextHandler: BasemapImageryChangeHandler) => {
    setImageryHandler(() => nextHandler);

    return () => {
      setImageryHandler((current: BasemapImageryChangeHandler | null) => (current === nextHandler ? null : current));
    };
  }, []);

  const requestBasemapImageryChange = useCallback((imageryId: CesiumImageryId) => {
    imageryHandler?.(imageryId);
  }, [imageryHandler]);

  const value = useMemo(
    () => ({
      registerBasemapChangeHandler,
      requestBasemapChange,
      registerBasemapImageryChangeHandler,
      requestBasemapImageryChange,
    }),
    [registerBasemapChangeHandler, registerBasemapImageryChangeHandler, requestBasemapChange, requestBasemapImageryChange],
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
