import { useMemo, useRef, useState } from 'react';
import { type LegacyColumnDef, getCoreRowModel, useLegacyTable } from '@tanstack/react-table/legacy';
import { flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TableProperties } from 'lucide-react';
import { formatDataValue, getDataValue, nextDataSort, selectDataRow, sortDataRows, useDataView, type DataViewRow } from '../../../shared/data-views';
import { useAttributeTableActions, useAttributeTableState } from '../stores/AttributeTableProvider';
import type { AttributeTableProps } from '../types';

export function AttributeTableView({ datasetId }: AttributeTableProps) {
  const { dataset, rows: filteredRows, select } = useDataView(datasetId);
  const { store } = useAttributeTableActions();
  const state = useAttributeTableState(datasetId);
  const sort = state.sort && dataset?.fields.includes(state.sort.field) ? state.sort : null;
  const rows = useMemo(() => sortDataRows(filteredRows, sort), [filteredRows, sort]);
  const selected = useMemo(() => new Set(dataset?.selectedIndexes), [dataset?.selectedIndexes]);
  const scroll = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const columns = useMemo<LegacyColumnDef<DataViewRow>[]>(() => [
    { id: 'selection', header: '', cell: ({ row }) => <span className={selected.has(row.original.recordIndex) ? 'attribute-selected-dot is-selected' : 'attribute-selected-dot'} />, size: 34 },
    { id: 'index', header: 'FID', cell: ({ row }) => row.original.recordIndex + 1, size: 76 },
    ...(dataset?.fields ?? []).map((field, fieldIndex) => ({ id: `field:${fieldIndex}`, header: field, accessorFn: (row: DataViewRow) => getDataValue(row.values, field), cell: ({ getValue }) => formatDataValue(getValue()), size: 160 } satisfies LegacyColumnDef<DataViewRow>)),
  ], [dataset?.fields, selected]);
  const table = useLegacyTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), getRowId: row => String(row.recordIndex) });
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => scroll.current, estimateSize: () => 30, overscan: 12, getItemKey: index => tableRows[index].id });
  const selectRow = (recordIndex: number, additive: boolean) => {
    if (!dataset?.selectable) return;
    try { select(dataset.id, selectDataRow(dataset, recordIndex, additive)); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '选择记录失败。'); }
  };
  if (!dataset) return <section className="attribute-table-panel attribute-table-empty"><TableProperties size={20} /><span>请选择矢量图层后打开属性表</span></section>;
  return <section className="attribute-table-panel" aria-label={`${dataset.name} 属性表`}>
    {error ? <div role="alert">{error}</div> : null}
    <div className="attribute-table-grid" ref={scroll}>
      <div className="attribute-table-header">
        {table.getHeaderGroups().map(group => <div className="attribute-table-row attribute-table-head-row" key={group.id}>
          {group.headers.map(header => {
            const fieldIndex = header.column.id.startsWith('field:') ? Number(header.column.id.slice(6)) : -1;
            const field = dataset.fields[fieldIndex];
            const sorted = field !== undefined && sort?.field === field;
            return <button className={sorted ? `is-sorted ${sort.direction}` : undefined} key={header.id} style={{ width: `${header.getSize()}px` }} type="button" disabled={field === undefined}
              onClick={() => { if (field !== undefined) store.update(dataset.id, { sort: nextDataSort(sort, field) }); }}>
              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
            </button>;
          })}
        </div>)}
      </div>
      <div className="attribute-table-body" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const row = tableRows[virtualRow.index];
          if (!row) return null;
          const selectedRow = selected.has(row.original.recordIndex);
          return <div className={`attribute-table-row${selectedRow ? ' is-selected' : ''}`} key={row.id} role="button" aria-label={`记录 ${row.original.recordIndex + 1}`} aria-pressed={selectedRow} aria-disabled={!dataset.selectable} tabIndex={dataset.selectable ? 0 : -1}
            style={{ transform: `translateY(${virtualRow.start}px)` }} onClick={event => selectRow(row.original.recordIndex, event.ctrlKey || event.metaKey)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRow(row.original.recordIndex, event.ctrlKey || event.metaKey); } }}>
            {row.getVisibleCells().map(cell => <div className="attribute-table-cell" key={cell.id} style={{ width: `${cell.column.getSize()}px` }}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>)}
          </div>;
        })}
      </div>
      {rows.length === 0 ? <div className="attribute-table-no-rows">没有匹配的要素</div> : null}
    </div>
  </section>;
}
