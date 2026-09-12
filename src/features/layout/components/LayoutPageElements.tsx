import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutElementId, LayoutState } from '../types';
import type { LayoutMapRuntime } from '../adapters/layoutMapTypes';
import { LayoutAdornment, LayoutMapFrame } from './LayoutElements';

export function LayoutPageElements({ state, pxPerMm, interactive = false, onBeginDrag, onRuntimeChange }: {
  state: LayoutState;
  pxPerMm: number;
  interactive?: boolean;
  onBeginDrag?: (id: LayoutElementId, event: ReactPointerEvent<HTMLElement>, mode?: 'move' | 'resize') => void;
  onRuntimeChange?: (runtime: LayoutMapRuntime | null) => void;
}) {
  const [northArrowTarget, setNorthArrowTarget] = useState<HTMLDivElement | null>(null);
  const [scaleBarTarget, setScaleBarTarget] = useState<HTMLDivElement | null>(null);
  return <>{state.enabledElements.map((id) => {
    const props = {
      rect: state.rects[id],
      active: interactive && state.selectedElementIds[0] === id,
      selected: interactive && state.selectedElementIds.includes(id),
      zoomScale: pxPerMm,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => onBeginDrag?.(id, event),
      onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => onBeginDrag?.(id, event, 'resize'),
    };
    return id === 'map-frame'
      ? <LayoutMapFrame key={id} {...props} northArrowTarget={northArrowTarget} scaleBarTarget={scaleBarTarget} onRuntimeChange={onRuntimeChange} />
      : <LayoutAdornment key={id} {...props} elementId={id} hostRef={id === 'north-arrow' ? setNorthArrowTarget : id === 'scale-bar' ? setScaleBarTarget : undefined} />;
  })}</>;
}
