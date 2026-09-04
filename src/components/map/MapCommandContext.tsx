import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { type CesiumImageryId, type CesiumTerrainId, defaultCesiumImageryId, defaultCesiumTerrainId } from './cesiumLayerOptions';
import { defaultBasemapId } from './basemapOptions';
import type { BasemapId } from './basemapOptions';
export type { BasemapId } from './basemapOptions';
export type DisplayCrsId = 'webMercator' | 'wgs84' | 'epsg32651';
export type MapViewMode = 'planar' | 'terrain' | 'globe';

export type MapCommand = 'zoomIn' | 'zoomOut' | 'resetNorth' | 'toggleDragRotate' | 'locate';

export type MapCommands = Record<MapCommand, () => void> & {
  setBasemap: (basemap: BasemapId) => void;
  setCesiumImagery: (imagery: CesiumImageryId) => void;
  setCesiumTerrain: (terrain: CesiumTerrainId) => void;
  setDisplayCrs: (displayCrs: DisplayCrsId) => void;
  setMapMode: (mode: MapViewMode) => void;
  locateByQuery: (query: string) => Promise<boolean>;
  syncViewport: () => void;
};

export type MapCommandState = {
  basemap: BasemapId;
  cesiumImagery: CesiumImageryId;
  cesiumTerrain: CesiumTerrainId;
  displayCrs: DisplayCrsId;
  dragRotateEnabled: boolean;
  mapMode: MapViewMode;
};

type MapCommandContextValue = {
  hasMapCommands: boolean;
  mapCommandState: MapCommandState;
  registerMapCommands: (commands: MapCommands) => () => void;
  runMapCommand: (command: MapCommand) => void;
  locateByQuery: (query: string) => Promise<boolean>;
  setBasemap: (basemap: BasemapId) => void;
  setCesiumImagery: (imagery: CesiumImageryId) => void;
  setCesiumTerrain: (terrain: CesiumTerrainId) => void;
  setDisplayCrs: (displayCrs: DisplayCrsId) => void;
  setMapMode: (mode: MapViewMode) => void;
  updateMapCommandState: (state: Partial<MapCommandState>) => void;
};

const MapCommandContext = createContext<MapCommandContextValue | null>(null);
const defaultMapCommandState: MapCommandState = {
  basemap: defaultBasemapId,
  cesiumImagery: defaultCesiumImageryId,
  cesiumTerrain: defaultCesiumTerrainId,
  displayCrs: 'webMercator',
  dragRotateEnabled: false,
  mapMode: 'planar',
};

export function MapCommandProvider({ children }: { children: ReactNode }) {
  const commandsRef = useRef<MapCommands | null>(null);
  const [hasMapCommands, setHasMapCommands] = useState(false);
  const [mapCommandState, setMapCommandState] = useState<MapCommandState>(defaultMapCommandState);

  const registerMapCommands = useCallback((commands: MapCommands) => {
    commandsRef.current = commands;
    setHasMapCommands(true);

    return () => {
      if (commandsRef.current === commands) {
        commandsRef.current = null;
        setHasMapCommands(false);
      }
    };
  }, []);

  const runMapCommand = useCallback((command: MapCommand) => {
    commandsRef.current?.[command]();
  }, []);

  const locateByQuery = useCallback((query: string) => commandsRef.current?.locateByQuery(query) ?? Promise.resolve(false), []);

  const setBasemap = useCallback((basemap: BasemapId) => {
    setMapCommandState((current) => ({ ...current, basemap }));
    commandsRef.current?.setBasemap(basemap);
  }, []);

  const setCesiumImagery = useCallback((imagery: CesiumImageryId) => {
    setMapCommandState((current) => ({ ...current, cesiumImagery: imagery }));
    commandsRef.current?.setCesiumImagery(imagery);
  }, []);

  const setCesiumTerrain = useCallback((terrain: CesiumTerrainId) => {
    setMapCommandState((current) => ({ ...current, cesiumTerrain: terrain }));
    commandsRef.current?.setCesiumTerrain(terrain);
  }, []);

  const setDisplayCrs = useCallback((displayCrs: DisplayCrsId) => {
    commandsRef.current?.syncViewport();
    setMapCommandState((current) => ({
      ...current,
      displayCrs,
      mapMode: displayCrs !== 'webMercator' ? 'planar' : current.mapMode,
    }));
    commandsRef.current?.setDisplayCrs(displayCrs);
  }, []);

  const setMapMode = useCallback((mode: MapViewMode) => {
    setMapCommandState((current) => ({ ...current, mapMode: mode }));
    commandsRef.current?.setMapMode(mode);
  }, []);

  const updateMapCommandState = useCallback((state: Partial<MapCommandState>) => {
    setMapCommandState((current) => ({ ...current, ...state }));
  }, []);

  const value = useMemo(
    () => ({
      hasMapCommands,
      mapCommandState,
      locateByQuery,
      registerMapCommands,
      runMapCommand,
      setBasemap,
      setCesiumImagery,
      setCesiumTerrain,
      setDisplayCrs,
      setMapMode,
      updateMapCommandState,
    }),
    [hasMapCommands, locateByQuery, mapCommandState, registerMapCommands, runMapCommand, setBasemap, setCesiumImagery, setCesiumTerrain, setDisplayCrs, setMapMode, updateMapCommandState],
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
