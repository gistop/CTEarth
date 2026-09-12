import type { AiMessage, AiModelAdapter, AiModelSettings, AiProviderDefinition, AiToolCall } from '../types';
import { isRecord, throwIfAborted } from '../services/aiErrors';

export const deepSeekProvider: AiProviderDefinition = {
  id: 'deepseek',
  label: 'DeepSeek',
  defaultModel: 'deepseek-chat',
  models: ['deepseek-chat', 'deepseek-reasoner'],
  credentialStorageKey: 'ctearth-ai-deepseek-key',
};

export function createDeepSeekAdapter(
  settings: AiModelSettings,
  request: typeof fetch = (...args) => fetch(...args),
): AiModelAdapter {
  return {
    id: deepSeekProvider.id,
    capabilities: { toolCalling: true },
    async complete({ messages, tools, signal }) {
      throwIfAborted(signal);
      const apiKey = settings.apiKey.trim();
      const model = settings.model.trim();

      if (!apiKey || !model) {
        throw new Error('请先填写 DeepSeek API Key 并选择模型。');
      }

      const response = await request('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map(toDeepSeekMessage),
          ...(tools.length > 0 ? {
            tools: tools.map((tool) => ({ type: 'function', function: tool })),
            tool_choice: 'auto',
          } : {}),
          stream: false,
        }),
        signal,
      });

      throwIfAborted(signal);
      if (!response.ok) {
        throw new Error(`DeepSeek 请求失败（HTTP ${response.status}），请检查密钥、额度和网络连接。`);
      }

      const payload: unknown = await response.json();
      throwIfAborted(signal);
      return parseDeepSeekResponse(payload);
    },
  };
}

function toDeepSeekMessage(message: AiMessage) {
  const metadata = message.providerMetadata?.deepseek;
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls?.length ? {
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    } : {}),
    ...(isRecord(metadata) && typeof metadata.reasoningContent === 'string'
      ? { reasoning_content: metadata.reasoningContent }
      : {}),
  };
}

function parseDeepSeekResponse(payload: unknown): AiMessage {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
    throw new Error('DeepSeek 返回了无效的响应。');
  }

  const choice = payload.choices[0];
  const message = choice.message;
  if (!isRecord(message) || message.role !== 'assistant') {
    throw new Error('DeepSeek 响应缺少助手消息。');
  }
  if (choice.finish_reason === 'length') {
    throw new Error('模型输出被截断，未执行本轮工具调用。请缩小任务范围后重试。');
  }
  if (message.content != null && typeof message.content !== 'string') {
    throw new Error('DeepSeek 消息内容格式无效。');
  }
  if (message.tool_calls != null && !Array.isArray(message.tool_calls)) {
    throw new Error('DeepSeek 工具调用格式无效。');
  }

  const toolCalls: AiToolCall[] = (message.tool_calls ?? []).map((call: unknown) => {
    if (!isRecord(call) || typeof call.id !== 'string' || !call.id.trim()
      || call.type !== 'function' || !isRecord(call.function)
      || typeof call.function.name !== 'string' || !call.function.name.trim()
      || typeof call.function.arguments !== 'string') {
      throw new Error('DeepSeek 返回了不完整的工具调用，未执行本轮操作。');
    }
    return { id: call.id, name: call.function.name, arguments: call.function.arguments };
  });

  if (new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length) {
    throw new Error('DeepSeek 返回了重复的工具调用标识，未执行本轮操作。');
  }

  return {
    role: 'assistant',
    content: typeof message.content === 'string' ? message.content : '',
    toolCalls,
    ...(typeof message.reasoning_content === 'string'
      ? { providerMetadata: { deepseek: { reasoningContent: message.reasoning_content } } }
      : {}),
  };
}
