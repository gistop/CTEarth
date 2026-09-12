import { useState } from 'react';
import { ChartColumn, Search, TableProperties, X } from 'lucide-react';
import { useDataViewState } from '../../../shared/data-views';
import { useAttributeTableActions, useAttributeTableState } from '../stores/AttributeTableProvider';

export function AttributeTableHeader({ datasetId }: { datasetId: string }) {
  const { dataset, filter, filters, select } = useDataViewState(datasetId);
  const { openChart } = useAttributeTableActions();
  const state = useAttributeTableState(datasetId);
  const [error, setError] = useState('');
  return <div className="attribute-header-actions" aria-label="属性表工具" onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <div className="attribute-header-title" title={dataset?.name ?? '属性表'}><TableProperties size={15} /><span>{dataset?.name ?? '属性表'}</span></div>
    <div className="attribute-header-search"><Search size={14} /><input value={filter.query} placeholder="搜索属性" aria-label="搜索属性" disabled={!dataset} onChange={event => filters.update(datasetId, { query: event.target.value })} /></div>
    <button className={filter.showSelectedOnly ? 'is-selected' : undefined} type="button" aria-pressed={filter.showSelectedOnly} disabled={!dataset?.selectable} onClick={() => filters.update(datasetId, { showSelectedOnly: !filter.showSelectedOnly })}>已选 {dataset?.selectedIndexes.length ?? 0}</button>
    <button type="button" title="清除选择" aria-label="清除选择" disabled={!dataset?.selectable || !dataset.selectedIndexes.length} onClick={() => {
      try { select(datasetId, []); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '清除选择失败。'); }
    }}><X size={14} /><span>清除</span></button>
    <button type="button" title="生成统计图" aria-label="生成当前属性表统计图" disabled={!dataset?.fields.length || !openChart} onClick={() => { if (dataset) openChart?.(dataset.id, dataset.name, state.sort?.field); }}><ChartColumn size={14} /><span>图表</span></button>
    {error ? <span role="alert">{error}</span> : null}
  </div>;
}
