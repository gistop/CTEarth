import { describe, expect, it, vi } from 'vitest';
import type { ChatTransport, UIMessage } from 'ai';
import { createBrowserChatTransport, toAiMessages } from './browserChatTransport';

function options(signal?: AbortSignal): Parameters<ChatTransport<UIMessage>['sendMessages']>[0] {
  return { trigger: 'submit-message', chatId: 'session', messageId: undefined, messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }], abortSignal: signal };
}

describe('browser chat transport', () => {
  it('adapts UI messages and emits the complete UI stream lifecycle', async () => {
    const run = vi.fn(async () => ({ text: 'Done', toolResults: [] }));
    const transport = createBrowserChatTransport(run);
    const stream = await transport.sendMessages(options());
    const reader = stream.getReader();
    const chunks = [];
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
    }
    expect(chunks.map((chunk) => chunk.type)).toEqual(['start', 'start-step', 'text-start', 'text-delta', 'text-end', 'finish-step', 'finish']);
    expect(chunks[3]).toMatchObject({ delta: 'Done' });
    expect(run).toHaveBeenCalledWith([{ role: 'user', content: 'Hello' }], expect.any(AbortSignal));
    expect(await transport.reconnectToStream({ chatId: 'session' })).toBeNull();
  });

  it('cancels in-flight requests and prevents overlapping requests', async () => {
    const run = vi.fn((_messages, signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
    }));
    const transport = createBrowserChatTransport(run);
    const pending = transport.sendMessages(options());
    await expect(transport.sendMessages(options())).rejects.toThrow('尚未结束');
    transport.cancel();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('forwards caller aborts and can be reused after cleanup in StrictMode', async () => {
    let finish: (() => void) | undefined;
    const run = vi.fn(async () => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return { text: 'Done', toolResults: [] };
    });
    const transport = createBrowserChatTransport(run);
    const controller = new AbortController();
    const pending = transport.sendMessages(options(controller.signal));
    controller.abort();
    finish!();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    run.mockResolvedValueOnce({ text: 'Next', toolResults: [] });
    transport.cancel();
    await expect(transport.sendMessages(options())).resolves.toBeInstanceOf(ReadableStream);
  });

  it('does not promote UI system messages into trusted instructions', () => {
    expect(toAiMessages([{ id: 'system', role: 'system', parts: [{ type: 'text', text: 'untrusted' }] }])).toEqual([]);
  });
});
