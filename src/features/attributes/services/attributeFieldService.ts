import { validateDataFields } from '../../../shared/data-views/dataFieldService';
import type { DataFieldDefinition } from '../../../shared/data-views/types';
import type { AttributeFieldDraft } from '../types';

export function createAttributeFieldDraft(existingNames: readonly string[], id: string): AttributeFieldDraft {
  const names = new Set(existingNames.map(name => name.toLowerCase()));
  let suffix = 1;
  while (names.has(`field_${suffix}`)) suffix += 1;
  return { id, name: `field_${suffix}`, alias: '', type: 'text', nullable: true, defaultValue: '', length: '255' };
}

export function compileAttributeFields(drafts: readonly AttributeFieldDraft[], existingNames: readonly string[]): DataFieldDefinition[] {
  if (!drafts.length) throw new Error('请先添加至少一个字段。');
  const fields = drafts.map(draft => {
    const raw = draft.defaultValue;
    const trimmed = raw.trim();
    let defaultValue: DataFieldDefinition['defaultValue'] = null;
    if (raw !== '') {
      if (draft.type === 'text') defaultValue = raw;
      else if (draft.type === 'boolean') {
        if (!['true', 'false'].includes(trimmed)) throw new Error(`字段“${draft.name}”的布尔默认值须为 true 或 false。`);
        defaultValue = trimmed === 'true';
      } else if (draft.type === 'date') defaultValue = trimmed;
      else {
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) throw new Error(`字段“${draft.name}”的默认值须为有效数字。`);
        defaultValue = Number(trimmed);
      }
    }
    return { name: draft.name.trim(), alias: draft.alias.trim(), type: draft.type, nullable: draft.nullable, defaultValue, length: draft.type === 'text' ? Number(draft.length) : null };
  });
  validateDataFields(fields, existingNames);
  return fields;
}
