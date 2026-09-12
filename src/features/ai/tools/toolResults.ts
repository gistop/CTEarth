import type { AiToolResult } from '../types';

export function toolResult(
  tool: string,
  status: AiToolResult['status'],
  message: string,
  checks: string[] = [],
  output?: Record<string, unknown>,
): AiToolResult {
  return { ok: status === 'success', status, tool, message, qa: { passed: status === 'success', checks }, output };
}
