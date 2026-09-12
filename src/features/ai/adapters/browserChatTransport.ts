import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import type { AiMessage, AiRunResult } from '../types';
import { throwIfAborted } from '../services/aiErrors';

export type BrowserChatTransport = ChatTransport<UIMessage> & { cancel(): void };

export function createBrowserChatTransport(
  run: (messages: AiMessage[], signal: AbortSignal) => Promise<AiRunResult>,
): BrowserChatTransport {
  let active: AbortController | null = null;

  return {
    async sendMessages({ messages, abortSignal }) {
      throwIfAborted(abortSignal);
      if (active) {
        throw new Error('上一条 AI 请求尚未结束。');
      }
      const controller = new AbortController();
      active = controller;
      const abort = () => controller.abort();
      abortSignal?.addEventListener('abort', abort, { once: true });

      try {
        const result = await run(toAiMessages(messages), controller.signal);
        throwIfAborted(controller.signal);
        return textStream(result.text);
      } finally {
        abortSignal?.removeEventListener('abort', abort);
        if (active === controller) {
          active = null;
        }
      }
    },
    async reconnectToStream() { return null; },
    cancel() { active?.abort(); },
  };
}

export function toAiMessages(messages: UIMessage[]): AiMessage[] {
  return messages.flatMap((message): AiMessage[] => {
    if (message.role !== 'assistant' && message.role !== 'user') {
      return [];
    }
    const legacy = (message as { content?: unknown }).content;
    const content = typeof legacy === 'string'
      ? legacy
      : message.parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
    return content.trim() ? [{ role: message.role, content }] : [];
  });
}

function textStream(text: string) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'start' });
      controller.enqueue({ type: 'start-step' });
      controller.enqueue({ type: 'text-start', id: 'text-1' });
      controller.enqueue({ type: 'text-delta', id: 'text-1', delta: text });
      controller.enqueue({ type: 'text-end', id: 'text-1' });
      controller.enqueue({ type: 'finish-step' });
      controller.enqueue({ type: 'finish', finishReason: 'stop' });
      controller.close();
    },
  });
}
