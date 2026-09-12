import { useLayoutEffect, useMemo, useState } from 'react';
import { createBrowserChatTransport } from '../adapters/browserChatTransport';
import { createDeepSeekAdapter, deepSeekProvider } from '../adapters/deepSeekAdapter';
import { createProxyPlaceholderAdapter } from '../adapters/proxyAdapter';
import { useGisAiPort } from '../adapters/gisRuntimeAdapter';
import { runAiAgent } from '../services/agentService';
import { errorText, isAbortError } from '../services/aiErrors';
import { displayLayerName, getSelectedMapContext, summarizeGisContext } from '../services/gisContextService';
import { gisToolDefinitions } from '../tools/gisToolDefinitions';
import { createGisToolExecutor } from '../tools/gisToolExecutor';
import { useAiSettings } from './useAiSettings';

export function useAiSession() {
  const settings = useAiSettings(deepSeekProvider);
  const { port: gis, snapshot } = useGisAiPort();
  const [sessionId, setSessionId] = useState(0);
  const [requestError, setRequestError] = useState('');
  const { apiKey, model, mode } = settings;
  const transport = useMemo(() => createBrowserChatTransport(async (messages, signal) => {
    setRequestError('');
    const adapter = mode === 'direct'
      ? createDeepSeekAdapter({ apiKey, model })
      : createProxyPlaceholderAdapter();
    try {
      return await runAiAgent({
        model: adapter,
        tools: gisToolDefinitions,
        executeTool: createGisToolExecutor(gis),
        getContext: () => summarizeGisContext(gis.getSnapshot()),
      }, messages, signal);
    } catch (error) {
      if (!signal.aborted && !isAbortError(error)) {
        setRequestError(errorText(error));
      }
      throw error;
    }
  }), [apiKey, model, mode, gis, sessionId]);

  useLayoutEffect(() => () => transport.cancel(), [transport]);

  return {
    settings,
    provider: deepSeekProvider,
    transport,
    sessionId,
    error: requestError || settings.storageError,
    selectedMapContext: getSelectedMapContext(snapshot),
    activeLayerName: snapshot.layer ? displayLayerName(snapshot.layer.fileName) : '',
    reset() {
      transport.cancel();
      setRequestError('');
      setSessionId((current) => current + 1);
    },
  };
}
