import { useEffect, useState } from 'react';
import type {
  BufferParameters as BufferRunParameters,
  ExtractByMaskParameters as ExtractByMaskRunParameters,
  IdwParameters as IdwRunParameters,
  OverlayParameters as OverlayRunParameters,
  OverlayToolId,
  RasterCalculatorParameters as RasterCalculatorRunParameters,
  RasterReclassifyParameters as RasterReclassifyRunParameters,
  RasterResampleParameters as RasterResampleRunParameters,
  TerrainParameters as TerrainRunParameters,
  TerrainToolId,
} from '../../../../../gisStore';
import { useGis } from '../../../../../gisStore';
import { GeoprocessingEnvironmentForm } from '../../../components/GeoprocessingEnvironmentForm';
import { ToolDetailShell } from '../../../components/ToolDetailShell';
import type { ToolDetailTabId } from '../../../types';
import { validateRasterExpression } from '../pixel/rasterCalculatorEngine';
import { validateRasterReclassifyParams } from '../pixel/reclassifyEngine';
import { validateRasterResampleParams } from '../pixel/resampleEngine';
import {
  createDefaultExtractByMaskParameters,
  createDefaultOverlayParameters,
  createDefaultRasterCalculatorParameters,
  createDefaultRasterReclassifyParameters,
  createDefaultRasterResampleParameters,
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
  RasterCalculatorForm,
  RasterReclassifyForm,
  RasterResampleForm,
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
    rasters,
    runBufferAnalysis,
    runExtractByMask,
    runIdwInterpolation,
    runOverlayAnalysis,
    runRasterCalculator,
    runRasterReclassify,
    runRasterResample,
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
  const [rasterCalcParams, setRasterCalcParams] = useState<RasterCalculatorRunParameters>(createDefaultRasterCalculatorParameters);
  const [rasterReclassifyParams, setRasterReclassifyParams] = useState<RasterReclassifyRunParameters>(createDefaultRasterReclassifyParameters);
  const [rasterResampleParams, setRasterResampleParams] = useState<RasterResampleRunParameters>(createDefaultRasterResampleParameters);
  const terrainTool = isTerrainTool(tool) ? tool : null;
  const overlayTool = isOverlayTool(tool) ? tool : null;
  const terrainParams = terrainTool ? terrainParamsByTool[terrainTool] : terrainParamsByTool.hillshade;
  const overlayParams = overlayTool ? overlayParamsByTool[overlayTool] : overlayParamsByTool.intersect;
  const hasPointLayer = isIdwLayerAvailable(layers, idwParams.layerId);
  const hasMaskLayer = isMaskLayerAvailable(layers, vectorOverlay, extractByMaskParams.maskLayerId);
  const hasOverlayLayers = isOverlayLayerAvailable(layers, vectorOverlay, overlayParams.inputLayerId)
    && isOverlayLayerAvailable(layers, vectorOverlay, overlayParams.overlayLayerId)
    && overlayParams.inputLayerId !== overlayParams.overlayLayerId;
  const rasterCalcReady = validateRasterExpression(rasterCalcParams.expression, rasters).ok;
  const rasterReclassifyReady = rasters.length > 0
    && validateRasterReclassifyParams({
      method: rasterReclassifyParams.method,
      classCount: rasterReclassifyParams.classCount,
      customBreaks: rasterReclassifyParams.customBreaks,
    }).ok;
  const rasterResampleReady = rasters.length > 0
    && validateRasterResampleParams({
      method: rasterResampleParams.method,
      cellSize: rasterResampleParams.cellSize,
    }).ok;

  useEffect(() => {
    const idwLayerId = defaultIdwLayerId(layers, layer);
    setIdwParams((current) => {
      const nextLayerId = isIdwLayerAvailable(layers, current.layerId) ? current.layerId : idwLayerId;
      const selectedLayer = layers.find((item) => item.id === nextLayerId) ?? null;

      return {
        ...current,
        layerId: nextLayerId,
        maskLayerId: current.maskLayerId && isMaskLayerAvailable(layers, vectorOverlay, current.maskLayerId)
          ? current.maskLayerId
          : '',
        field: selectedLayer && (!current.field || !selectedLayer.numericFields.includes(current.field))
          ? selectedLayer.selectedField || selectedLayer.numericFields[0] || ''
          : current.field,
      };
    });
  }, [layer, layers, vectorOverlay]);

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

  useEffect(() => {
    setRasterReclassifyParams((current) => (
      rasters.some((item) => item.id === current.rasterId)
        ? current
        : { ...current, rasterId: raster?.id ?? '' }
    ));
    setRasterResampleParams((current) => (
      rasters.some((item) => item.id === current.rasterId)
        ? current
        : { ...current, rasterId: raster?.id ?? '' }
    ));
  }, [raster, rasters]);

  const runDisabled = !toolsReady
    || (tool === 'buffer' && !layer)
    || (tool === 'idw' && !hasPointLayer)
    || (tool === 'extractByMask' && (!raster || !hasMaskLayer))
    || (Boolean(terrainTool) && !raster)
    || (Boolean(overlayTool) && !hasOverlayLayers)
    || (tool === 'rasterCalculator' && !rasterCalcReady)
    || (tool === 'rasterReclassify' && !rasterReclassifyReady)
    || (tool === 'rasterResample' && !rasterResampleReady);

  const runActiveTool = () => {
    if (tool === 'idw') {
      void runIdwInterpolation(idwParams);
    } else if (tool === 'buffer') {
      void runBufferAnalysis(bufferParams);
    } else if (overlayTool) {
      void runOverlayAnalysis(overlayTool, overlayParams);
    } else if (tool === 'extractByMask') {
      void runExtractByMask(extractByMaskParams);
    } else if (tool === 'rasterCalculator') {
      void runRasterCalculator(rasterCalcParams);
    } else if (tool === 'rasterReclassify') {
      void runRasterReclassify(rasterReclassifyParams);
    } else if (tool === 'rasterResample') {
      void runRasterResample(rasterResampleParams);
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
    } else if (tool === 'rasterCalculator') {
      setRasterCalcParams(createDefaultRasterCalculatorParameters());
    } else if (tool === 'rasterReclassify') {
      setRasterReclassifyParams(createDefaultRasterReclassifyParameters());
    } else if (tool === 'rasterResample') {
      setRasterResampleParams(createDefaultRasterResampleParameters());
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
  } else if (tool === 'rasterCalculator') {
    parameters = <RasterCalculatorForm params={rasterCalcParams} onChange={(name, value) => setRasterCalcParams((current) => ({ ...current, [name]: value }))} />;
  } else if (tool === 'rasterReclassify') {
    parameters = <RasterReclassifyForm params={rasterReclassifyParams} onChange={(name, value) => setRasterReclassifyParams((current) => ({ ...current, [name]: value }))} />;
  } else if (tool === 'rasterResample') {
    parameters = <RasterResampleForm params={rasterResampleParams} onChange={(name, value) => setRasterResampleParams((current) => ({ ...current, [name]: value }))} />;
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
      environment={(
        <GeoprocessingEnvironmentForm
          maskLayerId={tool === 'idw' ? idwParams.maskLayerId : undefined}
          onMaskLayerChange={tool === 'idw'
            ? (maskLayerId) => setIdwParams((current) => ({ ...current, maskLayerId }))
            : undefined}
        />
      )}
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
    maskLayerId: '',
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
