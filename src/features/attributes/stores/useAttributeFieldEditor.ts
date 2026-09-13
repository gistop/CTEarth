import { useSyncExternalStore } from 'react';
import { useDataViews } from '../../../shared/data-views';
import { compileAttributeFields, createAttributeFieldDraft } from '../services/attributeFieldService';
import { useAttributeTableActions } from './AttributeTableProvider';
import type { AttributeFieldDraft } from '../types';

export function useAttributeFieldEditor(datasetId?: string) {
  const { datasets } = useDataViews();
  const { fieldStore, addFields } = useAttributeTableActions();
  useSyncExternalStore(fieldStore.subscribe, fieldStore.getSnapshot, fieldStore.getSnapshot);
  const dataset = datasets.find(item => item.id === datasetId);
  const state = fieldStore.get(datasetId);
  const canEdit = Boolean(dataset?.editable && addFields);
  const changeDrafts = (drafts: readonly AttributeFieldDraft[]) => {
    if (datasetId && canEdit) fieldStore.update(datasetId, { drafts, error: '', notice: '' });
  };
  return {
    dataset, state, canEdit,
    append() {
      if (!dataset || !canEdit) return;
      const names = [...dataset.fields, ...state.drafts.map(draft => draft.name.trim())];
      changeDrafts([...state.drafts, createAttributeFieldDraft(names, crypto.randomUUID())]);
    },
    update(id: string, patch: Partial<Omit<AttributeFieldDraft, 'id'>>) {
      changeDrafts(state.drafts.map(draft => draft.id === id ? { ...draft, ...patch } : draft));
    },
    remove(id: string) { changeDrafts(state.drafts.filter(draft => draft.id !== id)); },
    discard() { changeDrafts([]); },
    save() {
      if (!dataset || !canEdit || !addFields) return;
      try {
        const fields = compileAttributeFields(state.drafts, dataset.fields);
        addFields(dataset.id, fields);
        fieldStore.update(dataset.id, { drafts: [], error: '', notice: `已添加 ${fields.length} 个字段，属性表已更新。` });
      } catch (reason) {
        fieldStore.update(dataset.id, { error: reason instanceof Error ? reason.message : '添加字段失败。', notice: '' });
      }
    },
  };
}
