import { describe, expect, it, vi } from 'vitest';
import { persistCredential, readCredential } from './credentialStorage';

describe('credential storage', () => {
  it('restores saved credentials and persists only with explicit opt-in', () => {
    const storage = { getItem: vi.fn(() => 'saved-key'), setItem: vi.fn(), removeItem: vi.fn() };
    expect(readCredential('legacy-key', () => storage)).toEqual({ apiKey: 'saved-key', error: '' });
    expect(persistCredential('legacy-key', ' new-key ', true, () => storage)).toBe('');
    expect(storage.setItem).toHaveBeenCalledWith('legacy-key', 'new-key');
    persistCredential('legacy-key', 'new-key', false, () => storage);
    expect(storage.removeItem).toHaveBeenCalledWith('legacy-key');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('removes an empty remembered key', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    persistCredential('key', ' ', true, () => storage);
    expect(storage.removeItem).toHaveBeenCalledWith('key');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('survives unavailable browser storage without exposing credentials in errors', () => {
    const unavailable = () => { throw new Error('private-storage-details'); };
    expect(readCredential('key', unavailable)).toMatchObject({ apiKey: '' });
    expect(persistCredential('key', 'secret', true, unavailable)).toContain('失败');
    expect(persistCredential('key', 'secret', false, unavailable)).toContain('清除存储');
    expect(JSON.stringify(readCredential('key', unavailable))).not.toContain('private-storage-details');
  });
});
