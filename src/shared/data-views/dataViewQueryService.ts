import type { DataRecord, DataViewDataset, DataViewFilter, DataViewRow, DataViewSort } from './types';

export function isDataRecord(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatDataValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value) ?? ''; } catch { return '[无法序列化的值]'; }
  }
  return String(value);
}

export function getDataValue(record: DataRecord, field: string): unknown {
  return Object.hasOwn(record, field) ? record[field] : undefined;
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isMissingValue(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

export function queryDataRows(dataset: DataViewDataset | null, filter: DataViewFilter): DataViewRow[] {
  if (!dataset) return [];
  const query = filter.query.trim().toLocaleLowerCase();
  const selected = new Set(dataset.selectedIndexes);
  return dataset.records.flatMap((values, recordIndex) => {
    if (filter.showSelectedOnly && !selected.has(recordIndex)) return [];
    if (query && !Object.values(values).some(value => formatDataValue(value).toLocaleLowerCase().includes(query))) return [];
    return [{ recordIndex, values }];
  });
}

export function sortDataRows(rows: DataViewRow[], sort: DataViewSort | null): DataViewRow[] {
  if (!sort) return rows;
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const first = getDataValue(left.values, sort.field); const second = getDataValue(right.values, sort.field);
    if (isMissingValue(first) || isMissingValue(second)) return Number(isMissingValue(first)) - Number(isMissingValue(second)) || left.recordIndex - right.recordIndex;
    const firstNumber = toFiniteNumber(first); const secondNumber = toFiniteNumber(second);
    const comparison = firstNumber !== null && secondNumber !== null ? Math.sign(firstNumber - secondNumber)
      : firstNumber !== null ? -1 : secondNumber !== null ? 1 : formatDataValue(first).localeCompare(formatDataValue(second), undefined, { numeric: true });
    return direction * comparison || left.recordIndex - right.recordIndex;
  });
}

export function nextDataSort(current: DataViewSort | null, field: string): DataViewSort | null {
  return current?.field !== field ? { field, direction: 'asc' } : current.direction === 'asc' ? { field, direction: 'desc' } : null;
}

export function selectDataRow(dataset: DataViewDataset, recordIndex: number, additive: boolean): number[] {
  if (!dataset.selectable) throw new Error('当前数据集不支持选择。');
  if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= dataset.records.length) throw new Error('所选记录已不存在。');
  const selected = new Set(dataset.selectedIndexes);
  if (!additive) return [recordIndex];
  if (selected.has(recordIndex)) selected.delete(recordIndex); else selected.add(recordIndex);
  return [...selected].sort((first, second) => first - second);
}
