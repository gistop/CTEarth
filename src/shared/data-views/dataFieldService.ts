import type { DataFieldDefinition, DataFieldType } from './types';

export const dataFieldTypeLabels: Readonly<Record<DataFieldType, string>> = Object.freeze({
  text: '文本', integer: '长整型', decimal: '双精度', boolean: '布尔', date: '日期',
});

export function isDataFieldDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function validateDataFields(fields: readonly DataFieldDefinition[], existingNames: readonly string[] = []) {
  const names = new Set(existingNames.map(name => name.toLowerCase()));
  for (const field of fields) {
    if (typeof field.name !== 'string' || !/^[\p{L}_][\p{L}\p{N}_]{0,63}$/u.test(field.name)) {
      throw new Error('字段名须以字母、中文或下划线开头，只能包含字母、数字和下划线，最多 64 个字符。');
    }
    const key = field.name.toLowerCase();
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`字段名“${field.name}”是保留名称。`);
    if (names.has(key)) throw new Error(`字段名“${field.name}”已存在，请使用不同的名称。`);
    names.add(key);
    if (typeof field.alias !== 'string' || field.alias.length > 128) throw new Error(`字段“${field.name}”的别名最多 128 个字符。`);
    if (!Object.hasOwn(dataFieldTypeLabels, field.type) || typeof field.nullable !== 'boolean') throw new Error(`字段“${field.name}”的定义无效。`);
    if (field.type === 'text') {
      if (!Number.isInteger(field.length) || field.length! < 1 || field.length! > 65535) throw new Error(`字段“${field.name}”的文本长度须为 1–65535 的整数。`);
    } else if (field.length !== null) {
      throw new Error(`字段“${field.name}”不支持文本长度。`);
    }
    const value = field.defaultValue;
    if (value === null) {
      if (!field.nullable) throw new Error(`字段“${field.name}”不允许空值，请填写默认值。`);
      continue;
    }
    const valid = field.type === 'text' ? typeof value === 'string' && Array.from(value).length <= field.length!
      : field.type === 'integer' ? typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
      : field.type === 'decimal' ? typeof value === 'number' && Number.isFinite(value)
      : field.type === 'boolean' ? typeof value === 'boolean'
      : typeof value === 'string' && isDataFieldDate(value);
    if (!valid) throw new Error(`字段“${field.name}”的默认值不符合${dataFieldTypeLabels[field.type]}类型或长度限制。`);
  }
}
