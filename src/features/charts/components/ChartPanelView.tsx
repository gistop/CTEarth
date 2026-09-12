import { useEffect, useMemo, useRef } from 'react';
import { ChartColumn } from 'lucide-react';
import { useDataView } from '../../../shared/data-views';
import { useChartActions, useChartState } from '../stores/ChartsProvider';
import { buildChartModel, chooseChartField } from '../services/chartModelService';
import { ChartCanvas } from './ChartCanvas';
import type { ChartKind, ChartPanelProps } from '../types';

export function ChartPanelView({ datasetId, preferredField }: ChartPanelProps) {
  const { dataset, rows, filter, filters } = useDataView(datasetId);
  const { store } = useChartActions();
  const state = useChartState(datasetId);
  const request = useRef<{ datasetId?: string; field?: string } | null>(null);
  const field = chooseChartField(dataset, state.field || preferredField);
  const model = useMemo(() => buildChartModel(rows, field, state.kind), [rows, field, state.kind]);
  useEffect(() => {
    const previous = request.current;
    if (datasetId && preferredField !== undefined && (!store.get(datasetId).field || (previous !== null && (previous.datasetId !== datasetId || previous.field !== preferredField)))) store.update(datasetId, { field: preferredField });
    request.current = { datasetId, field: preferredField };
  }, [datasetId, preferredField, store]);
  if (!dataset) return <section className="attribute-chart-panel attribute-chart-empty"><ChartColumn size={22} /><span>请选择矢量图层后生成图表</span></section>;
  return <section className="attribute-chart-panel" aria-label={`${dataset.name} 属性统计图`}>
    <header className="attribute-chart-toolbar">
      <label><span>字段</span><select aria-label="图表字段" value={field} disabled={!dataset.fields.length} onChange={event => store.update(dataset.id, { field: event.target.value })}>
        {dataset.fields.map(item => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <label><span>图表</span><select aria-label="图表类型" value={state.kind} onChange={event => store.update(dataset.id, { kind: event.target.value as ChartKind })}>
        <option value="distribution">分布图</option><option value="bar">柱状图</option><option value="pie">饼图</option>
      </select></label>
      <label><span>筛选</span><input className="attribute-chart-query" aria-label="图表搜索属性" placeholder="搜索属性" value={filter.query} onChange={event => filters.update(dataset.id, { query: event.target.value })} /></label>
      <label className="attribute-chart-selection"><input type="checkbox" checked={filter.showSelectedOnly} disabled={!dataset.selectable} onChange={event => filters.update(dataset.id, { showSelectedOnly: event.target.checked })} /><span>仅显示已选</span></label>
      <div className="attribute-chart-summary"><span>{rows.length} 条记录</span><span>{model.summary}</span></div>
    </header>
    <ChartCanvas model={model} />
  </section>;
}
