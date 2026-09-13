import { createKeyedViewStore } from '../../../shared/data-views/keyedViewStore';
import type { AttributeFieldState } from '../types';

export function createAttributeFieldStore() {
  return createKeyedViewStore<AttributeFieldState>(Object.freeze({ drafts: Object.freeze([]), error: '', notice: '' }), (previous, patch) => ({
    drafts: patch.drafts ? Object.freeze(patch.drafts.map(draft => Object.freeze({ ...draft }))) : previous.drafts,
    error: patch.error ?? previous.error,
    notice: patch.notice ?? previous.notice,
  }));
}
export type AttributeFieldStore = ReturnType<typeof createAttributeFieldStore>;
