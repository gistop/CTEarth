import { useMemo, useRef, type MouseEvent } from 'react';
import {
  type LegacyColumnDef,
  getCoreRowModel,
  useLegacyTable,
} from '@tanstack/react-table/legacy';
import { flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type IDockviewPanelProps } from 'dockview-react';
import { TableProperties } from 'lucide-react';
import { displayLayerName, useGis, type GeoJsonFeatureCollection } from '../../gisStore';
import { useAttributeTable, type AttributeSort } from './AttributeTableContext';

type AttributeTableRow = {
  featureIndex: number;
  properties: Record<string, unknown>;
};

type AttributeTablePanelParams = {
  layerId?: string;
};

type AttributeLayer = {
  id: string;
  fileName: string;
  geojson: GeoJsonFeatureCollection;
  fields: string[];
  selectedFeatureIndexes: number[];
};

export function AttributeTablePanel({ params }: IDockviewPanelProps<AttributeTablePanelParams>) {
  const layerId = params.layerId ?? null;
  const { getTableState, updateTableState } = useAttributeTable();
  const { layers, setLayerSelection, vectorOverlay } = useGis();
  const tableState = getTableState(layerId);
  const { query, showSelectedOnly, sort } = tableState;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const vectorOverlayLayer = useMemo<AttributeLayer | null>(() => (
    layerId === 'vectorOverlay' && vectorOverlay ? {
      id: 'vectorOverlay',
      fileName: vectorOverlay.name,
      geojson: vectorOverlay.geojson,
      fields: getFields(vectorOverlay.geojson.features),
      selectedFeatureIndexes: [],
    } : null
  ), [layerId, vectorOverlay]);
  const layer = useMemo<AttributeLayer | null>(
    () => layers.find((item) => item.id === layerId) ?? vectorOverlayLayer,
    [layerId, layers, vectorOverlayLayer],
  );
  const fields = layer?.fields ?? [];
  const selectedIndexes = useMemo(() => new Set(layer?.selectedFeatureIndexes ?? []), [layer]);
  const rows = useMemo(
    () => buildRows(layer, query, showSelectedOnly, selectedIndexes, sort),
    [layer, query, selectedIndexes, showSelectedOnly, sort],
  );
  const columns = useMemo<LegacyColumnDef<AttributeTableRow>[]>(() => [
    {
      id: '__selected',
      header: '',
      cell: ({ row }) => (
        <span className={selectedIndexes.has(row.original.featureIndex) ? 'attribute-selected-dot is-selected' : 'attribute-selected-dot'} />
      ),
      size: 34,
    },
    {
      id: '__index',
      header: 'FID',
      cell: ({ row }) => row.original.featureIndex + 1,
      size: 76,
    },
    ...fields.map((field) => ({
      id: field,
      header: field,
      accessorFn: (row: AttributeTableRow) => row.properties[field],
      cell: ({ getValue }) => formatAttributeValue(getValue()),
      size: 160,
    } satisfies LegacyColumnDef<AttributeTableRow>)),
  ], [fields, selectedIndexes]);
  const table = useLegacyTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  const tableRows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 12,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  if (!layer) {
    return (
      <section className="attribute-table-panel attribute-table-empty">
        <TableProperties size={20} />
        <span>请选择矢量图层后打开属性表</span>
      </section>
    );
  }

  const selectRow = (event: MouseEvent, featureIndex: number) => {
    if (layerId === 'vectorOverlay' || !layer) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selectedIndexes);

      if (next.has(featureIndex)) {
        next.delete(featureIndex);
      } else {
        next.add(featureIndex);
      }

      setLayerSelection(layer.id, [...next]);
      return;
    }

    setLayerSelection(layer.id, [featureIndex]);
  };

  return (
    <section className="attribute-table-panel" aria-label={`${displayLayerName(layer.fileName)} 属性表`}>
      <div className="attribute-table-grid" ref={scrollRef}>
        <div className="attribute-table-header">
          {table.getHeaderGroups().map((headerGroup) => (
            <div className="attribute-table-row attribute-table-head-row" key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <button
                  className={sort?.field === header.column.id ? `is-sorted ${sort.direction}` : undefined}
                  key={header.id}
                  style={{ width: `${header.getSize()}px` }}
                  type="button"
                  disabled={header.column.id.startsWith('__')}
                  onClick={() => updateTableState(layer.id, { sort: nextSort(sort, header.column.id) })}
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="attribute-table-body" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {virtualRows.map((virtualRow) => {
            const row = tableRows[virtualRow.index];
            const isSelected = selectedIndexes.has(row.original.featureIndex);

            return (
              <div
                className={`attribute-table-row${isSelected ? ' is-selected' : ''}`}
                key={row.id}
                role="button"
                tabIndex={0}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
                onClick={(event) => selectRow(event, row.original.featureIndex)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setLayerSelection(layer.id, [row.original.featureIndex]);
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div className="attribute-table-cell" key={cell.id} style={{ width: `${cell.column.getSize()}px` }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {rows.length === 0 ? (
          <div className="attribute-table-no-rows">没有匹配的要素</div>
        ) : null}
      </div>
    </section>
  );
}

function buildRows(
  layer: AttributeLayer | null,
  query: string,
  showSelectedOnly: boolean,
  selectedIndexes: Set<number>,
  sort: AttributeSort | null,
) {
  if (!layer) {
    return [];
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const rows = layer.geojson.features.flatMap((feature, featureIndex) => {
    const properties = isRecord(feature) && isRecord(feature.properties) ? feature.properties : {};

    if (showSelectedOnly && !selectedIndexes.has(featureIndex)) {
      return [];
    }

    if (normalizedQuery && !rowMatchesQuery(properties, normalizedQuery)) {
      return [];
    }

    return [{ featureIndex, properties }];
  });

  if (!sort) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    const comparison = compareAttributeValues(left.properties[sort.field], right.properties[sort.field]);

    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

function getFields(features: unknown[]) {
  const fields = new Set<string>();

  for (const feature of features) {
    const properties = isRecord(feature) && isRecord(feature.properties) ? feature.properties : {};

    Object.keys(properties).forEach((key) => fields.add(key));
  }

  return [...fields].sort();
}

function nextSort(current: AttributeSort | null, field: string): AttributeSort | null {
  if (current?.field !== field) {
    return { field, direction: 'asc' };
  }

  if (current.direction === 'asc') {
    return { field, direction: 'desc' };
  }

  return null;
}

function rowMatchesQuery(properties: Record<string, unknown>, query: string) {
  return Object.values(properties).some((value) => (
    formatAttributeValue(value).toLocaleLowerCase().includes(query)
  ));
}

function compareAttributeValues(left: unknown, right: unknown) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return formatAttributeValue(left).localeCompare(formatAttributeValue(right), undefined, { numeric: true });
}

function formatAttributeValue(value: unknown) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
