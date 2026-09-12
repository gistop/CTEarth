import { useEffect, useState } from 'react';
import type {
  SelectByLocationParameters as SelectByLocationRunParameters,
  SelectByValueParameters as SelectByValueRunParameters,
} from '../../../../../../gisStore';
import { useGis } from '../../../../../../gisStore';
import { GeoprocessingEnvironmentForm } from '../../../../components/GeoprocessingEnvironmentForm';
import { ToolDetailShell } from '../../../../components/ToolDetailShell';
import type { ToolDetailTabId } from '../../../../types';
import {
  defaultReferenceLayerId,
  isReferenceLayerAvailable,
  selectionToolTitles,
} from '../services/selectionToolService';
import type { SelectionToolId } from '../types';
import { SelectByLocationParametersForm, SelectByValueParametersForm } from './SelectionToolForms';

export function SelectionToolPanel({
  tool,
  onBack,
}: {
  tool: SelectionToolId;
  onBack: () => void;
}) {
  const { isRunning, layer, layers, selectByLocation, selectByValue, vectorOverlay } = useGis();
  const [activeTab, setActiveTab] = useState<ToolDetailTabId>('parameters');
  const [valueParams, setValueParams] = useState<SelectByValueRunParameters>(() => createDefaultValueParameters(layer));
  const [locationParams, setLocationParams] = useState<SelectByLocationRunParameters>(() => (
    createDefaultLocationParameters(layers, layer?.id, vectorOverlay)
  ));

  useEffect(() => {
    setValueParams((current) => ({
      ...current,
      field: current.field && layer?.fields.includes(current.field) ? current.field : layer?.fields[0] ?? '',
    }));
  }, [layer]);

  useEffect(() => {
    setLocationParams((current) => ({
      ...current,
      referenceLayerId: isReferenceLayerAvailable(
        layers,
        layer?.id,
        vectorOverlay,
        current.referenceLayerId,
      )
        ? current.referenceLayerId
        : defaultReferenceLayerId(layers, layer?.id, vectorOverlay),
    }));
  }, [layer?.id, layers, vectorOverlay]);

  const resetActiveTool = () => {
    setActiveTab('parameters');
    if (tool === 'selectByValue') {
      setValueParams(createDefaultValueParameters(layer));
    } else {
      setLocationParams(createDefaultLocationParameters(layers, layer?.id, vectorOverlay));
    }
  };
  const runActiveTool = () => {
    if (tool === 'selectByValue') {
      void selectByValue(valueParams);
    } else {
      void selectByLocation(locationParams);
    }
  };
  const runDisabled = !layer
    || (tool === 'selectByValue' && !valueParams.field)
    || (tool === 'selectByLocation' && !isReferenceLayerAvailable(
      layers,
      layer?.id,
      vectorOverlay,
      locationParams.referenceLayerId,
    ));
  const parameters = tool === 'selectByValue'
    ? (
      <SelectByValueParametersForm
        params={valueParams}
        onChange={(name, value) => setValueParams((current) => ({ ...current, [name]: value }))}
      />
    )
    : (
      <SelectByLocationParametersForm
        params={locationParams}
        onChange={(name, value) => setLocationParams((current) => ({ ...current, [name]: value }))}
      />
    );

  return (
    <ToolDetailShell
      activeTab={activeTab}
      environment={<GeoprocessingEnvironmentForm />}
      isRunning={isRunning}
      onBack={onBack}
      onChangeTab={setActiveTab}
      onReset={resetActiveTool}
      onRun={runActiveTool}
      parameters={parameters}
      runDisabled={runDisabled}
      title={selectionToolTitles[tool]}
    />
  );
}

function createDefaultValueParameters(layer: ReturnType<typeof useGis>['layer']): SelectByValueRunParameters {
  return {
    field: layer?.fields[0] ?? '',
    operator: 'equals',
    value: '',
    caseSensitive: false,
    selectionMode: 'new',
  };
}

function createDefaultLocationParameters(
  layers: ReturnType<typeof useGis>['layers'],
  activeLayerId: string | undefined,
  vectorOverlay: ReturnType<typeof useGis>['vectorOverlay'],
): SelectByLocationRunParameters {
  return {
    referenceLayerId: defaultReferenceLayerId(layers, activeLayerId, vectorOverlay),
    relation: 'intersects',
    selectionMode: 'new',
  };
}
