// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Observable from 'ol/Observable.js';
import View from 'ol/View.js';
import type Map from 'ol/Map.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { createDigitizeViewportAdapter, digitizeDefaultCenter } from './digitizeViewportAdapter';
import type { DigitizeHostMap } from './digitizeMapTypes';

class ViewMap extends Observable {
  view = new View({ center: fromLonLat([10, 50]), zoom: 5 });
  size: number[] | undefined = [800, 600];
  updateSize = vi.fn();
  getView() { return this.view; }
  getSize() { return this.size; }
}

function createHost() {
  let center = [11, 51]; let zoom = 6;
  let extent = [10, 50, 12, 52];
  let bounded = true;
  const listeners = new Set<() => void>();
  const move = () => listeners.forEach(listener => listener());
  const host = {
    getCenter: () => ({ lng: center[0], lat: center[1], toArray: () => [...center] }),
    getZoom: () => zoom,
    getBounds: () => bounded ? { getWest: () => extent[0], getSouth: () => extent[1], getEast: () => extent[2], getNorth: () => extent[3], toArray: () => [[extent[0], extent[1]], [extent[2], extent[3]]] } : null,
    on: vi.fn((_event: string, callback: () => void) => listeners.add(callback)),
    off: vi.fn((_event: string, callback: () => void) => listeners.delete(callback)),
    fitBounds: vi.fn((bounds: number[][]) => { extent = bounds.flat(); center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2]; move(); }),
    jumpTo: vi.fn((options: { center?: number[]; zoom?: number }) => { center = options.center ?? center; zoom = options.zoom ?? zoom; move(); }),
  };
  return { host, port: host as unknown as DigitizeHostMap, listeners, move, setBounds: (next: number[]) => { extent = next; move(); }, unbounded: () => { bounded = false; } };
}

let adapters: ReturnType<typeof createDigitizeViewportAdapter>[];
let resized: ResizeObserverCallback;
const observe = vi.fn(); const disconnect = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); adapters = [];
  vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resized = callback; } observe = observe; disconnect = disconnect; });
});
afterEach(() => { adapters.forEach(adapter => adapter.dispose()); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup() {
  const map = new ViewMap(); const report = vi.fn();
  const container = document.createElement('div');
  const adapter = createDigitizeViewportAdapter(map as unknown as Map, container, report);
  adapters.push(adapter);
  return { map, adapter, report, container };
}

describe('digitize viewport bridge', () => {
  it('imports visible host bounds and suppresses feedback from its own publications', () => {
    const { map, adapter, report } = setup(); const { port, host } = createHost();
    adapter.setHost(port); adapter.setVisible(true); vi.runAllTimers();
    const center = toLonLat(map.view.getCenter()!);
    expect(center[0]).toBeCloseTo(11); expect(center[1]).toBeCloseTo(51, 1);
    expect(host.fitBounds).not.toHaveBeenCalled();
    map.view.setCenter(fromLonLat([13, 52])); map.dispatchEvent('moveend');
    expect(host.fitBounds).toHaveBeenCalledTimes(1);
    expect(host.jumpTo).toHaveBeenCalledWith({ pitch: 0, bearing: 0 });
    map.dispatchEvent('moveend'); expect(host.fitBounds).toHaveBeenCalledTimes(1); expect(report).not.toHaveBeenCalled();
  });

  it('does not overwrite the host when hidden before the first synchronization frame', () => {
    const { adapter } = setup(); const { port, host } = createHost();
    adapter.setHost(port); adapter.setVisible(true); adapter.setVisible(false); vi.runAllTimers();
    expect(host.fitBounds).not.toHaveBeenCalled(); expect(host.jumpTo).not.toHaveBeenCalled();
  });

  it('detaches old host events and pauses synchronization while hidden', () => {
    const { adapter, map } = setup(); const first = createHost(); const second = createHost();
    adapter.setHost(first.port); adapter.setVisible(true); vi.runAllTimers();
    adapter.setHost(second.port); vi.runAllTimers();
    expect(first.listeners.size).toBe(0); expect(second.listeners.size).toBe(1);
    adapter.setVisible(false); const center = map.view.getCenter();
    second.setBounds([20, 40, 22, 42]); map.dispatchEvent('moveend');
    expect(map.view.getCenter()).toEqual(center); expect(second.host.fitBounds).not.toHaveBeenCalled();
    adapter.setVisible(true); vi.runAllTimers(); expect(toLonLat(map.view.getCenter()!)[0]).toBeCloseTo(21);
  });

  it('uses the existing zoom conversion when bounds or viewport size are unavailable', () => {
    const { adapter, map } = setup(); const { port, host, unbounded } = createHost();
    unbounded(); map.size = undefined;
    adapter.setHost(port); adapter.setVisible(true); vi.runAllTimers();
    expect(map.view.getZoom()).toBe(7);
    adapter.zoomIn(); expect(map.view.getZoom()).toBe(8); expect(host.jumpTo).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 7, pitch: 0, bearing: 0 }));
    adapter.zoomOut(); expect(map.view.getZoom()).toBe(7);
    map.view.setRotation(1); adapter.resetNorth(); expect(map.view.getRotation()).toBe(0);
    adapter.locate(); expect(toLonLat(map.view.getCenter()!)[0]).toBeCloseTo(digitizeDefaultCenter[0]);
  });

  it('coalesces resize events and releases observers, listeners and animation frames', () => {
    const { adapter, map, container } = setup(); const { port, listeners } = createHost();
    adapter.setHost(port); adapter.setVisible(true); vi.runAllTimers(); map.updateSize.mockClear();
    resized([], {} as ResizeObserver); resized([], {} as ResizeObserver); vi.runAllTimers();
    expect(map.updateSize).toHaveBeenCalledTimes(1); expect(observe).toHaveBeenCalledWith(container);
    resized([], {} as ResizeObserver); adapter.dispose(); adapter.dispose(); vi.runAllTimers();
    expect(map.updateSize).toHaveBeenCalledTimes(1); expect(listeners.size).toBe(0); expect(disconnect).toHaveBeenCalledTimes(1);
    expect(map.hasListener('moveend')).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });

  it('reports host failures and can recover on a subsequent synchronization', () => {
    const { adapter, report } = setup(); const { port, host } = createHost();
    vi.spyOn(host, 'getBounds').mockImplementationOnce(() => { throw new Error('Host not ready'); });
    adapter.setHost(port); adapter.setVisible(true); vi.runAllTimers();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'Host not ready' }));
    adapter.syncFromMapLibre(); report.mockClear(); adapter.zoomIn(); expect(report).not.toHaveBeenCalled();
  });
});
