import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { useAiSession } from '../stores/useAiSession';
import { ChatThread } from './ChatThread';
import './aiAssistant.css';

export function AiAssistantPanel() {
  const session = useAiSession();
  return <AssistantSession key={session.sessionId} session={session} />;
}

function AssistantSession({ session }: { session: ReturnType<typeof useAiSession> }) {
  const runtime = useChatRuntime({ transport: session.transport });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className="ai-assistant-panel" aria-label="AI assistant">
        {session.error ? <div className="ai-message-error ai-session-error" role="alert">{session.error}</div> : null}
        <ChatThread
          {...session.settings}
          provider={session.provider}
          selectedMapContext={session.selectedMapContext}
          activeLayerName={session.activeLayerName}
          onReset={session.reset}
        />
      </section>
    </AssistantRuntimeProvider>
  );
}
