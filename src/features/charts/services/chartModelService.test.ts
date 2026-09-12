import { describe, expect, it } from 'vitest';
import { createDataViewDataset } from '../../../shared/data-views/testing/dataViewFixtures';
import { defaultDataViewFilter } from '../../../shared/data-views/dataViewFilterStore';
import { queryDataRows } from '../../../shared/data-views/dataViewQueryService';
import { buildChartModel, chooseChartField } from './chartModelService';
describe('engine-independent chart models', () => {
  it('chooses a numeric default or an existing preferred field', () => {
    const dataset = createDataViewDataset(); expect(chooseChartField(dataset)).toBe('value'); expect(chooseChartField(dataset, 'category')).toBe('category');
    expect(chooseChartField(dataset, 'deleted')).toBe('value'); expect(chooseChartField(null)).toBe('');
  });
  it('produces histograms with an explicit skipped-value count', () => {
    const rows = [1, 2, 3, 4, 'bad'].map((value, recordIndex) => ({ recordIndex, values: { value } }));
    const model = buildChartModel(rows, 'value', 'distribution');
    expect(model.kind).toBe('bar'); expect(model.summary).toContain('忽略 1 个非数值'); expect(model.categories.reduce((sum, item) => sum + item.value, 0)).toBe(4);
  });
  it('uses category counts for nonnumeric distribution, bar and pie charts', () => {
    const rows = queryDataRows(createDataViewDataset(), defaultDataViewFilter);
    expect(buildChartModel(rows, 'category', 'distribution').categories).toEqual([{ name: 'A', value: 2 }, { name: 'B', value: 1 }]);
    expect(buildChartModel(rows, 'value', 'bar').categories).toHaveLength(2); expect(buildChartModel(rows, 'category', 'pie').kind).toBe('pie');
  });
  it('clears charts for empty datasets/fields and does not read inherited properties', () => {
    expect(buildChartModel([], 'value', 'pie').kind).toBe('empty'); expect(buildChartModel([], '', 'bar').summary).toContain('字段');
    expect(buildChartModel([{ recordIndex: 0, values: {} }], '__proto__', 'pie').kind).toBe('empty');
    expect(() => buildChartModel([], '', 'unknown' as 'pie')).toThrow();
  });
});
