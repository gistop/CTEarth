import { describe, expect, it, vi } from 'vitest';
import type { AiMessage, AiModelAdapter } from '../types';
import { gisToolDefinitions } from '../tools/gisToolDefinitions';
import { toolResult } from '../tools/toolResults';
import { runAiAgent } from './agentService';

function setup(replies: AiMessage[]) {
  const complete = vi.fn<AiModelAdapter['complete']>();
  replies.forEach((reply) => complete.mockResolvedValueOnce(reply));
  const executeTool = vi.fn(async (name: string) => toolResult(name, 'success', '完成', [], { count: 3 }));
  return {
    complete,
    executeTool,
    options: {
      model: { id: 'any-provider', capabilities: { toolCalling: true }, complete },
      tools: gisToolDefinitions,
      executeTool,
      getContext: () => ({ activeLayerId: 'roads' }),
    },
  };
}

function call(name = 'list_layers', args = '{}', id = 'call-1'): AiMessage {
  return { role: 'assistant', content: '', toolCalls: [{ id, name, arguments: args }] };
}

const finalReply: AiMessage = { role: 'assistant', content: '分析完成。' };

describe('runAiAgent', () => {
  it('orchestrates a provider-independent model and returns actual tool results to it', async () => {
    const { options, complete, executeTool } = setup([call(), finalReply]);
    const result = await runAiAgent(options, [{ role: 'user', content: '查看地图' }]);
    expect(result.text).toBe('分析完成。');
    expect(result.toolResults[0].output).toEqual({ count: 3 });
    expect(executeTool).toHaveBeenCalledWith('list_layers', {}, undefined);
    const history = complete.mock.calls[1][0].messages;
    expect(history.some((message) => message.content.includes('roads'))).toBe(true);
    expect(history.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'call-1' });
    expect(JSON.parse(history.at(-1)!.content).status).toBe('success');
  });

  it.each([
    ['unknown_tool', '{}'], ['buffer_vector', '{'], ['buffer_vector', '[]'],
    ['buffer_vector', '{}'], ['buffer_vector', '{"distance":"500"}'],
    ['buffer_vector', '{"distance":-1}'], ['buffer_vector', '{"distance":1,"capStyle":"other"}'],
    ['buffer_vector', '{"distance":1,"unexpected":true}'],
  ])('blocks invalid calls without executing: %s %s', async (name, args) => {
    const { options, executeTool } = setup([call(name, args), finalReply]);
    const result = await runAiAgent(options, []);
    expect(executeTool).not.toHaveBeenCalled();
    expect(result.toolResults[0].status).toBe('blocked');
  });

  it('checks cancellation again after the model resolves', async () => {
    const { options, complete, executeTool } = setup([]);
    const controller = new AbortController();
    complete.mockImplementation(async () => { controller.abort(); return call(); });
    await expect(runAiAgent(options, [], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('does not execute the next tool after cancellation during an operation', async () => {
    const reply = call();
    reply.toolCalls!.push({ id: 'call-2', name: 'list_layers', arguments: '{}' });
    const { options, executeTool } = setup([reply]);
    const controller = new AbortController();
    executeTool.mockImplementation(async (name) => { controller.abort(); return toolResult(name, 'success', '完成'); });
    await expect(runAiAgent(options, [], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('requests a final answer without tools after reaching the round limit', async () => {
    const { options, complete } = setup([call(), finalReply]);
    const result = await runAiAgent({ ...options, maxToolRounds: 1 }, []);
    expect(result.text).toBe('分析完成。');
    expect(complete.mock.calls[1][0].tools).toEqual([]);
  });

  it('does not partially execute a batch that exceeds the call budget', async () => {
    const reply = call();
    reply.toolCalls!.push({ id: 'call-2', name: 'list_layers', arguments: '{}' });
    const { options, executeTool } = setup([reply]);
    const result = await runAiAgent({ ...options, maxToolCalls: 1 }, []);
    expect(executeTool).not.toHaveBeenCalled();
    expect(result.text).toContain('预算');
  });

  it('rejects repeated call ids rather than repeating a mutation', async () => {
    const { options, executeTool } = setup([call(), call()]);
    await expect(runAiAgent(options, [])).rejects.toThrow('重复');
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('reports a failed operation honestly and allows the model to explain it', async () => {
    const { options, executeTool } = setup([call(), finalReply]);
    executeTool.mockRejectedValueOnce(new Error('GIS failed'));
    const result = await runAiAgent(options, []);
    expect(result.toolResults[0]).toMatchObject({ ok: false, status: 'failed', message: 'GIS failed' });
  });

  it('supports a text-only provider without exposing tools', async () => {
    const { options, complete, executeTool } = setup([finalReply]);
    options.model.capabilities.toolCalling = false;
    await runAiAgent(options, []);
    expect(complete.mock.calls[0][0].tools).toEqual([]);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('propagates cancellation from a disposed GIS runtime instead of continuing the agent', async () => {
    const { options, complete, executeTool } = setup([call(), finalReply]);
    executeTool.mockRejectedValueOnce(new DOMException('disposed', 'AbortError'));
    await expect(runAiAgent(options, [])).rejects.toMatchObject({ name: 'AbortError' });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('validates budgets and duplicate tool registrations before requesting a model', async () => {
    const { options, complete } = setup([]);
    await expect(runAiAgent({ ...options, maxToolRounds: -1 }, [])).rejects.toThrow('预算');
    await expect(runAiAgent({ ...options, tools: [gisToolDefinitions[0], gisToolDefinitions[0]] }, [])).rejects.toThrow('重复');
    expect(complete).not.toHaveBeenCalled();
  });
});
