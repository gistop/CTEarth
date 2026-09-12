import { useEffect, useState } from 'react';
import type {
  BufferParameters as BufferRunParameters,
  ExtractByMaskParameters as ExtractByMaskRunParameters,
  IdwParameters as IdwRunParameters,
  OverlayParameters as OverlayRunParameters,
  OverlayToolId,
  TerrainParameters as TerrainRunParameters,
  TerrainToolId,
} from '../../../../../gisStore';
import { useGis } from '../../../../../gisStore';
import { GeoprocessingEnvironmentForm } from '../../../components/GeoprocessingEnvironmentForm';
import { ToolDetailShell } from '../../../components/ToolDetailShell';
import type { ToolDetailTabId } from '../../../types';
import {
  createDefaultExtractByMaskParameters,
  createDefaultOverlayParameters,
  defaultIdwLayerId,
  defaultMaskLayerId,
  isIdwLayerAvailable,
  isMaskLayerAvailable,
  isOverlayLayerAvailable,
  isOverlayTool,
  isTerrainTool,
  normalizeOverlayParams,
  overlayToolIds,
  sameOverlayParams,
  analysisToolTitles,
} from '../services/analysisToolService';
import type { AnalysisToolId } from '../types';
import {
  BufferParametersForm,
  ExtractByMaskParametersForm,
  IdwParametersForm,
  OverlayParametersForm,
  TerrainParametersForm,
} from './AnalysisToolForms';

