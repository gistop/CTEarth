// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataViewProvider } from '../../../shared/data-views';
import { createDataViewDataset } from '../../../shared/data-views/testing/dataViewFixtures';
import { AttributeTableProvider } from '../stores/AttributeTableProvider';
import { createAttributeTableStore } from '../stores/attributeTableStore';
import { AttributeTableView } from './AttributeTableView';
import { AttributeTableHeader } from './AttributeTableHeader';

vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: ({ count }: { count: number }) => ({ getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 30 })), getTotalSize: () => count * 30 }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup(dataset = createDataViewDataset()) {
  const onSelect = vi.fn(); const openChart = vi.fn(); const store = createAttributeTableStore();
  const element = (data = dataset) => <DataViewProvider datasets={[data]} onSelect={onSelect}><AttributeTableProvider store={store} onOpenChart={openChart}>
    <AttributeTableHeader datasetId={data.id} /><AttributeTableView datasetId={data.id} />
  </AttributeTableProvider></DataViewProvider>;
  return { ...render(element()), onSelect, openChart, store, element };
}
describe('independent attribute table UI', () => {
  it('filters and sorts without changing the data index used for selection', () => {
    const { onSelect } = setup(); fireEvent.click(screen.getByRole('button', { name: 'value' }));
    expect(screen.getAllByRole('button', { name: /^记录/ }).map(row => row.getAttribute('aria-label'))).toEqual(['记录 2', '记录 1', '记录 3']);
    fireEvent.click(screen.getByRole('button', { name: '记录 1' }), { ctrlKey: true }); expect(onSelect).toHaveBeenLastCalledWith('roads', [0, 1]);
    fireEvent.change(screen.getByLabelText('搜索属性'), { target: { value: 'beta' } }); expect(screen.getAllByRole('button', { name: /^记录/ })).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole('button', { name: '记录 2' }), { key: 'Enter' }); expect(onSelect).toHaveBeenLastCalledWith('roads', [1]);
  });

  it('keeps user field names separate from the table internal column IDs', () => {
    const dataset = createDataViewDataset(); dataset.fields = ['__index', 'selection', 'constructor'];
    dataset.records = [{ __index: 2, selection: 'second', constructor: 'A' }, { __index: 1, selection: 'first', constructor: 'B' }];
    setup(dataset); fireEvent.click(screen.getByRole('button', { name: '__index' }));
    expect(screen.getAllByRole('button', { name: /^记录/ })[0].getAttribute('aria-label')).toBe('记录 2');
    expect(screen.getByText('first')).toBeTruthy(); expect(screen.getByText('second')).toBeTruthy();
  });

  it('handles read-only analysis output equally for mouse and keyboard', () => {
    const dataset = { ...createDataViewDataset('vectorOverlay'), selectable: false, selectedIndexes: [] };
    const { onSelect, openChart } = setup(dataset); const row = screen.getByRole('button', { name: '记录 1' });
    fireEvent.click(row); fireEvent.keyDown(row, { key: 'Enter' }); expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('生成当前属性表统计图')); expect(openChart).toHaveBeenCalledWith('vectorOverlay', 'vectorOverlay', undefined);
  });

  it('passes the sorted field to the chart navigation contract and clears selection', () => {
    const { openChart, onSelect } = setup(); fireEvent.click(screen.getByRole('button', { name: 'category' }));
    fireEvent.click(screen.getByLabelText('生成当前属性表统计图')); expect(openChart).toHaveBeenCalledWith('roads', 'roads', 'category');
    fireEvent.click(screen.getByLabelText('清除选择')); expect(onSelect).toHaveBeenCalledWith('roads', []);
  });

  it('reports data-port selection failures without changing table state', () => {
    const { onSelect, store } = setup(); onSelect.mockImplementation(() => { throw new Error('Selection failed'); });
    fireEvent.click(screen.getByRole('button', { name: '记录 1' })); expect(screen.getByRole('alert').textContent).toBe('Selection failed'); expect(store.get('roads').sort).toBeNull();
  });

  it('renders missing targets and empty query results without a chart provider', () => {
    const { unmount } = setup(); fireEvent.change(screen.getByLabelText('搜索属性'), { target: { value: 'not-found' } }); expect(screen.getByText('没有匹配的要素')).toBeTruthy();
    unmount(); render(<DataViewProvider datasets={[]}><AttributeTableProvider><AttributeTableView datasetId="gone" /></AttributeTableProvider></DataViewProvider>);
    expect(screen.getByText('请选择矢量图层后打开属性表')).toBeTruthy();
  });
});
