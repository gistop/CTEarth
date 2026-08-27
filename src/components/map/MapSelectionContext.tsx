import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type MapSelectionContextValue = {
  selectionActive: boolean;
  setSelectionActive: (active: boolean) => void;
  toggleSelectionActive: () => void;
};

const MapSelectionContext = createContext<MapSelectionContextValue | null>(null);

export function MapSelectionProvider({ children }: { children: ReactNode }) {
  const [selectionActive, setSelectionActive] = useState(false);

  const toggleSelectionActive = useCallback(() => {
    setSelectionActive((active) => !active);
  }, []);

  const value = useMemo(
    () => ({
      selectionActive,
      setSelectionActive,
      toggleSelectionActive,
    }),
    [selectionActive, toggleSelectionActive],
  );

  return <MapSelectionContext.Provider value={value}>{children}</MapSelectionContext.Provider>;
}

export function useMapSelection() {
  const value = useContext(MapSelectionContext);

  if (!value) {
    throw new Error('useMapSelection must be used inside MapSelectionProvider');
  }

  return value;
}