export function AnalysisToolPanel({
  tool,
  onBack,
}: {
  tool: AnalysisToolId;
  onBack: () => void;
}) {
  const {
    isRunning,
    layer,
    layers,
    raster,
    runBufferAnalysis,
    runExtractByMask,
    runIdwInterpolation,
    runOverlayAnalysis,
    runTerrainAnalysis,
    toolsReady,
    vectorOverlay,
  } = useGis();
  const [activeTab, setActiveTab] = useState<ToolDetailTabId>('parameters');
  const [idwParams, setIdwParams] = useState<IdwRunParameters>(() => createDefaultIdwParameters(layers, layer));
  const [bufferParams, setBufferParams] = useState<BufferRunParameters>(createDefaultBufferParameters);
  const [overlayParamsByTool, setOverlayParamsByTool] = useState<Record<OverlayToolId, OverlayRunParameters>>(
    () => createDefaultOverlayParameters(layers, layer?.id, vectorOverlay),
  );
  const [extractByMaskParams, setExtractByMaskParams] = useState<ExtractByMaskRunParameters>(
    () => createDefaultExtractByMaskParameters(layers, vectorOverlay),
  );
  const [terrainParamsByTool, setTerrainParamsByTool] = useState<Record<TerrainToolId, TerrainRunParameters>>(
    createDefaultTerrainParameters,
  );
  const terrainTool = isTerrainTool(tool) ? tool : null;
  const overlayTool = isOverlayTool(tool) ? tool : null;
  const terrainParams = terrainTool ? terrainParamsByTool[terrainTool] : terrainParamsByTool.hillshade;
  const overlayParams = overlayTool ? overlayParamsByTool[overlayTool] : overlayParamsByTool.intersect;
  const hasPointLayer = isIdwLayerAvailable(layers, idwParams.layerId);
  const hasMaskLayer = isMaskLayerAvailable(layers, vectorOverlay, extractByMaskParams.maskLayerId);
  const hasOverlayLayers = isOverlayLayerAvailable(layers, vectorOverlay, overlayParams.inputLayerId)
    && isOverlayLayerAvailable(layers, vectorOverlay, overlayParams.overlayLayerId)
    && overlayParams.inputLayerId !== overlayParams.overlayLayerId;

  useEffect(() => {
    const idwLayerId = defaultIdwLayerId(layers, layer);
    setIdwParams((current) => {
      const nextLayerId = isIdwLayerAvailable(layers, current.layerId) ? current.layerId : idwLayerId;
      const selectedLayer = layers.find((item) => item.id === nextLayerId) ?? null;

      return {
        ...current,
        layerId: nextLayerId,
        field: selectedLayer && (!current.field || !selectedLayer.numericFields.includes(current.field))
          ? selectedLayer.selectedField || selectedLayer.numericFields[0] || ''
          : current.field,
      };
    });
  }, [layer, layers]);

  useEffect(() => {
    setOverlayParamsByTool((current) => {
      const next = {
        intersect: normalizeOverlayParams(current.intersect, layers, layer?.id, vectorOverlay),
        union: normalizeOverlayParams(current.union, layers, layer?.id, vectorOverlay),
        erase: normalizeOverlayParams(current.erase, layers, layer?.id, vectorOverlay),
      };

      return overlayToolIds.every((id) => sameOverlayParams(current[id], next[id])) ? current : next;
    });
  }, [layer?.id, layers, vectorOverlay]);

  useEffect(() => {
    setExtractByMaskParams((current) => ({
      ...current,
      maskLayerId: isMaskLayerAvailable(layers, vectorOverlay, current.maskLayerId)
        ? current.maskLayerId
        : defaultMaskLayerId(layers, vectorOverlay),
    }));
  }, [layers, vectorOverlay]);

  const runDisabled = !toolsReady
    || (tool === 'buffer' && !layer)
    || (tool === 'idw' && !hasPointLayer)
    || (tool === 'extractByMask' && (!raster || !hasMaskLayer))
    || (Boolean(terrainTool) && !raster)
    || (Boolean(overlayTool) && !hasOverlayLayers);

  const runActiveTool = () => {
    if (tool === 'idw') {
      void runIdwInterpolation(idwParams);
    } else if (tool === 'buffer') {
      void runBufferAnalysis(bufferParams);
    } else if (overlayTool) {
      void runOverlayAnalysis(overlayTool, overlayParams);
    } else if (tool === 'extractByMask') {
      void runExtractByMask(extractByMaskParams);
    } else if (terrainTool) {
      void runTerrainAnalysis(terrainTool, terrainParams);
    }
  };

  const resetActiveTool = () => {
    setActiveTab('parameters');

    if (tool === 'idw') {
      setIdwParams(createDefaultIdwParameters(layers, layer));
    } else if (tool === 'buffer') {
      setBufferParams(createDefaultBufferParameters());
    } else if (overlayTool) {
      setOverlayParamsByTool((current) => ({
        ...current,
        [overlayTool]: createDefaultOverlayParameters(layers, layer?.id, vectorOverlay)[overlayTool],
      }));
    } else if (tool === 'extractByMask') {
      setExtractByMaskParams(createDefaultExtractByMaskParameters(layers, vectorOverlay));
    } else if (terrainTool) {
      setTerrainParamsByTool((current) => ({
        ...current,
        [terrainTool]: createDefaultTerrainParameters()[terrainTool],
      }));
    }
  };

  let parameters: React.ReactNode = null;
  if (tool === 'idw') {
    parameters = <IdwParametersForm params={idwParams} onChange={(name, value) => setIdwParams((current) => ({ ...current, [name]: value }))} />;
  } else if (tool === 'buffer') {
    parameters = <BufferParametersForm params={bufferParams} onChange={(name, value) => setBufferParams((current) => ({ ...current, [name]: value }))} />;
  } else if (overlayTool) {
    parameters = (
      <OverlayParametersForm
        tool={overlayTool}
        params={overlayParams}
        onChange={(name, value) => setOverlayParamsByTool((current) => ({
          ...current,
          [overlayTool]: { ...current[overlayTool], [name]: value },
        }))}
      />
    );
  } else if (tool === 'extractByMask') {
    parameters = <ExtractByMaskParametersForm params={extractByMaskParams} onChange={(name, value) => setExtractByMaskParams((current) => ({ ...current, [name]: value }))} />;
  } else if (terrainTool) {
    parameters = (
      <TerrainParametersForm
        tool={terrainTool}
        params={terrainParams}
        onChange={(name, value) => setTerrainParamsByTool((current) => ({
          ...current,
          [terrainTool]: { ...current[terrainTool], [name]: value },
        }))}
      />
    );
  }

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
      title={analysisToolTitles[tool]}
    />
  );
}

function createDefaultIdwParameters(
  layers: ReturnType<typeof useGis>['layers'],
  activeLayer: ReturnType<typeof useGis>['layer'],
): IdwRunParameters {
  const layerId = defaultIdwLayerId(layers, activeLayer);
  const selectedLayer = layers.find((item) => item.id === layerId) ?? null;

  return {
    layerId,
    field: selectedLayer?.selectedField || selectedLayer?.numericFields[0] || '',
    outputName: 'idw-interpolation.tif',
    cellSize: '0.001',
    weight: '2',
    radius: '0',
    minPoints: '0',
  };
}

function createDefaultBufferParameters(): BufferRunParameters {
  return {
    outputName: 'buffer',
    distance: '0.01',
    quadrantSegments: '8',
    capStyle: 'round',
    joinStyle: 'round',
    dissolve: false,
  };
}

function createDefaultTerrainParameters(): Record<TerrainToolId, TerrainRunParameters> {
  return {
    hillshade: { outputName: 'hillshade.tif', zFactor: '1', altitude: '45', azimuth: '315', units: 'degrees' },
    slope: { outputName: 'slope.tif', zFactor: '1', altitude: '45', azimuth: '315', units: 'degrees' },
    aspect: { outputName: 'aspect.tif', zFactor: '1', altitude: '45', azimuth: '315', units: 'degrees' },
  };
}
