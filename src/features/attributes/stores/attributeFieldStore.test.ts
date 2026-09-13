import { describe, expect, it, vi } from 'vitest';
import { createAttributeFieldStore } from './attributeFieldStore';
import { createAttributeFieldDraft } from '../services/attributeFieldService';

describe('field draft state', () => {
  it('isolates datasets, owns immutable drafts and prunes removed datasets', () => {
    const store = createAttributeFieldStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const draft = createAttributeFieldDraft([], 'draft');
    store.update('first', { drafts: [draft] });
    expect(store.get('first').drafts[0]).not.toBe(draft);
    expect(Object.isFrozen(store.get('first').drafts[0])).toBe(true);
    expect(store.get('second').drafts).toEqual([]);
    store.retain(['second']);
    expect(store.get('first').drafts).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
