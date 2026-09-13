// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataViewProvider } from '../../../shared/data-views';
import { createDataViewDataset } from '../../../shared/data-views/testing/dataViewFixtures';
import { AttributeTableProvider } from '../stores/AttributeTableProvider';
import { useAttributeFieldRibbonGroups } from './AttributeFieldRibbon';

afterEach(cleanup);

function RibbonProbe({ datasetId = 'roads' }: { datasetId?: string }) {
  const groups = useAttributeFieldRibbonGroups(datasetId);
  return <div>{groups.flatMap(group => group.tools.map(tool => <button key={tool.label} disabled={tool.disabled} onClick={tool.onClick}>{tool.label}</button>))}</div>;
}

describe('attribute field ribbon groups', () => {
  it('exposes field editing actions and removes only the last draft', () => {
    const dataset = { ...createDataViewDataset(), editable: true };
    render(<DataViewProvider datasets={[dataset]}><AttributeTableProvider onAddFields={vi.fn()}><RibbonProbe /></AttributeTableProvider></DataViewProvider>);
    fireEvent.click(screen.getByRole('button', { name: '新建字段' }));
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '新建字段' }));
    fireEvent.click(screen.getByRole('button', { name: '删除新增' }));
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '删除新增' }));
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables all editing actions for a read-only dataset or missing host callback', () => {
    const readonly = { ...createDataViewDataset(), editable: false };
    render(<DataViewProvider datasets={[readonly]}><AttributeTableProvider onAddFields={vi.fn()}><RibbonProbe /></AttributeTableProvider></DataViewProvider>);
    expect((screen.getByRole('button', { name: '新建字段' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<DataViewProvider datasets={[{ ...createDataViewDataset(), editable: true }]}><AttributeTableProvider><RibbonProbe /></AttributeTableProvider></DataViewProvider>);
    expect((screen.getByRole('button', { name: '新建字段' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
