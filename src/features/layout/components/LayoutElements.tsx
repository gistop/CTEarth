import { lazy, Suspense, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutElementId, LayoutRect } from '../types';
import type { LayoutMapRuntime } from '../adapters/layoutMapTypes';

const LayoutMapPreview = lazy(() => import('./LayoutMapPreview').then(module => ({ default: module.LayoutMapPreview })));

export function LayoutMapFrame({
  onRuntimeChange,
  rect,
  active,
  selected,
  northArrowTarget,
  scaleBarTarget,
  zoomScale,
  onPointerDown,
  onResizePointerDown,
}: {
  rect: LayoutRect;
  active: boolean;
  selected: boolean;
  onRuntimeChange?: (runtime: LayoutMapRuntime | null) => void;
  northArrowTarget: HTMLDivElement | null;
  scaleBarTarget: HTMLDivElement | null;
  zoomScale: number;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className={[ 'layout-map-frame', selected ? 'is-selected' : '', active ? 'is-active' : '' ].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      aria-label="地图框"
      style={rectToStyle(rect, zoomScale)}
      onPointerDown={onPointerDown}
    >
      <Suspense fallback={<div className="layout-map-preview-map" aria-hidden="true" />}>
        <LayoutMapPreview onRuntimeChange={onRuntimeChange} northArrowTarget={northArrowTarget} scaleBarTarget={scaleBarTarget} />
      </Suspense>
      {active ? <span className="layout-resize-handle se" aria-hidden="true" onPointerDown={onResizePointerDown} /> : null}
    </div>
  );
}

export function LayoutAdornment({
  elementId,
  rect,
  active,
  selected,
  hostRef,
  zoomScale,
  onPointerDown,
  onResizePointerDown,
}: {
  elementId: LayoutElementId;
  rect: LayoutRect;
  active: boolean;
  selected: boolean;
  hostRef?: (node: HTMLDivElement | null) => void;
  zoomScale: number;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const className = [
    'layout-adornment',
    `layout-${elementId}`,
    active ? 'is-active' : '',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      aria-label={elementLabel(elementId)}
      style={rectToStyle(rect, zoomScale)}
      onPointerDown={onPointerDown}
    >
      {elementId === 'title' ? <strong>地图标题</strong> : null}
      {elementId === 'north-arrow' ? <div ref={hostRef} className="layout-control-host layout-north-arrow-host" aria-hidden="true" /> : null}
      {elementId === 'scale-bar' ? <div ref={hostRef} className="layout-control-host layout-scale-bar-host" aria-hidden="true" /> : null}
      {active ? <span className="layout-resize-handle se" aria-hidden="true" onPointerDown={onResizePointerDown} /> : null}
    </div>
  );
}

export function rectToStyle(rect: LayoutRect, scale: number): CSSProperties {
  return {
    height: `${rect.height * scale}px`,
    left: `${rect.x * scale}px`,
    top: `${rect.y * scale}px`,
    width: `${rect.width * scale}px`,
  };
}

export function elementLabel(elementId: LayoutElementId) {
  if (elementId === 'title') {
    return '标题';
  }

  if (elementId === 'north-arrow') {
    return '指北针';
  }

  if (elementId === 'scale-bar') {
    return '比例尺';
  }

  return '地图框';
}
