// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEChartsRuntime, toEChartsOption } from './echartsAdapter';
import type { ChartModel, ChartRuntime } from '../types';

const engine = vi.hoisted(() => ({ init: vi.fn(), setOption: vi.fn(), resize: vi.fn(), clear: vi.fn(), dispose: vi.fn() }));
vi.mock('echarts/core', () => ({ init: engine.init, use: vi.fn() }));
const model: ChartModel = { kind: 'bar', title: 'name 分布', categories: [{ name: 'A', value: 2 }], summary: '1 个分类' };
let resized: ResizeObserverCallback;
const disconnect = vi.fn(); const observe = vi.fn();
let runtimes: ChartRuntime[];
beforeEach(() => {
  vi.useFakeTimers(); runtimes = [];
  engine.init.mockReturnValue(engine);
  vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resized = callback; } observe = observe; disconnect = disconnect; });
});
afterEach(() => { runtimes.forEach(runtime => runtime.dispose()); vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function setup() {
  const container = document.createElement('div');
  Object.defineProperties(container, { clientWidth: { value: 800, configurable: true }, clientHeight: { value: 400, configurable: true } });
  const report = vi.fn(); const runtime = createEChartsRuntime(container, report); runtimes.push(runtime);
  return { container, report, runtime };
}

describe('ECharts boundary', () => {
  it('replaces options across chart kinds and clears empty models', () => {
    const { runtime } = setup(); runtime.setModel(model); runtime.setModel({ ...model, kind: 'pie' });
    expect(engine.init).toHaveBeenCalledTimes(1);
    expect(engine.setOption).toHaveBeenLastCalledWith(expect.objectContaining({ series: [expect.objectContaining({ type: 'pie' })] }), { notMerge: true });
    runtime.setModel({ ...model, kind: 'empty' }); expect(engine.clear).toHaveBeenCalledTimes(1);
  });

  it('keeps model data engine-independent and renders user labels without HTML tooltips', () => {
    const source = { ...model, kind: 'pie' as const, categories: [{ name: '<img src=x>', value: 4 }] };
    const option = toEChartsOption(source) as { tooltip: { renderMode: string }; series: { data: { name: string; value: number }[] }[] };
    expect(option.tooltip.renderMode).toBe('richText'); option.series[0].data[0].value = 99;
    expect(source.categories[0].value).toBe(4);
    const long = toEChartsOption({ ...model, categories: Array.from({ length: 15 }, (_, index) => ({ name: String(index), value: 1 })) });
    expect(long.dataZoom).toHaveLength(2); expect(toEChartsOption(model).dataZoom).toEqual([]);
  });

  it('coalesces resizes and skips zero-sized hidden canvases', () => {
    const { container, runtime } = setup(); runtime.setModel(model); resized([], {} as ResizeObserver); resized([], {} as ResizeObserver);
    vi.runAllTimers(); expect(engine.resize).toHaveBeenCalledTimes(1); expect(observe).toHaveBeenCalledWith(container);
    Object.defineProperty(container, 'clientWidth', { value: 0 }); runtime.resize(); vi.runAllTimers(); expect(engine.resize).toHaveBeenCalledTimes(1);
  });

  it('releases observers and pending animation work exactly once', () => {
    const { runtime } = setup(); runtime.setModel(model); runtime.dispose(); runtime.dispose(); runtime.setModel(model); runtime.resize(); vi.runAllTimers();
    expect(engine.dispose).toHaveBeenCalledTimes(1); expect(disconnect).toHaveBeenCalledTimes(1); expect(engine.setOption).toHaveBeenCalledTimes(1);
    expect(engine.resize).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('reports update failures and permits a later valid update', () => {
    const { runtime, report } = setup(); engine.setOption.mockImplementationOnce(() => { throw new Error('Broken chart'); });
    runtime.setModel(model); expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'Broken chart' }));
    report.mockClear(); runtime.setModel(model); expect(report).not.toHaveBeenCalled();
  });

  it('cleans the engine if observer setup fails', () => {
    observe.mockImplementationOnce(() => { throw new Error('observer failed'); });
    expect(() => setup()).toThrow('observer failed'); expect(engine.dispose).toHaveBeenCalledTimes(1); expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('uses a disposable window-resize fallback when ResizeObserver is absent', () => {
    vi.stubGlobal('ResizeObserver', undefined); const { runtime } = setup();
    window.dispatchEvent(new Event('resize')); vi.runAllTimers(); expect(engine.resize).toHaveBeenCalledTimes(1);
    runtime.dispose(); window.dispatchEvent(new Event('resize')); vi.runAllTimers(); expect(engine.resize).toHaveBeenCalledTimes(1);
  });
});
