import { describe, expect, it } from 'vitest';
import { createChartStore } from './chartStore';
describe('independent chart state', () => {
  it('retains field and chart type per dataset without any table store', () => {
    const store = createChartStore(); store.update('roads', { field: 'name', kind: 'pie' });
    expect(store.get('roads')).toEqual({ field: 'name', kind: 'pie' }); expect(store.get('other').kind).toBe('distribution');
    expect(createChartStore().get('roads').field).toBe(''); expect(Object.isFrozen(store.get('roads'))).toBe(true);
  });
  it('prunes removed datasets and rejects invalid configuration', () => {
    const store = createChartStore(); store.update('roads', { field: 'value' });
    expect(() => store.update('roads', { kind: 'unknown' as 'pie' })).toThrow(); expect(store.get('roads').field).toBe('value');
    store.retain([]); expect(store.get('roads').field).toBe('');
  });
});
