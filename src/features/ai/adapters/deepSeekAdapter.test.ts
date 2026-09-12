import { describe, expect, it, vi } from 'vitest';
import { gisToolDefinitions } from '../tools/gisToolDefinitions';
import { createDeepSeekAdapter } from './deepSeekAdapter';
import { createProxyPlaceholderAdapter } from './proxyAdapter';

function response(message: unknown, finishReason = 'stop') {
  return new Response(JSON.stringify({ choices: [{ message, finish_reason: finishReason }] }));
}

describe('DeepSeek adapter', () => {
  it('maps neutral tools to the provider protocol and preserves opaque reasoning across tool turns', async () => {
    const request = vi.fn<typeof fetch>();
    request.mockResolvedValueOnce(response({
      role: 'assistant', content: null, reasoning_content: 'private reasoning',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'list_layers', arguments: '{}' } }],
    }));
    request.mockResolvedValueOnce(response({ role: 'assistant', content: 'Done' }));
    const adapter = createDeepSeekAdapter({ apiKey: ' test-key ', model: 'test-model' }, request);
    const controller = new AbortController();
    const reply = await adapter.complete({ messages: [], tools: gisToolDefinitions, signal: controller.signal });
    expect(reply.toolCalls).toEqual([{ id: 'call-1', name: 'list_layers', arguments: '{}' }]);
    expect(request.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect(request.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.tools[0]).toEqual({ type: 'function', function: gisToolDefinitions[0] });
    expect(body.model).toBe('test-model');

    await adapter.complete({ messages: [reply, { role: 'tool', toolCallId: 'call-1', content: '{}' }], tools: [] });
    const followup = JSON.parse(String(request.mock.calls[1][1]?.body));
    expect(followup.messages[0].reasoning_content).toBe('private reasoning');
    expect(followup.messages[1].tool_call_id).toBe('call-1');
    expect(followup.tools).toBeUndefined();
    expect(reply.content).not.toContain('reasoning');
  });

  it('does not send a request without credentials or after cancellation', async () => {
    const request = vi.fn<typeof fetch>();
    const adapter = createDeepSeekAdapter({ apiKey: '', model: 'test' }, request);
    await expect(adapter.complete({ messages: [], tools: [] })).rejects.toThrow('API Key');
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.complete({ messages: [], tools: [], signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
  });

  it('never includes the raw HTTP error body in user-facing errors', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('sensitive response body', { status: 401 }));
    const adapter = createDeepSeekAdapter({ apiKey: 'secret', model: 'test' }, request);
    await expect(adapter.complete({ messages: [], tools: [] })).rejects.toThrow('HTTP 401');
  });

  it.each([
    { role: 'user', content: 'invalid role' },
    { role: 'assistant', content: 123 },
    { role: 'assistant', tool_calls: {} },
    { role: 'assistant', tool_calls: [{ id: 'call', type: 'function', function: { name: 'buffer_vector', arguments: {} } }] },
    { role: 'assistant', tool_calls: [{ id: '', type: 'function', function: { name: 'buffer_vector', arguments: '{}' } }] },
  ])('rejects malformed provider messages before exposing tool calls', async (message) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(message));
    const adapter = createDeepSeekAdapter({ apiKey: 'key', model: 'test' }, request);
    await expect(adapter.complete({ messages: [], tools: [] })).rejects.toThrow();
  });

  it('rejects truncated tool calls and invalid envelopes', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ role: 'assistant', content: '{}' }, 'length'))
      .mockResolvedValueOnce(new Response('{}'));
    const adapter = createDeepSeekAdapter({ apiKey: 'key', model: 'test' }, request);
    await expect(adapter.complete({ messages: [], tools: [] })).rejects.toThrow('截断');
    await expect(adapter.complete({ messages: [], tools: [] })).rejects.toThrow('无效');
  });

  it('keeps the proxy as a non-networking placeholder', async () => {
    const request = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(createProxyPlaceholderAdapter().complete({ messages: [], tools: [] })).rejects.toThrow('尚未实现');
      expect(request).not.toHaveBeenCalled();
    } finally {
      request.mockRestore();
    }
  });
});
