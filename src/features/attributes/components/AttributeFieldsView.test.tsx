// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataViewProvider } from '../../../shared/data-views';
import { createDataViewDataset } from '../../../shared/data-views/testing/dataViewFixtures';
import { AttributeTableProvider } from '../stores/AttributeTableProvider';
import { AttributeFieldsView } from './AttributeFieldsView';
import { AttributeFieldsHeader } from './AttributeFieldsHeader';
import { AttributeTableHeader } from './AttributeTableHeader';
import type { DataViewDataset } from '../../../shared/data-views/types';

afterEach(cleanup);

function setup(initial = { ...createDataViewDataset(), editable: true }) {
  const onOpenFields = vi.fn();
  const onAddFields = vi.fn();
  const element = (dataset: DataViewDataset | null = initial, visible = true) => (
    <DataViewProvider datasets={dataset ? [dataset] : []}>
      <AttributeTableProvider onOpenFields={onOpenFields} onAddFields={onAddFields} onOpenChart={vi.fn()}>
        <AttributeTableHeader datasetId={dataset?.id ?? initial.id} />
        <AttributeFieldsHeader datasetId={dataset?.id ?? initial.id} />
        {visible ? <AttributeFieldsView datasetId={dataset?.id ?? initial.id} /> : null}
      </AttributeTableProvider>
    </DataViewProvider>
  );
  return { ...render(element()), element, onAddFields, onOpenFields };
}

describe('field editor UI', () => {
  it('places the entry before charts and opens one draft without a repeated layer selector', () => {
    const { onOpenFields } = setup();
    const add = screen.getByLabelText('添加字段');
    const chart = screen.getByLabelText('生成当前属性表统计图');
    expect(add.nextElementSibling).toBe(chart);
    fireEvent.click(add);
    expect(onOpenFields).toHaveBeenCalledWith('roads', 'roads');
    expect((screen.getByLabelText('新增字段 1 名称') as HTMLInputElement).value).toBe('field_1');
    fireEvent.click(add);
    expect(screen.queryByLabelText('新增字段 2 名称')).toBeNull();
    expect(screen.queryByText('当前图层')).toBeNull();
    expect(screen.queryByRole('combobox', { name: '当前图层' })).toBeNull();
  });

  it('saves typed fields and keeps validation failures editable', () => {
    const { onAddFields } = setup();
    fireEvent.click(screen.getByLabelText('添加字段'));
    fireEvent.change(screen.getByLabelText('新增字段 1 名称'), { target: { value: 'value' } });
    fireEvent.click(screen.getByRole('button', { name: '保存字段' }));
    expect(screen.getByRole('alert').textContent).toContain('已存在');
    expect(onAddFields).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('新增字段 1 名称'), { target: { value: 'population' } });
    fireEvent.change(screen.getByLabelText('新增字段 1 数据类型'), { target: { value: 'integer' } });
    fireEvent.click(screen.getByLabelText('新增字段 1 允许空值'));
    fireEvent.click(screen.getByRole('button', { name: '保存字段' }));
    expect(screen.getByRole('alert').textContent).toContain('不允许空值');
    fireEvent.change(screen.getByLabelText('新增字段 1 默认值'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: '保存字段' }));
    expect(onAddFields).toHaveBeenCalledWith('roads', [{ name: 'population', alias: '', type: 'integer', nullable: false, defaultValue: 42, length: null }]);
    expect(screen.getByRole('status').textContent).toContain('已添加 1 个字段');
    expect(screen.queryByLabelText('新增字段 1 名称')).toBeNull();
  });

  it('retains drafts across panel unmounts and data refreshes, but discards them explicitly', () => {
    const dataset = { ...createDataViewDataset(), editable: true };
    const { element, rerender } = setup(dataset);
    fireEvent.click(screen.getByLabelText('添加字段'));
    fireEvent.change(screen.getByLabelText('新增字段 1 名称'), { target: { value: 'retained' } });
    rerender(element(dataset, false));
    rerender(element({ ...dataset, selectedIndexes: [0] }));
    expect((screen.getByLabelText('新增字段 1 名称') as HTMLInputElement).value).toBe('retained');
    fireEvent.click(screen.getByRole('button', { name: '单击此处添加新字段' }));
    expect(screen.getByLabelText('新增字段 2 名称')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('移除新增字段 2'));
    expect(screen.queryByLabelText('新增字段 2 名称')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '放弃新增' }));
    expect(screen.queryByLabelText('新增字段 1 名称')).toBeNull();
  });

  it('preserves drafts on host errors and cannot save removed or read-only datasets', () => {
    const { onAddFields, element, rerender } = setup();
    fireEvent.click(screen.getByLabelText('添加字段'));
    onAddFields.mockImplementation(() => { throw new Error('数据更新失败'); });
    fireEvent.click(screen.getByRole('button', { name: '保存字段' }));
    expect(screen.getByRole('alert').textContent).toBe('数据更新失败');
    expect(screen.getByLabelText('新增字段 1 名称')).toBeTruthy();
    rerender(element({ ...createDataViewDataset(), editable: false }));
    expect((screen.getByRole('button', { name: '保存字段' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('添加字段') as HTMLButtonElement).disabled).toBe(true);
    rerender(element(null));
    expect(screen.getByText('图层已移除或不可用，请重新打开字段页。')).toBeTruthy();
    rerender(element());
    expect(screen.queryByLabelText('新增字段 1 名称')).toBeNull();
  });

  it('allows schema creation on an empty layer and disables editing without host capabilities', () => {
    const { unmount } = setup({ ...createDataViewDataset(), fields: [], records: [], editable: true });
    expect((screen.getByLabelText('添加字段') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('添加字段'));
    expect(screen.getByLabelText('新增字段 1 名称')).toBeTruthy();
    unmount();
    render(<DataViewProvider datasets={[{ ...createDataViewDataset(), editable: true }]}><AttributeTableProvider><AttributeTableHeader datasetId='roads' /></AttributeTableProvider></DataViewProvider>);
    expect((screen.getByLabelText('添加字段') as HTMLButtonElement).disabled).toBe(true);
  });
});
