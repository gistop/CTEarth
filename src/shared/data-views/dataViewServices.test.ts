import { describe, expect, it, vi } from 'vitest';
import { formatDataValue, getDataValue, nextDataSort, queryDataRows, selectDataRow, sortDataRows, toFiniteNumber } from './dataViewQueryService';
import { buildHistogram, countCategories } from './dataViewStatistics';
import { createDataViewFilterStore, defaultDataViewFilter } from './dataViewFilterStore';
import { createDataViewDataset } from './testing/dataViewFixtures';

describe('shared data-view query and statistics', () => {
  it('shares query/selection semantics while preserving original record indexes and values', () => {
    const dataset = createDataViewDataset();
    const rows = queryDataRows(dataset, { query: '  bEtA ', showSelectedOnly: true });
    expect(rows.map(row => row.recordIndex)).toEqual([1]); expect(rows[0].values).toBe(dataset.records[1]);
    expect(queryDataRows(dataset, { query: 'Alpha', showSelectedOnly: true })).toEqual([]);
    expect(queryDataRows(null, defaultDataViewFilter)).toEqual([]);
  });

  it('sorts actual numbers and numeric text without treating missing data as zero', () => {
    const rows = queryDataRows(createDataViewDataset(), defaultDataViewFilter);
    expect(sortDataRows(rows, { field: 'value', direction: 'asc' }).map(row => row.recordIndex)).toEqual([1, 0, 2]);
    expect(sortDataRows(rows, { field: 'value', direction: 'desc' }).map(row => row.recordIndex)).toEqual([0, 1, 2]);
    expect(rows.map(row => row.recordIndex)).toEqual([0, 1, 2]); expect(sortDataRows(rows, null)).toBe(rows);
  });

  it('cycles sorting and keeps equal values in original record order', () => {
    const ascending = nextDataSort(null, 'category'); const descending = nextDataSort(ascending, 'category');
    expect(ascending?.direction).toBe('asc'); expect(descending?.direction).toBe('desc'); expect(nextDataSort(descending, 'category')).toBeNull();
    expect(sortDataRows(queryDataRows(createDataViewDataset(), defaultDataViewFilter), ascending).map(row => row.recordIndex)).toEqual([0, 2, 1]);
  });

  it('handles user fields resembling internal names without reading prototypes', () => {
    const record = JSON.parse('{"__proto__": 4, "constructor": 5, "__index": 6}');
    expect(getDataValue(record, '__proto__')).toBe(4); expect(getDataValue({}, '__proto__')).toBeUndefined();
    expect(getDataValue({}, 'constructor')).toBeUndefined(); expect(getDataValue(record, '__index')).toBe(6);
  });

  it('does not coerce booleans, arrays, null and whitespace into chart numbers', () => {
    [null, undefined, '', ' ', false, true, [], [5], Infinity, 'Infinity', NaN].forEach(value => expect(toFiniteNumber(value)).toBeNull());
    expect(toFiniteNumber('0')).toBe(0); expect(toFiniteNumber('-2.5')).toBe(-2.5);
    expect(formatDataValue({ name: 'A' })).toBe('{"name":"A"}');
    const circular: Record<string, unknown> = {}; circular.self = circular; expect(formatDataValue(circular)).toContain('无法序列化');
  });

  it('supports replacement and additive selection without mutating authoritative selection', () => {
    const dataset = createDataViewDataset();
    expect(selectDataRow(dataset, 0, true)).toEqual([0, 1]); expect(selectDataRow(dataset, 1, true)).toEqual([]);
    expect(selectDataRow(dataset, 2, false)).toEqual([2]); expect(dataset.selectedIndexes).toEqual([1]);
    expect(() => selectDataRow({ ...dataset, selectable: false }, 0, false)).toThrow('不支持');
    expect(() => selectDataRow(dataset, 99, false)).toThrow('不存在');
  });

  it('preserves category totals and avoids collision with a real category named 其他', () => {
    const categories = countCategories(['其他', '其他', 'A', 'A', 'B', 'C', null, ' '], 2);
    expect(categories).toEqual([{ name: '其他', value: 2 }, { name: 'A', value: 2 }, { name: '其他（合并）', value: 2 }]);
    expect(countCategories(['__proto__', '__proto__'], 1)).toEqual([{ name: '__proto__', value: 2 }]);
    expect(() => countCategories([], 0)).toThrow();
  });

  it('bins large arrays and extreme finite numbers without argument or range overflow', () => {
    const values = Array.from({ length: 200000 }, (_, index) => index);
    const bins = buildHistogram(values); expect(bins).toHaveLength(24); expect(bins.reduce((sum, bin) => sum + bin.value, 0)).toBe(values.length);
    const extreme = buildHistogram([-1e308, 0, 1e308]);
    expect(extreme.reduce((sum, bin) => sum + bin.value, 0)).toBe(3); expect(extreme.every(bin => !/Infinity|NaN/.test(bin.name))).toBe(true);
  });

  it('handles constant, tiny and invalid histogram inputs', () => {
    expect(buildHistogram([0, 0])).toEqual([{ name: '0', value: 2 }]); expect(buildHistogram([])).toEqual([]);
    expect(buildHistogram([1e-9, 2e-9]).some(bin => bin.name.includes('e-9'))).toBe(true);
    expect(() => buildHistogram([Infinity])).toThrow('有限');
  });
});

describe('dataset-scoped filter store', () => {
  it('publishes immutable snapshots only for real changes and supports special dataset IDs', () => {
    const store = createDataViewFilterStore(); const listener = vi.fn(); const unsubscribe = store.subscribe(listener);
    store.update('__proto__', { query: 'Alpha' }); expect(store.get('__proto__').query).toBe('Alpha');
    expect(store.get('other')).toBe(defaultDataViewFilter); expect(Object.isFrozen(store.get('__proto__'))).toBe(true);
    store.update('__proto__', { query: 'Alpha' }); expect(listener).toHaveBeenCalledTimes(1);
    store.retain([]); expect(store.get('__proto__')).toBe(defaultDataViewFilter); unsubscribe();
    store.update('other', { query: 'new' }); expect(listener).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid filters and does not leak state between stores', () => {
    const store = createDataViewFilterStore(); store.update('roads', { query: 'A' });
    expect(createDataViewFilterStore().get('roads').query).toBe('');
    expect(() => store.update('', {})).toThrow(); expect(() => store.update('roads', { query: 5 as unknown as string })).toThrow();
    expect(store.get('roads').query).toBe('A');
  });
});
