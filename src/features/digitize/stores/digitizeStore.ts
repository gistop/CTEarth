import type { DigitizeCommand, DigitizeGeometryType, DigitizeState, RasterAoiPolygon } from '../types';
import { createDefaultDigitizeState, digitizeReducer } from '../services/digitizeStateService';

function freezeState(state: DigitizeState) {
  if (state.rasterAoi) {
    state.rasterAoi.coordinates.forEach(ring => { ring.forEach(Object.freeze); Object.freeze(ring); });
    Object.freeze(state.rasterAoi.coordinates);
    Object.freeze(state.rasterAoi);
  }
  return Object.freeze(state);
}

export function createDigitizeStore() {
  let state = freezeState(createDefaultDigitizeState());
  const listeners = new Set<() => void>();
  const execute = (command: DigitizeCommand) => {
    const next = digitizeReducer(state, command);
    if (JSON.stringify(next) === JSON.stringify(state)) return state;
    state = freezeState(next);
    listeners.forEach(listener => listener());
    return state;
  };
  const actions = {
    setActiveTool: (tool: DigitizeGeometryType) => execute({ type: 'set-tool', tool }),
    setEditingActive: (active: boolean) => execute({ type: 'set-editing', active }),
    toggleModify: () => execute({ type: 'toggle-modify' }),
    setSnapEnabled: (enabled: boolean) => execute({ type: 'set-snap', enabled }),
    setTraceEnabled: (enabled: boolean) => execute({ type: 'set-trace', enabled }),
    setStatus: (status: string) => execute({ type: 'set-status', status }),
    setFeatureCount: (count: number) => execute({ type: 'set-feature-count', count }),
    startRasterAoi: () => execute({ type: 'start-aoi' }),
    setRasterAoi: (polygon: RasterAoiPolygon | null) => execute({ type: 'set-aoi', polygon }),
    clearRasterAoi: () => execute({ type: 'clear-aoi' }),
    setRasterPixelValuesVisible: (visible: boolean) => execute({ type: 'set-raster-values', visible }),
  };
  return { getSnapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, execute, actions };
}

export type DigitizeStore = ReturnType<typeof createDigitizeStore>;
