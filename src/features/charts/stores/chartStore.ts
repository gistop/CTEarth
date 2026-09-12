import { createKeyedViewStore } from '../../../shared/data-views/keyedViewStore';
import type { ChartState } from '../types';

export function createChartStore() {
  return createKeyedViewStore<ChartState>(Object.freeze({ field: '', kind: 'distribution' }), (previous, patch) => {
    const next = { ...previous, ...patch };
    if (typeof next.field !== 'string' || !['distribution', 'bar', 'pie'].includes(next.kind)) throw new Error('图表配置无效。');
    return { field: next.field, kind: next.kind };
  });
}
export type ChartStore = ReturnType<typeof createChartStore>;
