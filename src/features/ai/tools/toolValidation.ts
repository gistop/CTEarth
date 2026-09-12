import type { AiToolDefinition } from '../types';
import { isRecord } from '../services/aiErrors';

export function parseToolArguments(serialized: string): Record<string, unknown> {
  let input: unknown;
  try {
    input = JSON.parse(serialized);
  } catch {
    throw new Error('工具参数不是合法的 JSON。');
  }
  if (!isRecord(input)) {
    throw new Error('工具参数必须是 JSON 对象。');
  }
  return input;
}

export function validateToolInput(definition: AiToolDefinition, input: Record<string, unknown>) {
  const schema = definition.parameters;
  for (const name of schema.required ?? []) {
    if (!Object.hasOwn(input, name)) {
      throw new Error(`缺少必填参数：${name}`);
    }
  }

  for (const [name, value] of Object.entries(input)) {
    if (!Object.hasOwn(schema.properties, name)) {
      throw new Error(`不支持的工具参数：${name}`);
    }
    const property = schema.properties[name];
    const numeric = property.type === 'number' || property.type === 'integer';
    const validType = numeric
      ? typeof value === 'number' && Number.isFinite(value) && (property.type !== 'integer' || Number.isInteger(value))
      : typeof value === property.type;
    if (!validType) {
      throw new Error(`参数 ${name} 的类型应为 ${property.type}。`);
    }
    if (property.enum && !property.enum.includes(value as string)) {
      throw new Error(`参数 ${name} 不在允许的选项中。`);
    }
    if (typeof value === 'number' && (
      (property.minimum !== undefined && value < property.minimum)
      || (property.maximum !== undefined && value > property.maximum)
      || (property.exclusiveMinimum !== undefined && value <= property.exclusiveMinimum)
    )) {
      throw new Error(`参数 ${name} 超出允许范围。`);
    }
  }
}
