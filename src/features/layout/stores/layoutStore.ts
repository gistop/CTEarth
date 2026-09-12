import type { LayoutAlignMode, LayoutCommand, LayoutElementId, LayoutMapView, LayoutOrderDirection, LayoutRect, LayoutSelectMode, LayoutState, LayoutTool, PaperPresetId } from '../types';
import { createDefaultLayoutState, layoutReducer } from '../services/layoutDocumentService';

function freezeState(state: LayoutState) {
  Object.values(state.rects).forEach(Object.freeze);
  Object.freeze(state.rects);
  Object.freeze(state.enabledElements);
  Object.freeze(state.selectedElementIds);
  if (state.mapView) {
    Object.freeze(state.mapView.center3857);
    Object.freeze(state.mapView);
  }
  return Object.freeze(state);
}

export function createLayoutStore() {
  let state: LayoutState = freezeState(createDefaultLayoutState());
  const listeners = new Set<() => void>();
  const execute = (command: LayoutCommand) => {
    const next = layoutReducer(state, command);
    if (JSON.stringify(next) === JSON.stringify(state)) return state;
    state = freezeState(next);
    listeners.forEach((listener) => listener());
    return state;
  };
  const actions = {
    setPaperId: (paperId: PaperPresetId) => execute({ type: 'set-paper', paperId }),
    updateZoom: (zoom: number) => execute({ type: 'set-zoom', zoom }),
    setTool: (tool: LayoutTool) => execute({ type: 'set-tool', tool }),
    setSelectMode: (mode: LayoutSelectMode) => execute({ type: 'set-select-mode', mode }),
    setAlignMode: (mode: LayoutAlignMode) => execute({ type: 'set-align-mode', mode }),
    setSelectedElementId: (elementId: LayoutElementId) => execute({ type: 'set-selection', elementIds: [elementId] }),
    setSelectedElementIds: (elementIds: LayoutElementId[]) => execute({ type: 'set-selection', elementIds }),
    toggleElement: (elementId: LayoutElementId) => execute({ type: 'toggle-element', elementId }),
    updateRectangles: (rects: Partial<Record<LayoutElementId, LayoutRect>>) => execute({ type: 'update-rects', rects }),
    alignSelectedElement: (mode: LayoutAlignMode) => execute({ type: 'align-selection', mode }),
    moveSelectedElements: (direction: LayoutOrderDirection) => execute({ type: 'reorder-selection', direction }),
    setMapGraticuleVisible: (visible: boolean) => execute({ type: 'set-graticule', visible }),
    setMapView: (view: LayoutMapView) => execute({ type: 'set-map-view', view }),
    resetLayout: () => execute({ type: 'reset' }),
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    execute,
    actions,
  };
}

export type LayoutStore = ReturnType<typeof createLayoutStore>;
