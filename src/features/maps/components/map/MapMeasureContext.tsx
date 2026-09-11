import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type MeasureMode = 'coordinate' | 'distance' | 'area' | 'volume';

type MapMeasureContextValue = {
  isMeasureOpen: boolean;
  mode: MeasureMode;
  closeMeasure: () => void;
  setMode: (mode: MeasureMode) => void;
  toggleMeasure: () => void;
};

const MapMeasureContext = createContext<MapMeasureContextValue | null>(null);

export function MapMeasureProvider({ children }: { children: ReactNode }) {
  const [isMeasureOpen, setIsMeasureOpen] = useState(false);
  const [mode, setMode] = useState<MeasureMode>('distance');

  const closeMeasure = useCallback(() => {
    setIsMeasureOpen(false);
  }, []);

  const toggleMeasure = useCallback(() => {
    setIsMeasureOpen((value) => !value);
  }, []);

  const value = useMemo(
    () => ({
      closeMeasure,
      isMeasureOpen,
      mode,
      setMode,
      toggleMeasure,
    }),
    [closeMeasure, isMeasureOpen, mode, toggleMeasure],
  );

  return <MapMeasureContext.Provider value={value}>{children}</MapMeasureContext.Provider>;
}

export function useMapMeasure() {
  const value = useContext(MapMeasureContext);

  if (!value) {
    throw new Error('useMapMeasure must be used inside MapMeasureProvider');
  }

  return value;
}
