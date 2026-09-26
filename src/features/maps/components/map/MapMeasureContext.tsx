import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  type CompletedDistanceMeasurement,
  type DistanceKind,
  type DistanceMeasurementStyle,
} from './distanceMeasurement';

export type MeasureMode = 'coordinate' | 'distance';

export type CoordinateMeasureResult = {
  height: number;
  id: string;
  lat: number;
  lon: number;
};

type MapMeasureContextValue = {
  addCompletedMeasurement: (measurement: Omit<CompletedDistanceMeasurement, 'id' | 'name'>) => void;
  openMeasure: (options?: { silent?: boolean }) => void;
  addCoordinateResult: (point: Omit<CoordinateMeasureResult, 'id'>) => void;
  clearCompletedMeasurements: () => void;
  clearCoordinateResults: () => void;
  closeMeasure: () => void;
  completedMeasurements: CompletedDistanceMeasurement[];
  coordinateResults: CoordinateMeasureResult[];
  distanceKind: DistanceKind;
  isMeasureOpen: boolean;
  isPanelVisible: boolean;
  mode: MeasureMode;
  removeCompletedMeasurement: (id: string) => void;
  removeCoordinateResult: (id: string) => void;
  setDistanceKind: (kind: DistanceKind) => void;
  setMode: (mode: MeasureMode) => void;
  toggleMeasure: () => void;
  updateCompletedMeasurementStyle: (id: string, patch: Partial<DistanceMeasurementStyle>) => void;
  updateCompletedMeasurementVisibility: (id: string, isVisible: boolean) => void;
};

const MapMeasureContext = createContext<MapMeasureContextValue | null>(null);

export function MapMeasureProvider({ children }: { children: ReactNode }) {
  const [isMeasureOpen, setIsMeasureOpen] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [mode, setMode] = useState<MeasureMode>('distance');
  const [distanceKind, setDistanceKind] = useState<DistanceKind>('surface');
  const [completedMeasurements, setCompletedMeasurements] = useState<CompletedDistanceMeasurement[]>([]);
  const [coordinateResults, setCoordinateResults] = useState<CoordinateMeasureResult[]>([]);

  const closeMeasure = useCallback(() => {
    setIsMeasureOpen(false);
    setIsPanelVisible(true);
  }, []);

  const toggleMeasure = useCallback(() => {
    setIsMeasureOpen((value) => !value);
    setIsPanelVisible(true);
  }, []);

  const openMeasure = useCallback((options?: { silent?: boolean }) => {
    setIsPanelVisible(!options?.silent);
    setIsMeasureOpen(true);
  }, []);

  const addCompletedMeasurement = useCallback((measurement: Omit<CompletedDistanceMeasurement, 'id' | 'name'>) => {
    setCompletedMeasurements((current) => [...current, {
      ...measurement,
      id: `measurement-${Date.now()}-${current.length}`,
      name: `测量 ${current.length + 1}`,
    }]);
  }, []);

  const removeCompletedMeasurement = useCallback((id: string) => {
    setCompletedMeasurements((current) => current.filter((item) => item.id !== id));
  }, []);

  const updateCompletedMeasurementStyle = useCallback((id: string, patch: Partial<DistanceMeasurementStyle>) => {
    setCompletedMeasurements((current) => current.map((item) => (
      item.id === id ? { ...item, style: { ...item.style, ...patch } } : item
    )));
  }, []);

  const updateCompletedMeasurementVisibility = useCallback((id: string, isVisible: boolean) => {
    setCompletedMeasurements((current) => current.map((item) => (
      item.id === id ? { ...item, isVisible } : item
    )));
  }, []);

  const clearCompletedMeasurements = useCallback(() => {
    setCompletedMeasurements([]);
  }, []);

  const addCoordinateResult = useCallback((point: Omit<CoordinateMeasureResult, 'id'>) => {
    setCoordinateResults((current) => [{
      ...point,
      id: `coordinate-${Date.now()}-${current.length}`,
    }, ...current]);
  }, []);

  const removeCoordinateResult = useCallback((id: string) => {
    setCoordinateResults((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearCoordinateResults = useCallback(() => {
    setCoordinateResults([]);
  }, []);

  const value = useMemo(
    () => ({
      addCompletedMeasurement,
      addCoordinateResult,
      clearCompletedMeasurements,
      clearCoordinateResults,
      closeMeasure,
      completedMeasurements,
      coordinateResults,
      distanceKind,
      isMeasureOpen,
      isPanelVisible,
      mode,
      openMeasure,
      removeCompletedMeasurement,
      removeCoordinateResult,
      setDistanceKind,
      setMode,
      toggleMeasure,
      updateCompletedMeasurementStyle,
      updateCompletedMeasurementVisibility,
    }),
    [
      addCompletedMeasurement,
      addCoordinateResult,
      clearCompletedMeasurements,
      clearCoordinateResults,
      closeMeasure,
      completedMeasurements,
      coordinateResults,
      distanceKind,
      isMeasureOpen,
      isPanelVisible,
      mode,
      openMeasure,
      removeCompletedMeasurement,
      removeCoordinateResult,
      setDistanceKind,
      setMode,
      toggleMeasure,
      updateCompletedMeasurementStyle,
      updateCompletedMeasurementVisibility,
    ],
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
