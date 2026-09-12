import { useState } from 'react';
import type { AiConnectionMode, AiProviderDefinition } from '../types';
import { persistCredential, readCredential } from '../services/credentialStorage';

export function useAiSettings(provider: AiProviderDefinition) {
  const [saved] = useState(() => readCredential(provider.credentialStorageKey));
  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [rememberKey, setRememberKey] = useState(Boolean(saved.apiKey));
  const [model, setModel] = useState(provider.defaultModel);
  const [mode, setMode] = useState<AiConnectionMode>('direct');
  const [storageError, setStorageError] = useState(saved.error);

  function updateApiKey(value: string) {
    setApiKey(value);
    if (rememberKey) {
      setStorageError(persistCredential(provider.credentialStorageKey, value, true));
    }
  }

  function updateRememberKey(value: boolean) {
    const error = persistCredential(provider.credentialStorageKey, apiKey, value);
    setStorageError(error);
    setRememberKey(value && !error);
  }

  return {
    apiKey, rememberKey, model, mode, storageError,
    onApiKeyChange: updateApiKey,
    onRememberKeyChange: updateRememberKey,
    onModelChange: setModel,
    onModeChange: setMode,
  };
}
