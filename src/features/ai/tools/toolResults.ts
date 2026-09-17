import type { AiToolError, AiToolNextAction, AiToolResult } from '../types';

type ToolResultOptions = {
  data?: Record<string, unknown> | null;
  error?: AiToolError | null;
  nextAction?: AiToolNextAction;
};

export function toolResult(
  tool: string,
  status: AiToolResult['status'],
  message: string,
  options: ToolResultOptions = {},
): AiToolResult {
  const error = options.error === undefined
    ? status === 'success'
      ? null
      : { code: status === 'blocked' ? 'TOOL_BLOCKED' : 'TOOL_FAILED', retryable: false }
    : options.error;
  const nextAction = options.nextAction ?? {
    type: status === 'success'
      ? 'none'
      : status === 'blocked'
        ? 'ask_user'
        : status === 'needs_confirmation'
          ? 'confirm'
          : 'none',
  };
  return {
    status,
    tool,
    message,
    data: options.data ?? null,
    error,
    nextAction,
  };
}
