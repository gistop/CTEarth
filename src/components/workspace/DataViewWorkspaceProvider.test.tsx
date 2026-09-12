// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataViewWorkspaceProvider } from './DataViewWorkspaceProvider';
import { AttributeTableHeader } from '../../features/attributes';
import { ChartPanelView } from '../../features/charts/components/ChartPanelView';
import { createEditableLayer } from '../../features/digitize/testing/digitizeFixtures';
import { useDataView } from '../../shared/data-views';
import type { ChartModel } from '../../features/charts';
import type { UploadedLayer, VectorOverlay } from '../../gisStore';

const gis = vi.hoisted(() => ({ layers: [] as UploadedLayer[], vectorOverlay: null as VectorOverlay | null, setLayerSelection: vi.fn() }));
vi.mock('../../features/layers', () => ({ useLayerStore: () => gis }));
vi.mock('../../gisStore', () => ({ displayLayerName: (name: string) => name }));
vi.mock('../../features/charts/components/ChartCanvas', () => ({ ChartCanvas: ({ model }: { model: ChartModel }) => <output data-testid="chart-model">{JSON.stringify(model)}</output> }));
function SelectionProbe() {
  const { rows, select } = useDataView('points');
  return <><output data-testid="rows">{rows.map(row => row.recordIndex).join(',')}</output><button onClick={() => select('points', [0])}>Select first</button></>;
}
beforeEach(() => { gis.layers = [createEditableLayer()]; gis.vectorOverlay = null; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('workspace composition of independent data views', () => {
  it('synchronizes filters in both directions without copying authoritative data', () => {
    const layer = gis.layers[0];
    layer.geojson = { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: null, properties: { name: 'Alpha', value: 10 } },
      { type: 'Feature', geometry: null, properties: { name: 'Beta', value: 20 } },
    ] };
    const view = render(<DataViewWorkspaceProvider onOpenTable={vi.fn()} onOpenChart={vi.fn()}><AttributeTableHeader datasetId="points" /><ChartPanelView datasetId="points" /><SelectionProbe /></DataViewWorkspaceProvider>);
    fireEvent.change(screen.getByLabelText('搜索属性'), { target: { value: 'Alpha' } });
    expect((screen.getByLabelText('图表搜索属性') as HTMLInputElement).value).toBe('Alpha'); expect(screen.getByTestId('rows').textContent).toBe('0');
    fireEvent.change(screen.getByLabelText('图表搜索属性'), { target: { value: 'Beta' } });
    expect((screen.getByLabelText('搜索属性') as HTMLInputElement).value).toBe('Beta'); expect(screen.getByTestId('rows').textContent).toBe('1');
    fireEvent.click(screen.getByText('Select first')); expect(gis.setLayerSelection).toHaveBeenCalledWith('points', [0]);
    expect(layer.selectedFeatureIndexes).toEqual([]); expect(layer.geojson.features).toHaveLength(2);
    view.unmount();
  });

  it('connects chart navigation, responds to fresh GIS selection, and prunes removed datasets', () => {
    const onOpenChart = vi.fn(); const element = () => <DataViewWorkspaceProvider onOpenTable={vi.fn()} onOpenChart={onOpenChart}><AttributeTableHeader datasetId="points" /><ChartPanelView datasetId="points" /></DataViewWorkspaceProvider>;
    const view = render(element()); fireEvent.click(screen.getByLabelText('生成当前属性表统计图'));
    expect(onOpenChart).toHaveBeenCalledWith('points', 'points.geojson', undefined);
    gis.layers = [{ ...gis.layers[0], selectedFeatureIndexes: [0] }]; view.rerender(element());
    fireEvent.click(screen.getByRole('button', { name: '已选 1' })); expect((screen.getByLabelText('仅显示已选') as HTMLInputElement).checked).toBe(true);
    gis.layers = []; view.rerender(element()); expect(screen.getByText('请选择矢量图层后生成图表')).toBeTruthy();
    gis.layers = [createEditableLayer()]; view.rerender(element()); expect((screen.getByLabelText('仅显示已选') as HTMLInputElement).checked).toBe(false);
  });
});
