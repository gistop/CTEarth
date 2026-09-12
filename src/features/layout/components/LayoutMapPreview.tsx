import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createOpenLayersLayoutMap } from '../adapters/openLayersLayoutMapAdapter';
import type { LayoutMapRuntime } from '../adapters/layoutMapTypes';
import { useLayout } from '../stores/LayoutContext';
import { useLayoutMapInput } from '../stores/useLayoutMapInput';

export function LayoutMapPreview({ northArrowTarget, scaleBarTarget, onRuntimeChange }: {
  northArrowTarget: HTMLDivElement | null;
  scaleBarTarget: HTMLDivElement | null;
  onRuntimeChange?: (runtime: LayoutMapRuntime | null) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const runtime = useRef<LayoutMapRuntime | null>(null);
  const input = useLayoutMapInput();
  const { pxPerMm, mapGraticuleVisible, mapView, setMapView } = useLayout();
  const [error, setError] = useState('');
  const options = useMemo(() => ({ pxPerMm, graticuleVisible: mapGraticuleVisible, view: mapView, onViewChange: setMapView }), [pxPerMm, mapGraticuleVisible, mapView, setMapView]);

  useLayoutEffect(() => {
    if (!container.current) return;
    const instance = createOpenLayersLayoutMap(container.current, options);
    runtime.current = instance;
    return () => {
      runtime.current = null;
      instance.dispose();
    };
  }, []);

  useLayoutEffect(() => {
    onRuntimeChange?.(runtime.current);
    return () => onRuntimeChange?.(null);
  }, [onRuntimeChange]);

  useLayoutEffect(() => {
    try {
      runtime.current?.setOptions(options);
      runtime.current?.sync(input);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '布局地图更新失败。');
    }
  }, [input, options]);

  useLayoutEffect(() => { runtime.current?.setTargets(northArrowTarget, scaleBarTarget); }, [northArrowTarget, scaleBarTarget]);

  return <>
    <div ref={container} className="layout-map-preview-map" aria-hidden="true" />
    {error ? <div className="layout-map-preview-placeholder" role="status">{error}</div> : null}
  </>;
}
