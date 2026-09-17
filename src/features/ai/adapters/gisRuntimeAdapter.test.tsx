// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, type ReactNode } from 'react';
import { createGisFixture } from '../testing/fixtures';
import { useGisAiPort } from './gisRuntimeAdapter';

let runtime: ReturnType<typeof createRuntime>;

vi.mock('../../../gisStore', () => ({ useGis: () => runtime }));

function createRuntime() {
  const fixture = createGisFixture();
  return { ...fixture.port.getSnapshot(), ...fixture.port };
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('React GIS runtime bridge', () => {
  it('keeps an operation port stable while exposing the latest render snapshot', () => {
    runtime = createRuntime();
    const { result, rerender } = renderHook(() => useGisAiPort());
    const port = result.current.port;
    const nextLayer = { ...runtime.layer!, id: 'new-layer' };
    runtime = { ...runtime, layer: nextLayer };
    rerender();
    expect(result.current.port).toBe(port);
    expect(result.current.snapshot.layer).toBe(nextLayer);
    expect(port.getSnapshot().layer).toBe(nextLayer);
  });

  it('waits for the exact returned GIS output to commit before the next tool can run', async () => {
    runtime = createRuntime();
    const output = createGisFixture().generatedLayer;
    runtime.runBufferAnalysis.mockResolvedValue({ ok: true, output });
    const { result, rerender } = renderHook(() => useGisAiPort());
    let settled = false;
    const pending = result.current.port.runBufferAnalysis({ distance: '1', outputName: 'buffer', quadrantSegments: '8', capStyle: 'round', joinStyle: 'round', dissolve: false });
    void pending.then(() => { settled = true; });
    await act(async () => { await Promise.resolve(); });
    expect(settled).toBe(false);
    runtime = { ...runtime, layers: [...runtime.layers, output], layer: output };
    rerender();
    await expect(pending).resolves.toEqual({ ok: true, output });
    expect(result.current.port.getSnapshot().layers).toContain(output);
  });

  it('waits for overlay outputs to commit and returns the exact generated layer', async () => {
    runtime = createRuntime();
    const output = { ...runtime.layer!, id: 'intersect-result', fileName: 'intersect.geojson' };
    runtime.runOverlayAnalysis.mockResolvedValue({ ok: true, output });
    const { result, rerender } = renderHook(() => useGisAiPort());
    let settled = false;
    const pending = result.current.port.runOverlayAnalysis('intersect', {
      inputLayerId: 'input', overlayLayerId: 'overlay', outputName: 'intersect.geojson', snapTolerance: '',
    });
    void pending.then(() => { settled = true; });
    await act(async () => { await Promise.resolve(); });
    expect(settled).toBe(false);
    runtime = { ...runtime, layers: [...runtime.layers, output], layer: output };
    rerender();
    await expect(pending).resolves.toEqual({ ok: true, output });
  });

  it('returns failed business results immediately without waiting for a render', async () => {
    runtime = createRuntime();
    runtime.runTerrainAnalysis.mockResolvedValue({ ok: false, message: 'failed' });
    const { result } = renderHook(() => useGisAiPort());
    await expect(result.current.port.runTerrainAnalysis('slope', { outputName: 'slope', zFactor: '1', units: 'degrees', altitude: '45', azimuth: '315' })).resolves.toEqual({ ok: false, message: 'failed' });
  });

  it('cancels pending commit subscriptions on unmount', async () => {
    runtime = createRuntime();
    const { result, unmount } = renderHook(() => useGisAiPort());
    const pending = result.current.port.selectByValue({ field: 'value', operator: 'equals', value: '5', selectionMode: 'new', caseSensitive: false });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await act(async () => { await Promise.resolve(); });
    unmount();
    await assertion;
  });

  it('does not hang indefinitely if the application never commits the returned result', async () => {
    vi.useFakeTimers();
    runtime = createRuntime();
    const { result } = renderHook(() => useGisAiPort());
    const pending = result.current.port.selectByValue({ field: 'value', operator: 'equals', value: '5', selectionMode: 'new', caseSensitive: false });
    const assertion = expect(pending).rejects.toThrow('勿重复执行');
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    await assertion;
  });

  it('survives StrictMode mount cleanup without disconnecting the live port', async () => {
    runtime = createRuntime();
    runtime.runIdwInterpolation.mockResolvedValue({ ok: true, output: runtime.raster! });
    const { result } = renderHook(() => useGisAiPort(), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    await expect(result.current.port.runIdwInterpolation({ layerId: 'roads', field: 'value', outputName: 'idw', cellSize: '1', weight: '2', radius: '0', minPoints: '0' })).resolves.toMatchObject({ ok: true });
  });
});
