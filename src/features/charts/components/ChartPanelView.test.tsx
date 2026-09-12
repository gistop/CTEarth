// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataViewProvider } from '../../../shared/data-views';
import { createDataViewDataset } from '../../../shared/data-views/testing/dataViewFixtures';
import { createChartStore } from '../stores/chartStore';
import { ChartsProvider, useChartActions } from '../stores/ChartsProvider';
import { ChartPanelView } from './ChartPanelView';
import type { ChartModel } from '../types';

vi.mock('./ChartCanvas', () => ({ ChartCanvas: ({ model }: { model: ChartModel }) => <output data-testid="chart-model">{JSON.stringify(model)}</output> }));
afterEach(() => cleanup());
const model = (): ChartModel => JSON.parse(screen.getByTestId('chart-model').textContent!);
function OpenChart() { const { openChart } = useChartActions(); return <button onClick={() => openChart('roads', 'Roads', 'category')}>Open chart</button>; }
describe('independent chart UI', () => {
  it('opens and filters without any attribute-table provider or GIS store', () => {
    render(<DataViewProvider datasets={[createDataViewDataset()]}><ChartsProvider><ChartPanelView datasetId="roads" /></ChartsProvider></DataViewProvider>);
    expect((screen.getByLabelText('图表字段') as HTMLSelectElement).value).toBe('value');
    fireEvent.change(screen.getByLabelText('图表搜索属性'), { target: { value: 'Beta' } }); expect(model().summary).toContain('1 个数值');
    fireEvent.change(screen.getByLabelText('图表类型'), { target: { value: 'pie' } }); expect(model().kind).toBe('pie');
    fireEvent.click(screen.getByLabelText('仅显示已选')); expect(model().categories).toEqual([{ name: '2', value: 1 }]);
  });

  it('mounts the canvas when a dataset arrives after an initially empty view', () => {
    const element = (available: boolean) => <DataViewProvider datasets={available ? [createDataViewDataset()] : []}><ChartsProvider><ChartPanelView datasetId="roads" /></ChartsProvider></DataViewProvider>;
    const view = render(element(false)); expect(screen.queryByTestId('chart-model')).toBeNull();
    view.rerender(element(true)); expect(model().kind).toBe('bar');
  });

  it('preserves manual field choice on data/selection updates but recovers when the field is removed', () => {
    let dataset = createDataViewDataset(); const store = createChartStore();
    const element = () => <DataViewProvider datasets={[dataset]}><ChartsProvider store={store}><ChartPanelView datasetId="roads" preferredField="value" /></ChartsProvider></DataViewProvider>;
    const view = render(element()); fireEvent.change(screen.getByLabelText('图表字段'), { target: { value: 'category' } });
    dataset = { ...dataset, selectedIndexes: [0], fields: [...dataset.fields] }; view.rerender(element());
    expect((screen.getByLabelText('图表字段') as HTMLSelectElement).value).toBe('category');
    dataset = { ...dataset, fields: ['name', 'value'] }; view.rerender(element()); expect((screen.getByLabelText('图表字段') as HTMLSelectElement).value).toBe('value');
    dataset = { ...dataset, fields: [] }; view.rerender(element()); expect(model().kind).toBe('empty');
  });

  it('keeps chart configuration across panel remounts and applies explicit open requests', () => {
    const dataset = createDataViewDataset(); const store = createChartStore(); const onOpenChart = vi.fn();
    const element = (visible: boolean) => <DataViewProvider datasets={[dataset]}><ChartsProvider store={store} onOpenChart={onOpenChart}><OpenChart />{visible ? <ChartPanelView datasetId="roads" preferredField="value" /> : null}</ChartsProvider></DataViewProvider>;
    const view = render(element(true)); fireEvent.change(screen.getByLabelText('图表字段'), { target: { value: 'name' } });
    view.rerender(element(false)); view.rerender(element(true)); expect((screen.getByLabelText('图表字段') as HTMLSelectElement).value).toBe('name');
    fireEvent.click(screen.getByText('Open chart')); expect((screen.getByLabelText('图表字段') as HTMLSelectElement).value).toBe('category'); expect(onOpenChart).toHaveBeenCalledWith('roads', 'Roads', 'category');
  });

  it('keeps each dataset configuration separate and responds to ordinary store commands', () => {
    const store = createChartStore(); const datasets = [createDataViewDataset(), createDataViewDataset('schools')];
    const element = (datasetId: string) => <DataViewProvider datasets={datasets}><ChartsProvider store={store}><ChartPanelView datasetId={datasetId} /></ChartsProvider></DataViewProvider>;
    const view = render(element('roads')); fireEvent.change(screen.getByLabelText('图表类型'), { target: { value: 'pie' } });
    view.rerender(element('schools')); expect((screen.getByLabelText('图表类型') as HTMLSelectElement).value).toBe('distribution');
    act(() => { store.update('schools', { field: 'category', kind: 'bar' }); }); expect(model().title).toContain('category');
    view.rerender(element('roads')); expect((screen.getByLabelText('图表类型') as HTMLSelectElement).value).toBe('pie');
  });
});
