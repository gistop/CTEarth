import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type BasemapId = 'osm' | 'tianditu' | 'esri';

export type MapCommand = 'zoomIn' | 'zoomOut' | 'resetNorth' | 'toggleDragRotate' | 'locate';

export type MapCommands = Record<MapCommand, () => void> & {
  setBasemap: (basemap: BasemapId) => void;
};

export type MapCommandState = {
  basemap: BasemapId;
  dragRotateEnabled: boolean;
};

type MapCommandContextValue = {
  hasMapCommands: boolean;
  mapCommandState: MapCommandState;
  registerMapCommands: (commands: MapCommands) => () => void;
  runMapCommand: (command: MapCommand) => void;
  setBasemap: (basemap: BasemapId) => void;
  updateMapCommandState: (state: Partial<MapCommandState>) => void;
};

const MapCommandContext = createContext<MapCommandContextValue | null>(null);
const defaultMapCommandState: MapCommandState = {
  basemap: 'osm',
  dragRotateEnabled: false,
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
        setMapCommandState(defaultMapCommandState);
      }
    };
  }, []);

  const runMapCommand = useCallback((command: MapCommand) => {
    commandsRef.current?.[command]();
  }, []);

  const setBasemap = useCallback((basemap: BasemapId) => {
    commandsRef.current?.setBasemap(basemap);
  }, []);

  const updateMapCommandState = useCallback((state: Partial<MapCommandState>) => {
    setMapCommandState((current) => ({ ...current, ...state }));
  }, []);

  const value = useMemo(
    () => ({
      hasMapCommands,
      mapCommandState,
      registerMapCommands,
      runMapCommand,
      setBasemap,
      updateMapCommandState,
    }),
    [hasMapCommands, mapCommandState, registerMapCommands, runMapCommand, setBasemap, updateMapCommandState],
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
