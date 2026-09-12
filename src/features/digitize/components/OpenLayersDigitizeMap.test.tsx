// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type maplibregl from 'maplibre-gl';
import { OpenLayersDigitizeMap } from './OpenLayersDigitizeMap';
import { DigitizeStoreProvider } from '../stores/DigitizeContext';
import { createDigitizeStore } from '../stores/digitizeStore';
import { createDigitizeInput, createMemoryDigitizePort } from '../testing/digitizeFixtures';
import type { DigitizeMapInput } from '../adapters/digitizeMapTypes';
import type { DigitizeMapHandle } from '../types';

const bridge = vi.hoisted(() => ({ create: vi.fn(), input: null as DigitizeMapInput | null }));
vi.mock('../adapters/openLayersDigitizeAdapter', () => ({ createOpenLayersDigitizeMap: bridge.create }));
vi.mock('../stores/useDigitizeMapInput', () => ({ useDigitizeMapInput: () => bridge.input }));
function createRuntime() {
  return { sync: vi.fn(), setState: vi.fn(), setHost: vi.fn(), setVisible: vi.fn(), locate: vi.fn(), resetNorth: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), syncFromMapLibre: vi.fn(), cancel: vi.fn(), dispose: vi.fn() };
}
beforeEach(() => { bridge.input = createDigitizeInput(); bridge.create.mockImplementation(createRuntime); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('React digitize map bridge', () => {
  it('keeps one engine across state, input, host and visibility changes and exposes navigation', () => {
    const store = createDigitizeStore(); const memory = createMemoryDigitizePort(); const ref = createRef<DigitizeMapHandle>();
    const element = (visible: boolean, host: maplibregl.Map | null = null) => <DigitizeStoreProvider port={memory.port} store={store}><OpenLayersDigitizeMap ref={ref} mapLibreMap={host} visible={visible} /></DigitizeStoreProvider>;
    const view = render(element(true)); const runtime = bridge.create.mock.results[0].value as ReturnType<typeof createRuntime>;
    expect(runtime.sync).toHaveBeenCalledWith(bridge.input); expect(runtime.setVisible).toHaveBeenLastCalledWith(true);
    act(() => { store.actions.setSnapEnabled(false); }); expect(runtime.setState).toHaveBeenLastCalledWith(expect.objectContaining({ snapEnabled: false }));
    bridge.input = { ...bridge.input!, uploadedLayerVisibility: { points: false } };
    const host = {} as maplibregl.Map; view.rerender(element(false, host));
    expect(runtime.sync).toHaveBeenLastCalledWith(bridge.input); expect(runtime.setHost).toHaveBeenLastCalledWith(host);
    expect(runtime.setVisible).toHaveBeenLastCalledWith(false); expect(bridge.create).toHaveBeenCalledTimes(1);
    expect(view.container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    ref.current!.zoomIn(); ref.current!.zoomOut(); ref.current!.locate(); ref.current!.resetNorth(); ref.current!.syncFromMapLibre();
    [runtime.zoomIn, runtime.zoomOut, runtime.locate, runtime.resetNorth, runtime.syncFromMapLibre].forEach(command => expect(command).toHaveBeenCalledTimes(1));
    view.unmount(); expect(runtime.dispose).toHaveBeenCalledTimes(1); expect(ref.current).toBeNull();
  });

  it('disposes replaced services and safely remounts under React StrictMode', () => {
    const first = createMemoryDigitizePort(); const second = createMemoryDigitizePort();
    const element = (port: typeof first.port) => <StrictMode><DigitizeStoreProvider port={port}><OpenLayersDigitizeMap mapLibreMap={null} visible /></DigitizeStoreProvider></StrictMode>;
    const view = render(element(first.port));
    const initial = bridge.create.mock.results.map(result => result.value as ReturnType<typeof createRuntime>);
    expect(initial).toHaveLength(2); expect(initial[0].dispose).toHaveBeenCalledTimes(1);
    view.rerender(element(second.port)); expect(initial[1].dispose).toHaveBeenCalledTimes(1);
    view.unmount(); bridge.create.mock.results.forEach(result => expect(result.value.dispose).toHaveBeenCalledTimes(1));
  });
});
