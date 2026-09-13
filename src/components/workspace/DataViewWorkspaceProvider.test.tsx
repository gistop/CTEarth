// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataViewWorkspaceProvider } from './DataViewWorkspaceProvider';
import { AttributeFieldsHeader, AttributeTableHeader } from '../../features/attributes';
import { AttributeFieldsView } from '../../features/attributes/components/AttributeFieldsView';
import { getLayerFields } from '../../features/layers/services/layerFieldService';
import { ChartPanelView } from '../../features/charts/components/ChartPanelView';
import { createEditableLayer } from '../../features/digitize/testing/digitizeFixtures';
import { useDataView } from '../../shared/data-views';
import type { ChartModel } from '../../features/charts';
import type { GeoJsonFeatureCollection, UploadedLayer, VectorOverlay } from '../../gisStore';

const gis = vi.hoisted(() => ({ layers: [] as UploadedLayer[], vectorOverlay: null as VectorOverlay | null, setLayerSelection: vi.fn(), updateUploadedLayerGeoJson: vi.fn() }));
vi.mock('../../features/layers', async () => ({ ...await import('../../features/layers/services/layerFieldService'), useLayerStore: () => gis }));
vi.mock('../../gisStore', () => ({ displayLayerName: (name: string) => name }));
vi.mock('../../features/charts/components/ChartCanvas', () => ({ ChartCanvas: ({ model }: { model: ChartModel }) => <output data-testid="chart-model">{JSON.stringify(model)}</output> }));
function SelectionProbe() {
  const { rows, select } = useDataView('points');
  return <><output data-testid="rows">{rows.map(row => row.recordIndex).join(',')}</output><button onClick={() => select('points', [0])}>Select first</button></>;
}
beforeEach(() => { gis.layers = [createEditableLayer()]; gis.vectorOverlay = null; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('workspace composition of independent data views', () => {
  it('adds fields to the entire GIS layer without changing selection, geometry or shared filtering', () => {
    const original = gis.layers[0];
    const second = { type: 'Feature', geometry: null, properties: { name: 'hidden', value: 10 } };
    gis.layers = [{ ...original, geojson: { ...original.geojson, features: [...original.geojson.features, second] }, selectedFeatureIndexes: [1] }];
    const onOpenFields = vi.fn();
    const element = () => <DataViewWorkspaceProvider onOpenTable={vi.fn()} onOpenChart={vi.fn()} onOpenFields={onOpenFields}>
      <AttributeTableHeader datasetId='points' /><AttributeFieldsHeader datasetId='points' /><AttributeFieldsView datasetId='points' /><SelectionProbe />
    </DataViewWorkspaceProvider>;
    const view = render(element());
    gis.updateUploadedLayerGeoJson.mockImplementation((id: string, geojson: GeoJsonFeatureCollection) => {
      gis.layers = gis.layers.map(layer => layer.id === id ? { ...layer, geojson, fields: getLayerFields(geojson) } : layer);
    });
    fireEvent.change(screen.getByLabelText('搜索属性'), { target: { value: 'hidden' } });
    fireEvent.click(screen.getByLabelText('添加字段'));
    expect(onOpenFields).toHaveBeenCalledWith('points', 'points.geojson');
    fireEvent.change(screen.getByLabelText('新增字段 1 名称'), { target: { value: 'population' } });
    fireEvent.change(screen.getByLabelText('新增字段 1 数据类型'), { target: { value: 'integer' } });
    fireEvent.change(screen.getByLabelText('新增字段 1 默认值'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: '保存字段' }));
    expect(gis.updateUploadedLayerGeoJson).toHaveBeenCalledTimes(1);
    expect(gis.layers[0].geojson.features).toEqual([
      { ...original.geojson.features[0] as object, properties: { name: 'point-1', value: 42, population: 9 } },
      { ...second, properties: { name: 'hidden', value: 10, population: 9 } },
    ]);
    expect(gis.layers[0].selectedFeatureIndexes).toEqual([1]);
    expect(original.fields).toEqual(['name', 'value']);
    view.rerender(element());
    expect(screen.getByRole('rowheader', { name: 'population' })).toBeTruthy();
    expect(screen.getByTestId('rows').textContent).toBe('1');
    expect(gis.setLayerSelection).not.toHaveBeenCalled();
  });

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
