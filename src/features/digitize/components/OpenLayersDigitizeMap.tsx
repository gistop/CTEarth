import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import { createOpenLayersDigitizeMap } from '../adapters/openLayersDigitizeAdapter';
import type { DigitizeMapRuntime } from '../adapters/digitizeMapTypes';
import type { DigitizeMapHandle } from '../types';
import { useDigitize, useDigitizeServices } from '../stores/DigitizeContext';
import { useDigitizeMapInput } from '../stores/useDigitizeMapInput';

export const OpenLayersDigitizeMap = forwardRef<DigitizeMapHandle, { mapLibreMap: maplibregl.Map | null; visible: boolean }>(
function OpenLayersDigitizeMap({ mapLibreMap, visible }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<DigitizeMapRuntime | null>(null);
  const state = useDigitize();
  const { store, edits } = useDigitizeServices();
  const input = useDigitizeMapInput();
  useImperativeHandle(ref, () => ({
    locate: () => runtime.current?.locate(), resetNorth: () => runtime.current?.resetNorth(),
    syncFromMapLibre: () => runtime.current?.syncFromMapLibre(), zoomIn: () => runtime.current?.zoomIn(), zoomOut: () => runtime.current?.zoomOut(),
  }), []);
  useLayoutEffect(() => {
    if (!container.current) return;
    const instance = createOpenLayersDigitizeMap(container.current, { edits, ...store.actions });
    runtime.current = instance;
    return () => { runtime.current = null; instance.dispose(); };
  }, [edits, store]);
  useLayoutEffect(() => { runtime.current?.setState(state); }, [state, edits, store]);
  useLayoutEffect(() => { runtime.current?.sync(input); }, [input, edits, store]);
  useLayoutEffect(() => { runtime.current?.setHost(mapLibreMap); }, [mapLibreMap, edits, store]);
  useLayoutEffect(() => { runtime.current?.setVisible(visible); }, [visible, edits, store]);
  return <div ref={container} className={`openlayers-digitize-map${visible ? ' is-visible' : ''}`} aria-hidden={!visible} />;
});
