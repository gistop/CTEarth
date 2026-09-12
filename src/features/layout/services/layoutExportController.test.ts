import { describe, expect, it, vi } from 'vitest';
import { createLayoutExportController } from './layoutExportController';

const result = { blob: new Blob(['image']), fileName: 'layout.png', warnings: [] };

describe('layout export controller', () => {
  it('fails explicitly until an exporter is ready', async () => {
    const controller = createLayoutExportController();
    await expect(controller.export()).rejects.toThrow('尚未准备好');
    expect(controller.getSnapshot()).toBe(false);
  });

  it('rejects competing registrations and unregisters only its own handler', async () => {
    const controller = createLayoutExportController();
    const first = vi.fn(async () => result);
    const unregister = controller.register(first);
    expect(() => controller.register(async () => result)).toThrow('已注册');
    unregister();
    const second = vi.fn(async () => result);
    controller.register(second);
    unregister();
    await expect(controller.export()).resolves.toBe(result);
    expect(second).toHaveBeenCalledWith({ format: 'pdf', signal: expect.any(AbortSignal) });
    expect(first).not.toHaveBeenCalled();
  });

  it('serializes exports and publishes busy transitions', async () => {
    const controller = createLayoutExportController();
    const transitions: boolean[] = [];
    controller.subscribe(() => transitions.push(controller.getSnapshot()));
    let complete!: () => void;
    controller.register(() => new Promise((resolve) => { complete = () => resolve(result); }));
    const pending = controller.export({ format: 'png' });
    await expect(controller.export()).rejects.toThrow('正在导出');
    complete();
    await expect(pending).resolves.toBe(result);
    expect(transitions).toEqual([true, false]);
  });

  it.each(['external', 'unregister', 'cancel'] as const)('cancels through %s and suppresses late success', async (method) => {
    const controller = createLayoutExportController();
    const external = new AbortController();
    let complete!: () => void;
    let signal!: AbortSignal;
    const unregister = controller.register((request) => {
      signal = request.signal;
      return new Promise((resolve) => { complete = () => resolve(result); });
    });
    const pending = controller.export({ signal: external.signal });
    if (method === 'external') external.abort();
    if (method === 'unregister') unregister();
    if (method === 'cancel') controller.cancel();
    expect(signal.aborted).toBe(true);
    complete();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(controller.getSnapshot()).toBe(false);
  });

  it('does not invoke handlers for an already aborted request', async () => {
    const controller = createLayoutExportController();
    const handler = vi.fn(async () => result);
    controller.register(handler);
    await expect(controller.export({ signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('recovers from a handler failure and detaches abort listeners', async () => {
    const controller = createLayoutExportController();
    const external = new AbortController();
    const remove = vi.spyOn(external.signal, 'removeEventListener');
    const handler = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(result);
    controller.register(handler);
    await expect(controller.export({ signal: external.signal })).rejects.toThrow('failed');
    expect(controller.getSnapshot()).toBe(false);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    await expect(controller.export()).resolves.toBe(result);
  });
});
