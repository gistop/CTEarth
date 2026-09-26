import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ElevationMeasureResult } from './elevationMeasurement';

type ElevationMeasureContextValue = {
  addResult: (result: ElevationMeasureResult) => void;
  clearResults: () => void;
  closeMeasure: () => void;
  isActive: boolean;
  isOcclusionEnabled: boolean;
  removeResult: (id: string) => void;
  results: ElevationMeasureResult[];
  setStatus: (status: string) => void;
  status: string;
  toggleMeasure: () => void;
  toggleOcclusion: () => void;
};

const ElevationMeasureContext = createContext<ElevationMeasureContextValue | null>(null);

export function ElevationMeasureProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [isOcclusionEnabled, setIsOcclusionEnabled] = useState(false);
  const [results, setResults] = useState<ElevationMeasureResult[]>([]);
  const [status, setStatus] = useState('');

  const addResult = useCallback((result: ElevationMeasureResult) => {
    setResults((current) => [result, ...current]);
  }, []);

  const toggleOcclusion = useCallback(() => {
    setIsOcclusionEnabled((value) => !value);
  }, []);

  const closeMeasure = useCallback(() => {
    setIsActive(false);
  }, []);

  const toggleMeasure = useCallback(() => {
    setIsActive((value) => !value);
  }, []);

  const removeResult = useCallback((id: string) => {
    setResults((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  const value = useMemo(
    () => ({
      addResult,
      clearResults,
      closeMeasure,
      isActive,
      isOcclusionEnabled,
      removeResult,
      results,
      setStatus,
      status,
      toggleMeasure,
      toggleOcclusion,
    }),
    [addResult, clearResults, closeMeasure, isActive, isOcclusionEnabled, removeResult, results, status, toggleMeasure, toggleOcclusion],
  );

  return <ElevationMeasureContext.Provider value={value}>{children}</ElevationMeasureContext.Provider>;
}

export function useElevationMeasure() {
  const value = useContext(ElevationMeasureContext);

  if (!value) {
    throw new Error('useElevationMeasure must be used inside ElevationMeasureProvider');
  }

  return value;
}
