import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ViewportBounds4326 = [number, number, number, number];

type MapViewportContextValue = {
  viewportBounds4326: ViewportBounds4326 | null;
  setViewportBounds4326: (bounds: ViewportBounds4326 | null) => void;
};

const MapViewportContext = createContext<MapViewportContextValue | null>(null);

export function MapViewportProvider({ children }: { children: ReactNode }) {
  const [viewportBounds4326, setViewportBounds4326State] = useState<ViewportBounds4326 | null>(null);

  const setViewportBounds4326 = useCallback((bounds: ViewportBounds4326 | null) => {
    setViewportBounds4326State(bounds);
  }, []);

  const value = useMemo(() => ({
    viewportBounds4326,
    setViewportBounds4326,
  }), [viewportBounds4326, setViewportBounds4326]);

  return <MapViewportContext.Provider value={value}>{children}</MapViewportContext.Provider>;
}

export function useMapViewport() {
  const value = useContext(MapViewportContext);

  if (!value) {
    throw new Error('useMapViewport must be used inside MapViewportProvider');
  }

  return value;
}
