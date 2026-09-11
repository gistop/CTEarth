import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultBasemapId, type BasemapId } from './basemapOptions';
import {
  defaultCesiumImageryId,
  defaultCesiumTerrainId,
  type CesiumImageryId,
  type CesiumTerrainId,
} from './cesiumLayerOptions';
import type { BasemapSourceKind } from './rasterBasemapSources';

export type { BasemapId } from './basemapOptions';

export type DisplayCrsId = 'webMercator' | 'wgs84' | 'epsg32651';
export type MapViewMode = 'planar' | 'terrain' | 'globe';
export type MapCommand = 'zoomIn' | 'zoomOut' | 'resetNorth' | 'toggleDragRotate' | 'locate';

/** Imperative navigation surface implemented by whichever map engine is active. */
export type MapCommands = Partial<Record<MapCommand, () => void>> & {
  locateByQuery?: (query: string) => Promise<boolean>;
  syncViewport?: () => void;
  inspectTerrain?: () => void;
};

export type MapCommandState = {
  basemap: BasemapId;
  basemapSourceKind: BasemapSourceKind;
  cesiumImagery: CesiumImageryId;
  cesiumTerrain: CesiumTerrainId;
  displayCrs: DisplayCrsId;
  dragRotateEnabled: boolean;
  mapMode: MapViewMode;
};

type MapCommandContextValue = {
  canRunMapCommand: (command: MapCommand) => boolean;
  hasMapCommands: boolean;
  hasTerrainDiagnostic: boolean;
  mapCommandState: MapCommandState;
  registerMapCommands: (commands: MapCommands) => () => void;
  runMapCommand: (command: MapCommand) => void;
  runTerrainDiagnostic: () => void;
  locateByQuery: (query: string) => Promise<boolean>;
  setBasemap: (basemap: BasemapId) => void;
  setCesiumImagery: (imagery: CesiumImageryId) => void;
  setCesiumTerrain: (terrain: CesiumTerrainId) => void;
  setDisplayCrs: (displayCrs: DisplayCrsId) => void;
  setMapMode: (mode: MapViewMode) => void;
  updateMapCommandState: (state: Partial<MapCommandState>) => void;
};

const commandNames: MapCommand[] = ['zoomIn', 'zoomOut', 'resetNorth', 'toggleDragRotate', 'locate'];
const MapCommandContext = createContext<MapCommandContextValue | null>(null);
const defaultMapCommandState: MapCommandState = {
  basemap: defaultBasemapId,
  basemapSourceKind: 'basemap',
  cesiumImagery: defaultCesiumImageryId,
  cesiumTerrain: defaultCesiumTerrainId,
  displayCrs: 'webMercator',
  dragRotateEnabled: false,
  mapMode: 'planar',
};

export function MapCommandProvider({ children }: { children: ReactNode }) {
  const commandsRef = useRef<MapCommands | null>(null);
  const [availableCommands, setAvailableCommands] = useState<ReadonlySet<MapCommand>>(() => new Set());
  const [hasTerrainDiagnostic, setHasTerrainDiagnostic] = useState(false);
  const [mapCommandState, setMapCommandState] = useState<MapCommandState>(defaultMapCommandState);

  const registerMapCommands = useCallback((commands: MapCommands) => {
    commandsRef.current = commands;
    setAvailableCommands(new Set(commandNames.filter((command) => typeof commands[command] === 'function')));
    setHasTerrainDiagnostic(typeof commands.inspectTerrain === 'function');

    return () => {
      if (commandsRef.current === commands) {
        commandsRef.current = null;
        setAvailableCommands(new Set());
        setHasTerrainDiagnostic(false);
      }
    };
  }, []);

  const canRunMapCommand = useCallback(
    (command: MapCommand) => availableCommands.has(command),
    [availableCommands],
  );

  const runMapCommand = useCallback((command: MapCommand) => {
    commandsRef.current?.[command]?.();
  }, []);

  const runTerrainDiagnostic = useCallback(() => {
    commandsRef.current?.inspectTerrain?.();
  }, []);

  const locateByQuery = useCallback(
    (query: string) => commandsRef.current?.locateByQuery?.(query) ?? Promise.resolve(false),
    [],
  );

  const setBasemap = useCallback((basemap: BasemapId) => {
    setMapCommandState((current) => ({ ...current, basemap, basemapSourceKind: 'basemap' }));
  }, []);

  const setCesiumImagery = useCallback((imagery: CesiumImageryId) => {
    setMapCommandState((current) => ({ ...current, basemapSourceKind: 'imagery', cesiumImagery: imagery }));
  }, []);

  const setCesiumTerrain = useCallback((terrain: CesiumTerrainId) => {
    setMapCommandState((current) => ({ ...current, cesiumTerrain: terrain }));
  }, []);

  const setDisplayCrs = useCallback((displayCrs: DisplayCrsId) => {
    commandsRef.current?.syncViewport?.();
    setMapCommandState((current) => ({
      ...current,
      displayCrs,
      mapMode: displayCrs === 'webMercator' ? current.mapMode : 'planar',
    }));
  }, []);

  const setMapMode = useCallback((mode: MapViewMode) => {
    commandsRef.current?.syncViewport?.();
    setMapCommandState((current) => ({
      ...current,
      mapMode: current.displayCrs === 'webMercator' ? mode : 'planar',
    }));
  }, []);

  const updateMapCommandState = useCallback((state: Partial<MapCommandState>) => {
    setMapCommandState((current) => {
      const next = { ...current, ...state };

      if (next.displayCrs !== 'webMercator') {
        next.mapMode = 'planar';
      }

      return next;
    });
  }, []);

  const hasMapCommands = availableCommands.size > 0;
  const value = useMemo(
    () => ({
      canRunMapCommand,
      hasMapCommands,
      hasTerrainDiagnostic,
      mapCommandState,
      locateByQuery,
      registerMapCommands,
      runMapCommand,
      runTerrainDiagnostic,
      setBasemap,
      setCesiumImagery,
      setCesiumTerrain,
      setDisplayCrs,
      setMapMode,
      updateMapCommandState,
    }),
    [canRunMapCommand, hasMapCommands, hasTerrainDiagnostic, locateByQuery, mapCommandState, registerMapCommands, runMapCommand, runTerrainDiagnostic, setBasemap, setCesiumImagery, setCesiumTerrain, setDisplayCrs, setMapMode, updateMapCommandState],
  );

  return <MapCommandContext.Provider value={value}>{children}</MapCommandContext.Provider>;
}

export function useMapCommands() {
  const value = useContext(MapCommandContext);

  if (!value) {
    throw new Error('useMapCommands must be used inside MapCommandProvider');
  }

  return value;
}
