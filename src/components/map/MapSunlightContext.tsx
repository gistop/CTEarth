import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type MapSunlightContextValue = {
  closeSunlight: () => void;
  isSunlightOpen: boolean;
  toggleSunlight: () => void;
};

const MapSunlightContext = createContext<MapSunlightContextValue | null>(null);

export function MapSunlightProvider({ children }: { children: ReactNode }) {
  const [isSunlightOpen, setIsSunlightOpen] = useState(false);

  const closeSunlight = useCallback(() => {
    setIsSunlightOpen(false);
  }, []);

  const toggleSunlight = useCallback(() => {
    setIsSunlightOpen((value) => !value);
  }, []);

  const value = useMemo(() => ({
    closeSunlight,
    isSunlightOpen,
    toggleSunlight,
  }), [closeSunlight, isSunlightOpen, toggleSunlight]);

  return <MapSunlightContext.Provider value={value}>{children}</MapSunlightContext.Provider>;
}

export function useMapSunlight() {
  const value = useContext(MapSunlightContext);

  if (!value) {
    throw new Error('useMapSunlight must be used inside MapSunlightProvider');
  }

  return value;
}
