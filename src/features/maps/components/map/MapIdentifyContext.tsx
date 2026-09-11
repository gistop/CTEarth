import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type MapIdentifyContextValue = {
  identifyActive: boolean;
  setIdentifyActive: (active: boolean) => void;
  toggleIdentifyActive: () => void;
};

const MapIdentifyContext = createContext<MapIdentifyContextValue | null>(null);

export function MapIdentifyProvider({ children }: { children: ReactNode }) {
  const [identifyActive, setIdentifyActive] = useState(false);

  const toggleIdentifyActive = useCallback(() => {
    setIdentifyActive((active) => !active);
  }, []);

  const value = useMemo(
    () => ({
      identifyActive,
      setIdentifyActive,
      toggleIdentifyActive,
    }),
    [identifyActive, toggleIdentifyActive],
  );

  return <MapIdentifyContext.Provider value={value}>{children}</MapIdentifyContext.Provider>;
}

export function useMapIdentify() {
  const value = useContext(MapIdentifyContext);

  if (!value) {
    throw new Error('useMapIdentify must be used inside MapIdentifyProvider');
  }

  return value;
}
