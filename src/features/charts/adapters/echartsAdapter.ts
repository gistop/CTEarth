import { init, use, type EChartsCoreOption } from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { DataZoomComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartModel, ChartRuntime } from '../types';

use([BarChart, PieChart, CanvasRenderer, DataZoomComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent]);

export function toEChartsOption(model: ChartModel): EChartsCoreOption {
  const title = { text: model.title, left: 14, top: 10, textStyle: { fontSize: 13, fontWeight: 650, color: '#263849' } };
  if (model.kind === 'pie') return {
    title, tooltip: { trigger: 'item', renderMode: 'richText' },
    legend: { type: 'scroll', orient: 'vertical', right: 12, top: 42, bottom: 16 },
    series: [{ name: '要素数', type: 'pie', radius: ['34%', '66%'], center: ['40%', '56%'], data: model.categories.map(category => ({ ...category })) }],
  };
  const scrolling = model.categories.length > 12;
  return {
    title, grid: { left: 44, right: 18, top: 58, bottom: scrolling ? 70 : 42 }, tooltip: { trigger: 'axis', renderMode: 'richText' },
    dataZoom: scrolling ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 22 }] : [],
    xAxis: { type: 'category', data: model.categories.map(category => category.name), axisLabel: { interval: 0, hideOverlap: true, overflow: 'truncate', width: 86 } },
    yAxis: { type: 'value', name: '要素数' },
    series: [{ name: '要素数', type: 'bar', data: model.categories.map(category => category.value), itemStyle: { color: '#1677b8' } }],
  };
}

export function createEChartsRuntime(container: HTMLElement, onError: (error: Error) => void): ChartRuntime {
  const chart = init(container, undefined, { renderer: 'canvas' });
  let disposed = false; let frame = 0;
  const safely = (action: () => void) => {
    if (disposed) return;
    try { action(); } catch (reason) { onError(reason instanceof Error ? reason : new Error('图表渲染失败。')); }
  };
  const resize = () => {
    if (disposed) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => safely(() => { if (container.clientWidth > 0 && container.clientHeight > 0) chart.resize(); }));
  };
  let observer: ResizeObserver | null = null;
  try {
    if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(resize); observer.observe(container); }
    else window.addEventListener('resize', resize);
  } catch (error) { observer?.disconnect(); chart.dispose(); throw error; }
  return {
    setModel(model) { safely(() => { if (model.kind === 'empty') chart.clear(); else chart.setOption(toEChartsOption(model), { notMerge: true }); resize(); }); },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', resize); chart.dispose();
    },
  };
}
