import { useMemo, useState, type ReactNode } from 'react';
import { displayLayerName } from '../../gisStore';
import { useLayerStore } from '../../features/layers';
import { AttributeTableProvider } from '../../features/attributes';
import { ChartsProvider, useChartActions } from '../../features/charts';
import { DataViewProvider, type OpenDataView } from '../../shared/data-views';
import { createGisDataViewAdapter } from './gisDataViewAdapter';

export function DataViewWorkspaceProvider({ children, onOpenTable, onOpenChart }: { children: ReactNode; onOpenTable: OpenDataView; onOpenChart: OpenDataView }) {
  const { layers, vectorOverlay, setLayerSelection } = useLayerStore();
  const [adapter] = useState(createGisDataViewAdapter);
  const datasets = useMemo(() => adapter.read(layers, vectorOverlay, displayLayerName), [adapter, layers, vectorOverlay]);
  return <DataViewProvider datasets={datasets} onSelect={setLayerSelection}>
    <ChartsProvider onOpenChart={onOpenChart}>
      <ConnectedAttributeTables onOpenTable={onOpenTable}>{children}</ConnectedAttributeTables>
    </ChartsProvider>
  </DataViewProvider>;
}

function ConnectedAttributeTables({ children, onOpenTable }: { children: ReactNode; onOpenTable: OpenDataView }) {
  const { openChart } = useChartActions();
  return <AttributeTableProvider onOpenTable={onOpenTable} onOpenChart={openChart}>{children}</AttributeTableProvider>;
}
