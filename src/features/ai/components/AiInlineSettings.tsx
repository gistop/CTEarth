import { useState, type KeyboardEvent } from 'react';
import { Globe2, KeyRound, Server } from 'lucide-react';
import type { AiConnectionMode, AiProviderDefinition } from '../types';

export function AiInlineSettings({
  provider,
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
  provider: AiProviderDefinition;
  apiKey: string;
  compact?: boolean;
  mode: AiConnectionMode;
  model: string;
  onApiKeyChange: (value: string) => void;
  onModeChange: (value: AiConnectionMode) => void;
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
              title="后端代理（预留，尚未实现）"
              aria-label="后端代理"
              disabled
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
                aria-label={`${provider.label} API Key`}
                className="ai-inline-key-input"
                placeholder={`${provider.label} API Key`}
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
                {provider.models.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
              </select>
              <button
                className={`ai-remember-button ${rememberKey ? 'is-selected' : ''}`}
                type="button"
                title="仅在可信设备保存；密钥将以明文保存在本站浏览器存储中"
                aria-label="本机保存 Key"
                onClick={() => onRememberKeyChange(!rememberKey)}
              >
                <KeyRound size={14} />
              </button>
            </>
          ) : null}
          <p className="ai-settings-notice">直连会发送图层摘要及少量选中要素属性。密钥仅在主动选择保存时持久化。</p>
        </div>
      ) : null}
    </div>
  );
}
