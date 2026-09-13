import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { displayLayerName } from '../../gisStore';
import { addLayerFields, useLayerStore } from '../../features/layers';
import { AttributeTableProvider, type AddAttributeFields } from '../../features/attributes';
import { ChartsProvider, useChartActions } from '../../features/charts';
import { DataViewProvider, type OpenDataView } from '../../shared/data-views';
import { createGisDataViewAdapter } from './gisDataViewAdapter';

export function DataViewWorkspaceProvider({ children, onOpenTable, onOpenChart, onOpenFields }: {
  children: ReactNode; onOpenTable: OpenDataView; onOpenChart: OpenDataView; onOpenFields?: OpenDataView;
}) {
  const { layers, vectorOverlay, setLayerSelection, updateUploadedLayerGeoJson } = useLayerStore();
  const [adapter] = useState(createGisDataViewAdapter);
  const datasets = useMemo(() => adapter.read(layers, vectorOverlay, displayLayerName), [adapter, layers, vectorOverlay]);
  const addFields = useCallback<AddAttributeFields>((datasetId, fields) => {
    const layer = layers.find(item => item.id === datasetId);
    if (!layer) throw new Error('图层已移除或不支持添加字段。');
    updateUploadedLayerGeoJson(datasetId, addLayerFields(layer.geojson, fields));
  }, [layers, updateUploadedLayerGeoJson]);
  return <DataViewProvider datasets={datasets} onSelect={setLayerSelection}>
    <ChartsProvider onOpenChart={onOpenChart}>
      <ConnectedAttributeTables onOpenTable={onOpenTable} onOpenFields={onOpenFields} onAddFields={addFields}>{children}</ConnectedAttributeTables>
    </ChartsProvider>
  </DataViewProvider>;
}

function ConnectedAttributeTables({ children, onOpenTable, onOpenFields, onAddFields }: {
  children: ReactNode; onOpenTable: OpenDataView; onOpenFields?: OpenDataView; onAddFields: AddAttributeFields;
}) {
  const { openChart } = useChartActions();
  return <AttributeTableProvider onOpenTable={onOpenTable} onOpenChart={openChart} onOpenFields={onOpenFields} onAddFields={onAddFields}>{children}</AttributeTableProvider>;
}
