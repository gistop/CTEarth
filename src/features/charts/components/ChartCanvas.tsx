import { useEffect, useRef, useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { createEChartsRuntime } from '../adapters/echartsAdapter';
import type { ChartModel, ChartRuntime } from '../types';

export function ChartCanvas({ model }: { model: ChartModel }) {
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<ChartRuntime | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!container.current) return;
    try { runtime.current = createEChartsRuntime(container.current, reason => setError(reason.message)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '图表初始化失败。'); }
    return () => { runtime.current?.dispose(); runtime.current = null; };
  }, [attempt]);
  useEffect(() => { if (runtime.current) { setError(''); runtime.current.setModel(model); } }, [model, attempt]);
  return <div className="attribute-chart-body">
    <div className="attribute-chart-canvas" ref={container} />
    {error ? <div className="attribute-chart-no-data" role="alert"><span>{error}</span><button type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>重试图表</button></div>
      : model.kind === 'empty' ? <div className="attribute-chart-no-data"><ChartColumn size={22} /><span>{model.summary}</span></div> : null}
  </div>;
}
