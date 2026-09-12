// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compositeMapCanvases, waitForMapRender } from './mapCanvasCapture';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('map render completion', () => {
  beforeEach(() => vi.useFakeTimers());

  it('subscribes before rendering and cleans up on completion', async () => {
    let complete!: () => void;
    const unsubscribe = vi.fn();
    await waitForMapRender((callback) => { complete = callback; return unsubscribe; }, () => complete());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up when a subscription completes synchronously', async () => {
    const unsubscribe = vi.fn();
    const render = vi.fn();
    await waitForMapRender((complete) => { complete(); return unsubscribe; }, render);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out instead of exporting a partially loaded map', async () => {
    const unsubscribe = vi.fn();
    const pending = waitForMapRender(() => unsubscribe, vi.fn(), undefined, 100);
    const rejected = expect(pending).rejects.toThrow('限定时间');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts and removes listeners', async () => {
    const controller = new AbortController();
    const unsubscribe = vi.fn();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = waitForMapRender(() => unsubscribe, vi.fn(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not register or render for an already aborted request', async () => {
    const listen = vi.fn();
    const render = vi.fn();
    await expect(waitForMapRender(listen, render, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
    expect(listen).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it.each(['subscribe', 'render'])('cleans up after a synchronous %s failure', async (stage) => {
    const unsubscribe = vi.fn();
    const listen = () => { if (stage === 'subscribe') throw new Error(stage); return unsubscribe; };
    const render = () => { throw new Error(stage); };
    await expect(waitForMapRender(listen, render)).rejects.toThrow(stage);
    expect(vi.getTimerCount()).toBe(0);
    if (stage === 'render') expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('map canvas compositing', () => {
  function setup() {
    const context = { fillStyle: '', globalAlpha: 1, fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const viewport = document.createElement('div');
    const base = document.createElement('canvas');
    base.className = 'ol-layer';
    base.width = 800; base.height = 600;
    base.style.width = '400px'; base.style.height = '300px';
    const overlay = document.createElement('div');
    overlay.className = 'ol-layer'; overlay.style.opacity = '0.4';
    const vector = document.createElement('canvas');
    vector.width = 400; vector.height = 300;
    overlay.append(vector);
    viewport.append(base, overlay);
    return { context, viewport, base, vector, overlay };
  }

  it('composites every layer in DOM order with DPR and opacity', () => {
    const { context, viewport, base, vector } = setup();
    const opacities: number[] = [];
    context.drawImage.mockImplementation(() => opacities.push(context.globalAlpha));
    const result = compositeMapCanvases(viewport, 400, 300);
    expect([result.width, result.height]).toEqual([400, 300]);
    expect(context.drawImage.mock.calls).toEqual([[base, 0, 0], [vector, 0, 0]]);
    expect(context.setTransform).toHaveBeenNthCalledWith(1, 0.5, 0, 0, 0.5, 0, 0);
    expect(opacities).toEqual([1, 0.4]);
  });

  it('applies OpenLayers CSS matrices and skips hidden or empty canvases', () => {
    const { context, viewport, base, vector } = setup();
    vi.stubGlobal('DOMMatrixReadOnly', class { a = 0.5; b = 0; c = 0; d = 0.5; e = -10; f = 20; });
    base.style.transform = 'matrix(0.5,0,0,0.5,-10,20)';
    vector.style.display = 'none';
    const empty = document.createElement('canvas');
    empty.className = 'ol-layer'; empty.width = 0;
    viewport.append(empty);
    compositeMapCanvases(viewport, 400, 300);
    expect(context.setTransform).toHaveBeenCalledWith(0.5, 0, 0, 0.5, -10, 20);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });

  it('reports cross-origin failures rather than fabricating a replacement map', () => {
    const { context, viewport } = setup();
    context.getImageData.mockImplementation(() => { throw new DOMException('tainted', 'SecurityError'); });
    expect(() => compositeMapCanvases(viewport, 400, 300)).toThrow('跨域');
  });
});
