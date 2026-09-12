export type CredentialStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readCredential(key: string, getStorage: () => CredentialStorage = () => localStorage) {
  try {
    return { apiKey: getStorage().getItem(key) ?? '', error: '' };
  } catch {
    return { apiKey: '', error: '浏览器不允许读取本机密钥；仍可输入密钥并直连。' };
  }
}

export function persistCredential(
  key: string,
  apiKey: string,
  remember: boolean,
  getStorage: () => CredentialStorage = () => localStorage,
) {
  try {
    const storage = getStorage();
    if (remember && apiKey.trim()) {
      storage.setItem(key, apiKey.trim());
    } else {
      storage.removeItem(key);
    }
    return '';
  } catch {
    return remember
      ? '本机保存密钥失败；密钥仍可在当前会话中使用。'
      : '无法删除本机密钥，请在浏览器站点设置中清除存储。';
  }
}
