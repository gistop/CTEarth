export type AiToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AiToolCall[];
  toolCallId?: string;
  providerMetadata?: Record<string, unknown>;
};

export type AiParameterSchema = {
  type: 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  enum?: string[];
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
};

export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AiParameterSchema>;
    required?: string[];
    additionalProperties: false;
  };
};

export type AiToolStatus = 'success' | 'blocked' | 'failed' | 'needs_confirmation';

export type AiToolNextAction = {
  type: 'none' | 'ask_user' | 'retry' | 'confirm';
  fields?: string[];
};

export type AiToolError = {
  code: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type AiToolResult = {
  status: AiToolStatus;
  tool: string;
  message: string;
  data: Record<string, unknown> | null;
  error: AiToolError | null;
  nextAction: AiToolNextAction;
};

export type AiModelSettings = { apiKey: string; model: string };
export type AiConnectionMode = 'direct' | 'proxy';

export type AiProviderDefinition = {
  id: string;
  label: string;
  defaultModel: string;
  models: readonly string[];
  credentialStorageKey: string;
};

export interface AiModelAdapter {
  readonly id: string;
  readonly capabilities: { toolCalling: boolean };
  complete(request: {
    messages: readonly AiMessage[];
    tools: readonly AiToolDefinition[];
    signal?: AbortSignal;
  }): Promise<AiMessage>;
}

export type AiToolExecutor = (
  name: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<AiToolResult>;

export type AiRunResult = { text: string; toolResults: AiToolResult[] };
