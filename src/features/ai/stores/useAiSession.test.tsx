// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatTransport, UIMessage } from 'ai';
import { createGisFixture } from '../testing/fixtures';
import { useAiSession } from './useAiSession';

let fixture: ReturnType<typeof createGisFixture>;
vi.mock('../adapters/gisRuntimeAdapter', () => ({
  useGisAiPort: () => ({ port: fixture.port, snapshot: fixture.port.getSnapshot() }),
}));

function options(): Parameters<ChatTransport<UIMessage>['sendMessages']>[0] {
  return { trigger: 'submit-message', chatId: 'session', messageId: undefined, abortSignal: undefined, messages: [{ id: 'user', role: 'user', parts: [{ type: 'text', text: '查看地图' }] }] };
}

function pendingFetch() {
  let signal: AbortSignal | null = null;
  const request = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
    signal = init?.signal ?? null;
    signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
  }));
  vi.stubGlobal('fetch', request);
  return { request, getSignal: () => signal };
}

beforeEach(() => { fixture = createGisFixture(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('AI session lifecycle', () => {
  it('does not recreate or cancel the active transport when GIS state updates', async () => {
    const network = pendingFetch();
    const { result, rerender, unmount } = renderHook(() => useAiSession());
    act(() => result.current.settings.onApiKeyChange('memory-key'));
    const transport = result.current.transport;
    let pending!: ReturnType<typeof transport.sendMessages>;
    act(() => { pending = transport.sendMessages(options()); });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    fixture.setSnapshot({ layer: { ...fixture.layer, fileName: 'updated.geojson' } });
    rerender();
    expect(result.current.transport).toBe(transport);
    expect(result.current.activeLayerName).toBe('updated');
    expect(network.getSignal()?.aborted).toBe(false);
    unmount();
    await assertion;
    expect(network.getSignal()?.aborted).toBe(true);
  });

  it('resets the conversation and cancels work without clearing connection settings', async () => {
    const network = pendingFetch();
    const { result } = renderHook(() => useAiSession());
    act(() => {
      result.current.settings.onApiKeyChange('memory-key');
      result.current.settings.onModelChange('deepseek-reasoner');
    });
    let pending!: ReturnType<typeof result.current.transport.sendMessages>;
    act(() => { pending = result.current.transport.sendMessages(options()); });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    act(() => result.current.reset());
    await assertion;
    expect(network.getSignal()?.aborted).toBe(true);
    expect(result.current.sessionId).toBe(1);
    expect(result.current.settings.apiKey).toBe('memory-key');
    expect(result.current.settings.model).toBe('deepseek-reasoner');
    expect(result.current.error).toBe('');
  });

  it('aborts requests made with old credentials when connection settings change', async () => {
    const network = pendingFetch();
    const { result } = renderHook(() => useAiSession());
    act(() => result.current.settings.onApiKeyChange('old-key'));
    let pending!: ReturnType<typeof result.current.transport.sendMessages>;
    act(() => { pending = result.current.transport.sendMessages(options()); });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    act(() => result.current.settings.onApiKeyChange('new-key'));
    await assertion;
    expect(network.getSignal()?.aborted).toBe(true);
    expect(result.current.settings.apiKey).toBe('new-key');
  });

  it('works after StrictMode cleanup and surfaces connection errors', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('ignored', { status: 401 }));
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => useAiSession(), { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> });
    act(() => result.current.settings.onApiKeyChange('key'));
    await act(async () => {
      await expect(result.current.transport.sendMessages(options())).rejects.toThrow('HTTP 401');
    });
    expect(result.current.error).toContain('HTTP 401');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not pretend the proxy placeholder is a working backend', async () => {
    const request = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => useAiSession());
    act(() => result.current.settings.onModeChange('proxy'));
    await act(async () => {
      await expect(result.current.transport.sendMessages(options())).rejects.toThrow('尚未实现');
    });
    expect(request).not.toHaveBeenCalled();
    expect(result.current.error).toContain('尚未实现');
  });
});
