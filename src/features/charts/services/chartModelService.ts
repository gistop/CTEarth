import { buildHistogram, countCategories } from '../../../shared/data-views/dataViewStatistics';
import { getDataValue, isMissingValue, toFiniteNumber } from '../../../shared/data-views/dataViewQueryService';
import type { DataViewDataset, DataViewRow } from '../../../shared/data-views/types';
import type { ChartKind, ChartModel } from '../types';

export function chooseChartField(dataset: DataViewDataset | null, preferred?: string): string {
  if (!dataset) return '';
  if (preferred && dataset.fields.includes(preferred)) return preferred;
  const numeric = dataset.fields.find(field => {
    const values = dataset.records.slice(0, 80).map(record => getDataValue(record, field)).filter(value => !isMissingValue(value));
    return values.length > 0 && values.every(value => toFiniteNumber(value) !== null);
  });
  return numeric ?? dataset.fields[0] ?? '';
}

export function buildChartModel(rows: readonly DataViewRow[], field: string, kind: ChartKind): ChartModel {
  if (!['distribution', 'bar', 'pie'].includes(kind)) throw new Error('不支持的图表类型。');
  const empty = (summary: string): ChartModel => ({ kind: 'empty', title: '', categories: [], summary });
  if (!field) return empty('没有可统计字段');
  const values = rows.map(row => getDataValue(row.values, field)).filter(value => !isMissingValue(value));
  if (!values.length) return empty('当前筛选没有可统计值');
  const numbers = values.map(toFiniteNumber).filter((number): number is number => number !== null);
  if (kind === 'distribution' && numbers.length / values.length >= 0.8) {
    const categories = buildHistogram(numbers);
    const skipped = values.length - numbers.length;
    return { kind: 'bar', title: `${field} 分布`, categories, summary: `${numbers.length} 个数值，${categories.length} 个分组${skipped ? `，忽略 ${skipped} 个非数值` : ''}` };
  }
  const categories = countCategories(values, kind === 'pie' ? 12 : 30);
  return { kind: kind === 'pie' ? 'pie' : 'bar', title: `${field} ${kind === 'pie' ? '占比' : kind === 'bar' ? '柱状图' : '分布图'}`, categories, summary: `${categories.length} 个分类` };
}
