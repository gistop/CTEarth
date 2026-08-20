import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessagePartText,
} from '@assistant-ui/react';
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import {
  Bot,
  CircleStop,
  Globe2,
  KeyRound,
  RotateCcw,
  SendHorizontal,
  Server,
  Sparkles,
  User,
} from 'lucide-react';
import { useGis } from '../../gisStore';

const DIRECT_API_URL = 'https://api.deepseek.com/chat/completions';
const STORAGE_KEY = 'ctearth-ai-deepseek-key';
const configuredProxyApi = import.meta.env.VITE_AI_CHAT_API || '/api/chat';

type ChatMode = 'proxy' | 'direct';

const systemPrompt = [
  'You are CTEarth AI, a concise GIS and remote sensing assistant.',
  'Reply in the user language.',
  'Help users reason about layers, fields, interpolation, buffers, map display, and analysis workflow.',
  'When the user asks for choices, use A. B. C. D. option format.',
].join('\n');

export function AiAssistantPanel() {
  const [sessionId, setSessionId] = useState(0);

  return (
    <AssistantSession
      key={sessionId}
      onReset={() => setSessionId((current) => current + 1)}
    />
  );
}

function AssistantSession({
  onReset,
}: {
  onReset: () => void;
}) {
  const [mode, setMode] = useState<ChatMode>('proxy');
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(false);
  const [model, setModel] = useState('deepseek-chat');
  const apiKeyRef = useRef(apiKey);
  const modelRef = useRef(model);

  useEffect(() => {
    const savedKey = localStorage.getItem(STORAGE_KEY) ?? '';

    if (savedKey) {
      setApiKey(savedKey);
      setRememberKey(true);
    }
  }, []);

  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const transport = useMemo<ChatTransport<UIMessage>>(() => {
    if (mode === 'proxy') {
      return new AssistantChatTransport({ api: configuredProxyApi });
    }

    return new DeepSeekBrowserTransport({
      getApiKey: () => apiKeyRef.current,
      getModel: () => modelRef.current,
      system: systemPrompt,
    });
  }, [mode]);

  const runtime = useChatRuntime({ transport });

  const updateApiKey = (nextKey: string) => {
    setApiKey(nextKey);

    if (rememberKey) {
      localStorage.setItem(STORAGE_KEY, nextKey.trim());
    }
  };

  const updateRememberKey = (nextRemember: boolean) => {
    setRememberKey(nextRemember);

    if (nextRemember && apiKey.trim()) {
      localStorage.setItem(STORAGE_KEY, apiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className="ai-assistant-panel" aria-label="AI assistant">
        <ChatThread
          apiKey={apiKey}
          mode={mode}
          model={model}
          onApiKeyChange={updateApiKey}
          onModeChange={setMode}
          onModelChange={setModel}
          onRememberKeyChange={updateRememberKey}
          onReset={onReset}
          rememberKey={rememberKey}
        />
      </section>
    </AssistantRuntimeProvider>
  );
}

function ChatThread({
  apiKey,
  mode,
  model,
  onApiKeyChange,
  onModeChange,
  onModelChange,
  onRememberKeyChange,
  onReset,
  rememberKey,
}: {
  apiKey: string;
  mode: ChatMode;
  model: string;
  onApiKeyChange: (value: string) => void;
  onModeChange: (value: ChatMode) => void;
  onModelChange: (value: string) => void;
  onRememberKeyChange: (value: boolean) => void;
  onReset: () => void;
  rememberKey: boolean;
}) {
  return (
    <ThreadPrimitive.Root className="ai-thread-root">
      <header className="ai-thread-header">
        <div className="ai-thread-title">
          <Sparkles size={15} />
          <span>AI 助手</span>
        </div>
        <div className="ai-thread-controls">
          <AiInlineSettings
            apiKey={apiKey}
            compact
            mode={mode}
            model={model}
            onApiKeyChange={onApiKeyChange}
            onModeChange={onModeChange}
            onModelChange={onModelChange}
            onRememberKeyChange={onRememberKeyChange}
            rememberKey={rememberKey}
          />
          <button className="ai-icon-button" type="button" title="重置" aria-label="重置" onClick={onReset}>
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      <ThreadPrimitive.Viewport className="ai-thread-viewport">
        <ThreadPrimitive.Empty>
          <div className="ai-empty-state">
            <Bot size={20} />
            <p>可以询问图层、字段、插值、缓冲区和制图流程。</p>
            <div className="ai-suggestions">
              <ThreadPrimitive.Suggestion
                className="ai-suggestion"
                method="replace"
                prompt="请根据当前图层给我一个 GIS 分析建议"
              >
                分析建议
              </ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion
                className="ai-suggestion"
                method="replace"
                prompt="IDW 插值需要注意哪些参数？"
              >
                IDW 参数
              </ThreadPrimitive.Suggestion>
            </div>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.ViewportFooter className="ai-viewport-footer">
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="ai-message ai-message-user">
      <div className="ai-avatar ai-user-avatar" aria-hidden="true">
        <User size={13} />
      </div>
      <div className="ai-bubble ai-user-bubble">
        <MessagePrimitive.Content components={{ Text: TextPart }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="ai-message ai-message-assistant">
      <div className="ai-avatar ai-assistant-avatar" aria-hidden="true">
        <Bot size={13} />
      </div>
      <div className="ai-bubble ai-assistant-bubble">
        <MessagePrimitive.Content components={{ Text: TextPart }} />
        <MessagePrimitive.Error>
          <div className="ai-message-error">请求失败，请检查代理地址或 Direct 模式的 API Key。</div>
        </MessagePrimitive.Error>
      </div>
    </MessagePrimitive.Root>
  );
}

function TextPart() {
  const part = useMessagePartText();
  const text = part?.text ?? '';

  return (
    <div className="ai-text-part">
      {text.split('\n').map((line, index) => (
        <p className="ai-text-line" key={index}>
          {line || '\u00a0'}
        </p>
      ))}
    </div>
  );
}

function Composer() {
  const { layer } = useGis();
  const placeholder = layer ? `询问 ${layer.fileName}` : '询问地图、图层或分析问题...';

  return (
    <ComposerPrimitive.Root className="ai-composer-root">
      <ComposerPrimitive.Input
        className="ai-composer-input"
        placeholder={placeholder}
        rows={1}
        submitMode="enter"
      />
      <div className="ai-composer-actions">
        <ComposerPrimitive.Cancel className="ai-icon-button" title="停止生成">
          <CircleStop size={16} />
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send className="ai-icon-button ai-send-button" title="发送">
          <SendHorizontal size={16} />
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}

function AiInlineSettings({
  apiKey,
  compact = false,
  mode,
  model,
  onApiKeyChange,
  onModeChange,
  onModelChange,
  onRememberKeyChange,
  rememberKey,
}: {
  apiKey: string;
  compact?: boolean;
  mode: ChatMode;
  model: string;
  onApiKeyChange: (value: string) => void;
  onModeChange: (value: ChatMode) => void;
  onModelChange: (value: string) => void;
  onRememberKeyChange: (value: boolean) => void;
  rememberKey: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const preventSettingSubmit = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  };
  const CurrentModeIcon = mode === 'proxy' ? Server : Globe2;

  return (
    <div className={`ai-inline-settings ${compact ? 'is-compact' : ''}`}>
      <button
        className={`ai-settings-trigger ${settingsOpen ? 'is-selected' : ''}`}
        type="button"
        title={mode === 'proxy' ? '后端代理' : '浏览器直连'}
        aria-label="AI 连接设置"
        aria-expanded={settingsOpen}
        onClick={() => setSettingsOpen((open) => !open)}
      >
        <CurrentModeIcon size={18} />
      </button>
      {settingsOpen ? (
        <div className="ai-settings-popover" onPointerDown={(event) => event.stopPropagation()}>
          <div className="ai-mode-toggle" aria-label="AI 调用方式">
            <button
              className={mode === 'proxy' ? 'is-selected' : ''}
              type="button"
              title="后端代理"
              aria-label="后端代理"
              onClick={() => onModeChange('proxy')}
            >
              <Server size={14} />
            </button>
            <button
              className={mode === 'direct' ? 'is-selected' : ''}
              type="button"
              title="浏览器直连"
              aria-label="浏览器直连"
              onClick={() => onModeChange('direct')}
            >
              <Globe2 size={14} />
            </button>
          </div>
          {mode === 'direct' ? (
            <>
              <input
                autoComplete="off"
                aria-label="DeepSeek API Key"
                className="ai-inline-key-input"
                placeholder="DeepSeek API Key"
                type="password"
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                onKeyDown={preventSettingSubmit}
              />
              <select
                aria-label="AI model"
                className="ai-inline-model-select"
                value={model}
                onChange={(event) => onModelChange(event.target.value)}
                onKeyDown={preventSettingSubmit}
              >
                <option value="deepseek-chat">deepseek-chat</option>
                <option value="deepseek-reasoner">deepseek-reasoner</option>
              </select>
              <button
                className={`ai-remember-button ${rememberKey ? 'is-selected' : ''}`}
                type="button"
                title="本机保存 Key"
                aria-label="本机保存 Key"
                onClick={() => onRememberKeyChange(!rememberKey)}
              >
                <KeyRound size={14} />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

class DeepSeekBrowserTransport implements ChatTransport<UIMessage> {
  private getApiKey: () => string;
  private getModel: () => string;
  private system: string;

  constructor({
    getApiKey,
    getModel,
    system,
  }: {
    getApiKey: () => string;
    getModel: () => string;
    system: string;
  }) {
    this.getApiKey = getApiKey;
    this.getModel = getModel;
    this.system = system;
  }

  async sendMessages({
    abortSignal,
    messages,
  }: {
    abortSignal: AbortSignal | undefined;
    messages: UIMessage[];
  }) {
    const apiKey = this.getApiKey().trim();

    if (!apiKey) {
      throw new Error('请先输入 DeepSeek API Key。');
    }

    const response = await fetch(DIRECT_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.getModel(),
        messages: [
          { role: 'system', content: this.system },
          ...toDeepSeekMessages(messages),
        ],
        stream: true,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('当前浏览器不支持流式读取响应。');
    }

    return deepSeekSseToUIMessageStream(response.body);
  }

  async reconnectToStream() {
    return null;
  }
}

function toDeepSeekMessages(messages: UIMessage[]) {
  return messages
    .map((message) => {
      const content = getMessageText(message);

      if (!content || (message.role !== 'assistant' && message.role !== 'user')) {
        return null;
      }

      return {
        role: message.role,
        content,
      };
    })
    .filter((message): message is { role: 'assistant' | 'user'; content: string } => Boolean(message));
}

function getMessageText(message: UIMessage) {
  const legacyMessage = message as { content?: unknown };

  if (typeof legacyMessage.content === 'string') {
    return legacyMessage.content;
  }

  if (!Array.isArray(message.parts)) {
    return '';
  }

  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function deepSeekSseToUIMessageStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let textStarted = false;
  let closed = false;

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: 'start' } as UIMessageChunk);
      controller.enqueue({ type: 'start-step' } as UIMessageChunk);

      try {
        while (!closed) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const data = parseSseData(line);

            if (!data) {
              continue;
            }

            if (data === '[DONE]') {
              closed = true;
              break;
            }

            const delta = getDeepSeekDelta(data);

            if (delta) {
              if (!textStarted) {
                controller.enqueue({ type: 'text-start', id: 'text-1' } as UIMessageChunk);
                textStarted = true;
              }

              controller.enqueue({
                type: 'text-delta',
                id: 'text-1',
                delta,
              } as UIMessageChunk);
            }
          }
        }

        if (textStarted) {
          controller.enqueue({ type: 'text-end', id: 'text-1' } as UIMessageChunk);
        }

        controller.enqueue({ type: 'finish-step' } as UIMessageChunk);
        controller.enqueue({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      closed = true;
      return reader.cancel();
    },
  });
}

function parseSseData(line: string) {
  const trimmed = line.trim();

  if (!trimmed.startsWith('data:')) {
    return null;
  }

  return trimmed.slice(5).trim();
}

function getDeepSeekDelta(data: string) {
  try {
    const payload = JSON.parse(data) as {
      choices?: { delta?: { content?: string } }[];
    };

    return payload.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}
