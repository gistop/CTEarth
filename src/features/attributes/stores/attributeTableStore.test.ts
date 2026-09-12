import { describe, expect, it, vi } from 'vitest';
import { createAttributeTableStore } from './attributeTableStore';
describe('attribute table state', () => {
  it('owns sorting without copying filter or data state', () => {
    const store = createAttributeTableStore(); const sort = { field: 'value', direction: 'asc' as const };
    store.update('roads', { sort }); sort.field = 'changed';
    expect(store.get('roads').sort?.field).toBe('value'); expect(Object.isFrozen(store.get('roads').sort)).toBe(true);
    expect(store.get('other').sort).toBeNull(); expect(Object.keys(store.get('roads'))).toEqual(['sort']);
  });
  it('supports clearing, pruning and no-op updates', () => {
    const store = createAttributeTableStore(); const listener = vi.fn(); store.subscribe(listener);
    store.update('roads', { sort: null }); expect(listener).not.toHaveBeenCalled();
    store.update('roads', { sort: { field: 'value', direction: 'desc' } }); store.retain([]); expect(store.get('roads').sort).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed sort requests before changing state', () => {
    const store = createAttributeTableStore();
    expect(() => store.update('roads', { sort: { field: 'value', direction: 'wrong' as 'asc' } })).toThrow();
    expect(store.get('roads').sort).toBeNull();
  });
});
