// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deepSeekProvider } from '../adapters/deepSeekAdapter';
import { useAiSettings } from './useAiSettings';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AI settings state', () => {
  it('keeps credentials in memory unless the user opts in, and removes them when opted out', () => {
    const { result } = renderHook(() => useAiSettings(deepSeekProvider));
    act(() => result.current.onApiKeyChange('test-key'));
    expect(localStorage.getItem(deepSeekProvider.credentialStorageKey)).toBeNull();
    act(() => result.current.onRememberKeyChange(true));
    expect(localStorage.getItem(deepSeekProvider.credentialStorageKey)).toBe('test-key');
    act(() => result.current.onApiKeyChange('changed'));
    expect(localStorage.getItem(deepSeekProvider.credentialStorageKey)).toBe('changed');
    act(() => result.current.onRememberKeyChange(false));
    expect(localStorage.getItem(deepSeekProvider.credentialStorageKey)).toBeNull();
    expect(result.current.apiKey).toBe('changed');
  });

  it('restores the existing legacy key without a storage migration', () => {
    localStorage.setItem('ctearth-ai-deepseek-key', 'legacy');
    const { result } = renderHook(() => useAiSettings(deepSeekProvider));
    expect(result.current.apiKey).toBe('legacy');
    expect(result.current.rememberKey).toBe(true);
    expect(result.current.mode).toBe('direct');
  });

  it('reports storage failures without making browser-direct chat unusable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { result } = renderHook(() => useAiSettings(deepSeekProvider));
    act(() => result.current.onApiKeyChange('memory-only'));
    act(() => result.current.onRememberKeyChange(true));
    expect(result.current.rememberKey).toBe(false);
    expect(result.current.apiKey).toBe('memory-only');
    expect(result.current.storageError).toContain('失败');
  });
});
