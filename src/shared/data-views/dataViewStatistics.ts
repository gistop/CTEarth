import { formatDataValue, isMissingValue } from './dataViewQueryService';
import type { CategoryCount } from './types';

export function countCategories(values: readonly unknown[], limit: number): CategoryCount[] {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('分类数量上限必须是正整数。');
  const counts = new Map<string, number>();
  values.forEach(value => {
    if (isMissingValue(value)) return;
    const name = formatDataValue(value);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  const ordered = [...counts].sort((first, second) => second[1] - first[1]).map(([name, value]) => ({ name, value }));
  if (ordered.length <= limit) return ordered;
  let otherName = '其他';
  while (counts.has(otherName)) otherName += '（合并）';
  return [...ordered.slice(0, limit), { name: otherName, value: ordered.slice(limit).reduce((sum, category) => sum + category.value, 0) }];
}

export function formatStatisticNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return Math.abs(value) < 0.01 || Math.abs(value) >= 1e9 ? value.toPrecision(4) : value.toFixed(2);
}

export function buildHistogram(values: readonly number[]): CategoryCount[] {
  if (!values.length) return [];
  let minimum = Infinity; let maximum = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error('直方图只能接受有限数值。');
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
  }
  if (minimum === maximum) return [{ name: formatStatisticNumber(minimum), value: values.length }];
  const count = Math.min(24, Math.max(6, Math.ceil(Math.sqrt(values.length))));
  const interpolate = (fraction: number) => minimum * (1 - fraction) + maximum * fraction;
  const bins = Array.from({ length: count }, (_, index) => ({ name: `${formatStatisticNumber(interpolate(index / count))} - ${formatStatisticNumber(interpolate((index + 1) / count))}`, value: 0 }));
  const scale = Math.max(Math.abs(minimum), Math.abs(maximum));
  const start = minimum / scale; const span = maximum / scale - start;
  for (const value of values) {
    const index = Math.max(0, Math.min(count - 1, Math.floor(((value / scale - start) / span) * count)));
    bins[index].value += 1;
  }
  return bins;
}
