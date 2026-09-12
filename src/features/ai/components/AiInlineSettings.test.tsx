// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiInlineSettings } from './AiInlineSettings';

afterEach(cleanup);

describe('AI connection settings', () => {
  it('renders provider-supplied labels and models, and disables the reserved proxy', async () => {
    const user = userEvent.setup();
    const onApiKeyChange = vi.fn();
    const onModelChange = vi.fn();
    const onRememberKeyChange = vi.fn();
    render(<AiInlineSettings
      provider={{ id: 'example', label: 'Example', defaultModel: 'model-a', models: ['model-a', 'model-b'], credentialStorageKey: 'example-key' }}
      apiKey=""
      mode="direct"
      model="model-a"
      rememberKey={false}
      onApiKeyChange={onApiKeyChange}
      onModeChange={vi.fn()}
      onModelChange={onModelChange}
      onRememberKeyChange={onRememberKeyChange}
    />);
    await user.click(screen.getByRole('button', { name: 'AI 连接设置' }));
    expect((screen.getByRole('button', { name: '后端代理' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Example API Key') as HTMLInputElement).type).toBe('password');
    await user.type(screen.getByLabelText('Example API Key'), 'k');
    expect(onApiKeyChange).toHaveBeenCalledWith('k');
    await user.selectOptions(screen.getByRole('combobox', { name: 'AI model' }), 'model-b');
    expect(onModelChange).toHaveBeenCalledWith('model-b');
    await user.click(screen.getByRole('button', { name: '本机保存 Key' }));
    expect(onRememberKeyChange).toHaveBeenCalledWith(true);
    expect(screen.getByText(/少量选中要素属性/)).toBeTruthy();
  });
});
