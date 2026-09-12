import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useMessagePartText } from '@assistant-ui/react';
import { Bot, CircleStop, RotateCcw, SendHorizontal, Sparkles, User } from 'lucide-react';
import type { AiConnectionMode, AiProviderDefinition } from '../types';
import type { SelectedMapContext } from '../services/gisContextService';
import { AiInlineSettings } from './AiInlineSettings';
import { MapAwarenessCard } from './MapAwarenessCard';

export function ChatThread({
  provider,
  selectedMapContext,
  activeLayerName,
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
  provider: AiProviderDefinition;
  selectedMapContext: SelectedMapContext | null;
  activeLayerName: string;
  apiKey: string;
  mode: AiConnectionMode;
  model: string;
  onApiKeyChange: (value: string) => void;
  onModeChange: (value: AiConnectionMode) => void;
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
          <AiInlineSettings provider={provider}
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
        <MapAwarenessCard context={selectedMapContext} />

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
          <Composer activeLayerName={activeLayerName} />
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
          <div className="ai-message-error">请求失败，请查看提示或检查连接设置。</div>
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

function Composer({ activeLayerName }: { activeLayerName: string }) {
  const placeholder = activeLayerName ? `询问 ${activeLayerName}` : '询问地图、图层或分析问题...';

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

