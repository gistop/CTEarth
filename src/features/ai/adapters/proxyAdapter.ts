import type { AiModelAdapter } from '../types';

export function createProxyPlaceholderAdapter(): AiModelAdapter {
  return {
    id: 'proxy-placeholder',
    capabilities: { toolCalling: false },
    async complete() {
      throw new Error('后端代理尚未实现，请使用浏览器直连。');
    },
  };
}
