import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AngleMeasureResult, AreaMeasureResult, BearingMeasureResult } from './geometryMeasurement';

export type GeometryMeasureMode = 'angle' | 'area' | 'area-surface' | 'bearing';

export type GeometryMeasureResult = AngleMeasureResult | AreaMeasureResult | BearingMeasureResult;

type GeometryMeasureContextValue = {
  activeMode: GeometryMeasureMode | null;
  addResult: (result: GeometryMeasureResult) => void;
  clearResults: () => void;
  closeMeasure: () => void;
  isActive: boolean;
  removeResult: (id: string) => void;
  results: GeometryMeasureResult[];
  setStatus: (status: string) => void;
  status: string;
  toggleMeasure: (mode: GeometryMeasureMode) => void;
};

const GeometryMeasureContext = createContext<GeometryMeasureContextValue | null>(null);

function isGeometryMeasureResult(value: unknown): value is GeometryMeasureResult {
  return Boolean(value) && (value as GeometryMeasureResult).id !== undefined;
}

export function GeometryMeasureProvider({ children }: { children: ReactNode }) {
  const [activeMode, setActiveMode] = useState<GeometryMeasureMode | null>(null);
  const [results, setResults] = useState<GeometryMeasureResult[]>([]);
  const [status, setStatus] = useState('');

  const toggleMeasure = useCallback((mode: GeometryMeasureMode) => {
    setActiveMode((current) => (current === mode ? null : mode));
  }, []);

  const closeMeasure = useCallback(() => {
    setActiveMode(null);
  }, []);

  const addResult = useCallback((result: GeometryMeasureResult) => {
    if (!isGeometryMeasureResult(result)) {
      return;
    }

    setResults((current) => [result, ...current]);
  }, []);

  const removeResult = useCallback((id: string) => {
    setResults((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  const value = useMemo(
    () => ({
      activeMode,
      addResult,
      clearResults,
      closeMeasure,
      isActive: activeMode !== null,
      removeResult,
      results,
      setStatus,
      status,
      toggleMeasure,
    }),
    [activeMode, addResult, clearResults, closeMeasure, removeResult, results, status, toggleMeasure],
  );

  return <GeometryMeasureContext.Provider value={value}>{children}</GeometryMeasureContext.Provider>;
}

export function useGeometryMeasure() {
  const value = useContext(GeometryMeasureContext);

  if (!value) {
    throw new Error('useGeometryMeasure must be used inside GeometryMeasureProvider');
  }

  return value;
}
