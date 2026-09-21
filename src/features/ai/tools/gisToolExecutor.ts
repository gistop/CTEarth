import type { BufferParameters, IdwParameters, OverlayParameters, OverlayToolId, RasterCalculatorParameters, RasterOverlay, RasterReclassifyParameters, RasterResampleParameters, SelectByLocationParameters, SelectByValueParameters, TerrainParameters, TerrainToolId } from '../../../gisStore';
import type { AiToolExecutor, AiToolResult } from '../types';
import type { AiGisPort, AiGisSnapshot } from './gisPort';
import { errorText, isAbortError, throwIfAborted } from '../services/aiErrors';
import { displayLayerName, summarizeGisContext } from '../services/gisContextService';
import { gisToolDefinitions } from './gisToolDefinitions';
import { validateRasterExpression } from '../../toolbox/toolsets/general/pixel/rasterCalculatorEngine';
import { validateRasterReclassifyParams } from '../../toolbox/toolsets/general/pixel/reclassifyEngine';
import { validateRasterResampleParams } from '../../toolbox/toolsets/general/pixel/resampleEngine';
import { validateToolInput } from './toolValidation';
import { toolResult } from './toolResults';

type ToolHandler = (input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) => Promise<AiToolResult>;

const handlers: Record<string, ToolHandler> = {
  list_layers: async (_input, snapshot) => toolResult('list_layers', 'success', '已读取当前 GIS 状态。', { data: summarizeGisContext(snapshot) }),
  create_layer: runCreateLayer,
  buffer_vector: runBuffer,
  select_by_value: runSelectByValue,
  select_by_location: runSelectByLocation,
  intersect: (input, snapshot, port) => runOverlay('intersect', input, snapshot, port),
  union: (input, snapshot, port) => runOverlay('union', input, snapshot, port),
  erase: (input, snapshot, port) => runOverlay('erase', input, snapshot, port),
  idw_interpolation: runIdw,
  raster_calculator: runRasterCalculator,
  raster_reclassify: runRasterReclassify,
  raster_resample: runRasterResample,
  hillshade: (input, snapshot, port) => runTerrain('hillshade', input, snapshot, port),
  slope: (input, snapshot, port) => runTerrain('slope', input, snapshot, port),
  aspect: (input, snapshot, port) => runTerrain('aspect', input, snapshot, port),
};

export function createGisToolExecutor(port: AiGisPort): AiToolExecutor {
  let expected = port.getSnapshot();
  let running = false;

  return async (name, input, signal) => {
    throwIfAborted(signal);
    const definition = gisToolDefinitions.find((tool) => tool.name === name);
    const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
    if (!definition || !handler) {
      return toolResult(name, 'blocked', `未注册的 GIS 工具：${name}`, {
        error: { code: 'UNKNOWN_TOOL', retryable: false },
        nextAction: { type: 'none' },
      });
    }
    try {
      validateToolInput(definition, input);
    } catch (error) {
      return toolResult(name, 'blocked', errorText(error), {
        error: { code: 'INVALID_TOOL_INPUT', retryable: false },
        nextAction: { type: 'ask_user' },
      });
    }

    const snapshot = port.getSnapshot();
    if (name === 'list_layers') {
      return handler(input, snapshot, port);
    }
    if (running || snapshot.isRunning) {
      return toolResult(name, 'blocked', '已有 GIS 操作正在执行，请等待完成后再运行。', {
        error: { code: 'GIS_BUSY', retryable: true },
        nextAction: { type: 'retry' },
      });
    }
    const usesRaster = name === 'hillshade' || name === 'slope' || name === 'aspect';
    const usesRasterList = name === 'raster_calculator' || name === 'raster_reclassify' || name === 'raster_resample';
    const usesOverlay = isOverlayToolName(name);
    // 新建空白图层不依赖任何现有输入，允许在图层切换后仍然执行。
    const stateGuarded = name !== 'create_layer';
    const changed = stateGuarded
      ? usesRasterList
        ? snapshot.rasters !== expected.rasters
        : usesRaster
          ? snapshot.raster !== expected.raster
          : snapshot.layer?.id !== expected.layer?.id || snapshot.layer?.geojson !== expected.layer?.geojson
      : false;
    if (changed) {
      return toolResult(name, 'blocked', '当前输入图层已在本次请求期间改变，请基于新的地图状态重新发起请求。', {
        error: { code: 'GIS_STATE_CHANGED', retryable: false },
        nextAction: { type: 'ask_user' },
      });
    }
    if ((usesRaster || usesRasterList || usesOverlay || name === 'buffer_vector' || name === 'idw_interpolation') && !snapshot.toolsReady) {
      return toolResult(name, 'blocked', 'WASM 工具仍在加载，请稍后再运行。', {
        error: { code: 'GIS_TOOLS_NOT_READY', retryable: true },
        nextAction: { type: 'retry' },
      });
    }

    running = true;
    try {
      throwIfAborted(signal);
      const result = await handler(input, snapshot, port);
      throwIfAborted(signal);
      const next = port.getSnapshot();
      if (result.status === 'success' && usesRasterList && next.rasters !== expected.rasters) {
        expected = { ...expected, rasters: next.rasters, raster: next.raster };
      }
      if (result.status === 'success' && (usesRaster || name === 'idw_interpolation') && next.raster?.id === result.data?.rasterId) {
        expected = { ...expected, raster: next.raster };
      }
      if (result.status === 'success' && name === 'idw_interpolation' && next.layer?.id === result.data?.sourceLayerId) {
        expected = { ...expected, layer: next.layer };
      }
      if (result.status === 'success' && name === 'buffer_vector' && next.layer?.id === result.data?.layerId) {
        expected = { ...expected, layer: next.layer };
      }
      if (result.status === 'success' && usesOverlay && next.layer?.id === result.data?.layerId) {
        expected = { ...expected, layer: next.layer };
      }
      return result;
    } catch (error) {
      throwIfAborted(signal);
      if (isAbortError(error)) throw error;
      return toolResult(name, 'failed', errorText(error), {
        error: { code: 'TOOL_EXECUTION_ERROR', retryable: false },
        nextAction: { type: 'none' },
      });
    } finally {
      running = false;
    }
  };
}

function isOverlayToolName(name: string): name is OverlayToolId {
  return name === 'intersect' || name === 'union' || name === 'erase';
}

function textArg(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function runBuffer(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  if (!snapshot.layer) {
    return toolResult('buffer_vector', 'blocked', '请先选择一个矢量图层。', {
      error: { code: 'MISSING_INPUT_LAYER', retryable: false },
      nextAction: { type: 'ask_user', fields: ['inputLayer'] },
    });
  }
  const parameters: BufferParameters = {
    distance: String(input.distance),
    outputName: textArg(input.outputName, 'agent-buffer.geojson'),
    quadrantSegments: String(input.quadrantSegments ?? 8),
    capStyle: textArg(input.capStyle, 'round'),
    joinStyle: textArg(input.joinStyle, 'round'),
    dissolve: (input.dissolve as boolean | undefined) ?? false,
  };
  const result = await port.runBufferAnalysis(parameters);
  if (!result.ok) {
    return toolResult('buffer_vector', 'failed', result.message, {
      error: { code: 'BUFFER_ANALYSIS_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
  }
  const count = result.output.geojson.features.length;
  return toolResult('buffer_vector', 'success', `缓冲区完成：${count} 个要素。`, {
    data: {
      resultLayer: { id: result.output.id, name: result.output.fileName, kind: 'vector' },
      layerId: result.output.id,
      outputName: result.output.fileName,
      featureCount: count,
      sourceLayerId: snapshot.layer.id,
      sourceLayerName: displayLayerName(snapshot.layer.fileName),
      sourceFeatureCount: snapshot.layer.geojson.features.length,
      distance: Number(parameters.distance),
      distanceUnits: 'input-layer-coordinate-units',
      parameters,
    },
  });
}

async function runSelectByValue(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  const field = textArg(input.field, '');
  if (!snapshot.layer || !snapshot.layer.fields.includes(field)) {
    return toolResult('select_by_value', 'blocked', '请指定当前图层中存在的字段。', {
      data: { fields: snapshot.layer?.fields ?? [] },
      error: { code: 'INVALID_FIELD', retryable: false, details: { fields: snapshot.layer?.fields ?? [] } },
      nextAction: { type: 'ask_user', fields: ['field'] },
    });
  }
  const parameters: SelectByValueParameters = {
    layerId: snapshot.layer.id,
    field,
    operator: input.operator as SelectByValueParameters['operator'],
    value: typeof input.value === 'string' ? input.value : '',
    caseSensitive: (input.caseSensitive as boolean | undefined) ?? false,
    selectionMode: (input.selectionMode as SelectByValueParameters['selectionMode'] | undefined) ?? 'new',
  };
  const result = await port.selectByValue(parameters);
  return result
    ? toolResult('select_by_value', 'success', `已选中 ${result.selectedCount} / ${result.totalCount} 个要素。`, { data: { ...result, parameters } })
    : toolResult('select_by_value', 'failed', '属性选择未完成，请检查字段和比较值。', {
      error: { code: 'ATTRIBUTE_SELECTION_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
}

async function runSelectByLocation(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  if (!snapshot.layer) {
    return toolResult('select_by_location', 'blocked', '请先选择目标矢量图层。', {
      error: { code: 'MISSING_TARGET_LAYER', retryable: false },
      nextAction: { type: 'ask_user', fields: ['targetLayer'] },
    });
  }
  const referenceLayerId = textArg(input.referenceLayerId, '');
  const exists = referenceLayerId === 'vectorOverlay'
    ? Boolean(snapshot.vectorOverlay)
    : snapshot.layers.some((layer) => layer.id === referenceLayerId);
  if (!exists) {
    return toolResult('select_by_location', 'blocked', '参考图层不存在，请先查看当前图层列表。', {
      error: { code: 'MISSING_REFERENCE_LAYER', retryable: false },
      nextAction: { type: 'ask_user', fields: ['referenceLayerId'] },
    });
  }
  const parameters: SelectByLocationParameters = {
    targetLayerId: snapshot.layer.id,
    referenceLayerId,
    relation: (input.relation as SelectByLocationParameters['relation'] | undefined) ?? 'intersects',
    selectionMode: (input.selectionMode as SelectByLocationParameters['selectionMode'] | undefined) ?? 'new',
  };
  const result = await port.selectByLocation(parameters);
  return result
    ? toolResult('select_by_location', 'success', `已选中 ${result.selectedCount} / ${result.totalCount} 个要素。`, { data: { ...result, parameters } })
    : toolResult('select_by_location', 'failed', '空间选择未完成，请检查图层和空间关系。', {
      error: { code: 'SPATIAL_SELECTION_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
}

async function runOverlay(tool: OverlayToolId, input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  const inputLayerId = textArg(input.inputLayerId, '');
  const overlayLayerId = textArg(input.overlayLayerId, '');
  const inputLayer = findVectorSource(snapshot, inputLayerId);
  const overlayLayer = findVectorSource(snapshot, overlayLayerId);

  if (!inputLayer) {
    return toolResult(tool, 'blocked', '输入图层不存在，请先使用 list_layers 查看可用图层 ID。', {
      error: { code: 'MISSING_INPUT_LAYER', retryable: false },
      nextAction: { type: 'ask_user', fields: ['inputLayerId'] },
    });
  }

  if (!overlayLayer) {
    return toolResult(tool, 'blocked', '叠加图层不存在，请先使用 list_layers 查看可用图层 ID。', {
      error: { code: 'MISSING_OVERLAY_LAYER', retryable: false },
      nextAction: { type: 'ask_user', fields: ['overlayLayerId'] },
    });
  }

  if (inputLayer.id === overlayLayer.id) {
    return toolResult(tool, 'blocked', '输入图层和叠加图层不能相同。', {
      error: { code: 'SAME_OVERLAY_LAYERS', retryable: false },
      nextAction: { type: 'ask_user', fields: ['overlayLayerId'] },
    });
  }

  if (!hasPolygonFeatures(inputLayer.geojson.features) || !hasPolygonFeatures(overlayLayer.geojson.features)) {
    return toolResult(tool, 'blocked', '相交、联合、擦除只支持 Polygon 或 MultiPolygon 图层。', {
      error: { code: 'POLYGON_LAYERS_REQUIRED', retryable: false },
      nextAction: { type: 'ask_user', fields: ['inputLayerId', 'overlayLayerId'] },
    });
  }

  const parameters: OverlayParameters = {
    inputLayerId,
    overlayLayerId,
    outputName: textArg(input.outputName, `${tool}.geojson`),
    snapTolerance: input.snapTolerance === undefined ? '' : String(input.snapTolerance),
  };
  const result = await port.runOverlayAnalysis(tool, parameters);

  if (!result.ok) {
    return toolResult(tool, 'failed', result.message, {
      error: { code: 'OVERLAY_ANALYSIS_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
  }

  const featureCount = result.output.geojson.features.length;
  return toolResult(tool, 'success', `${overlayToolLabel(tool)}完成：${featureCount} 个要素`, {
    data: {
      resultLayer: { id: result.output.id, name: result.output.fileName, kind: 'vector' },
      layerId: result.output.id,
      outputName: result.output.fileName,
      featureCount,
      inputLayer: { id: inputLayer.id, name: inputLayer.name, featureCount: inputLayer.geojson.features.length },
      overlayLayer: { id: overlayLayer.id, name: overlayLayer.name, featureCount: overlayLayer.geojson.features.length },
      parameters,
    },
  });
}

async function runTerrain(tool: TerrainToolId, input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  if (!snapshot.raster) {
    return toolResult(tool, 'blocked', '请先添加一个 DEM 栅格。', {
      error: { code: 'MISSING_DEM_RASTER', retryable: false },
      nextAction: { type: 'ask_user', fields: ['raster'] },
    });
  }
  const parameters: TerrainParameters = {
    outputName: textArg(input.outputName, `${tool}.tif`),
    zFactor: String(input.zFactor ?? 1),
    altitude: String(input.altitude ?? 45),
    azimuth: String(input.azimuth ?? 315),
    units: (input.units as TerrainParameters['units'] | undefined) ?? 'degrees',
  };
  const result = await port.runTerrainAnalysis(tool, parameters);
  return result.ok
    ? rasterResult(tool, result.output, { sourceRasterName: snapshot.raster.name, parameters })
    : toolResult(tool, 'failed', result.message, {
      error: { code: 'TERRAIN_ANALYSIS_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
}

async function runIdw(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  const layer = snapshot.layer?.points.features.length
    ? snapshot.layer
    : snapshot.layers.find((candidate) => candidate.points.features.length > 0);
  if (!layer) {
    return toolResult('idw_interpolation', 'blocked', '请先添加一个点图层。', {
      error: { code: 'MISSING_POINT_LAYER', retryable: false },
      nextAction: { type: 'ask_user', fields: ['pointLayer'] },
    });
  }
  const field = textArg(input.field, layer.selectedField || layer.numericFields[0] || '');
  if (!layer.numericFields.includes(field)) {
    return toolResult('idw_interpolation', 'blocked', '请指定点图层中的数值字段。', {
      data: { numericFields: layer.numericFields },
      error: { code: 'INVALID_NUMERIC_FIELD', retryable: false, details: { numericFields: layer.numericFields } },
      nextAction: { type: 'ask_user', fields: ['field'] },
    });
  }
  const parameters: IdwParameters = {
    layerId: layer.id,
    field,
    outputName: textArg(input.outputName, 'agent-idw.tif'),
    cellSize: String(input.cellSize ?? 0.001),
    weight: String(input.weight ?? 2),
    radius: String(input.radius ?? 0),
    minPoints: String(input.minPoints ?? 0),
  };
  const result = await port.runIdwInterpolation(parameters);
  return result.ok
    ? rasterResult('idw_interpolation', result.output, { sourceLayerId: layer.id, sourceLayerName: displayLayerName(layer.fileName), parameters })
    : toolResult('idw_interpolation', 'failed', result.message, {
      error: { code: 'IDW_ANALYSIS_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
}

async function runRasterCalculator(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  const expression = typeof input.expression === 'string' ? input.expression : '';
  if (!expression.trim()) {
    return toolResult('raster_calculator', 'blocked', '请提供地图代数表达式，例如 "dem.tif" * 2。', {
      data: { rasters: snapshot.rasters.map((raster) => raster.name) },
      error: { code: 'MISSING_EXPRESSION', retryable: false },
      nextAction: { type: 'ask_user', fields: ['expression'] },
    });
  }
  if (snapshot.rasters.length === 0) {
    return toolResult('raster_calculator', 'blocked', '请先添加参与计算的 GeoTIFF 栅格。', {
      error: { code: 'MISSING_RASTER', retryable: false },
      nextAction: { type: 'ask_user', fields: ['raster'] },
    });
  }
  const validation = validateRasterExpression(expression, snapshot.rasters);
  if (!validation.ok) {
    return toolResult('raster_calculator', 'blocked', validation.error, {
      data: { expression, rasters: snapshot.rasters.map((raster) => raster.name) },
      error: { code: 'INVALID_EXPRESSION', retryable: false, details: { rasters: snapshot.rasters.map((raster) => raster.name) } },
      nextAction: { type: 'ask_user', fields: ['expression'] },
    });
  }

  const parameters: RasterCalculatorParameters = {
    expression,
    outputName: textArg(input.outputName, 'agent-raster-calculator.tif'),
  };
  const result = await port.runRasterCalculator(parameters);
  return result.ok
    ? rasterResult('raster_calculator', result.output, { expression, referencedRasters: validation.referencedNames, parameters })
    : toolResult('raster_calculator', 'failed', result.message, {
      error: { code: 'RASTER_CALCULATION_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
}

async function runRasterReclassify(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  const validation = validateRasterReclassifyParams({
    method: input.method,
    classCount: input.classCount ?? 5,
    customBreaks: input.customBreaks,
  });
  if (!validation.ok) {
    return toolResult('raster_reclassify', 'blocked', validation.error, {
      data: { rasters: snapshot.rasters.map((raster) => raster.name) },
      error: { code: 'INVALID_RECLASSIFY_PARAMS', retryable: false, details: { rasters: snapshot.rasters.map((raster) => raster.name) } },
      nextAction: { type: 'ask_user', fields: ['method', 'classCount', 'customBreaks'] },
    });
  }

  const rasterName = textArg(input.rasterName, '');
  const targetRaster = rasterName
    ? findRasterSource(snapshot, rasterName)
    : snapshot.raster;
  if (!targetRaster) {
    return toolResult('raster_reclassify', 'blocked', '输入栅格不存在，请先使用 list_layers 查看可用栅格名称。', {
      data: { rasters: snapshot.rasters.map((raster) => raster.name) },
      error: { code: 'MISSING_RASTER', retryable: false, details: { rasters: snapshot.rasters.map((raster) => raster.name) } },
      nextAction: { type: 'ask_user', fields: ['rasterName'] },
    });
  }

  const parameters: RasterReclassifyParameters = {
    rasterId: targetRaster.id,
    method: input.method as RasterReclassifyParameters['method'],
    classCount: String(input.classCount ?? 5),
    customBreaks: textArg(input.customBreaks, ''),
    outputName: textArg(input.outputName, 'agent-raster-reclassify.tif'),
  };
  const result = await port.runRasterReclassify(parameters);
  return result.ok
    ? rasterResult('raster_reclassify', result.output.raster, {
      method: result.output.method,
      classCount: result.output.classCount,
      breaks: result.output.breaks,
      classHistogram: result.output.histogram,
      sourceRasterName: targetRaster.name,
      parameters,
    })
    : toolResult('raster_reclassify', 'failed', result.message, {
      error: { code: 'RASTER_RECLASSIFICATION_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
}

function findRasterSource(snapshot: AiGisSnapshot, name: string): RasterOverlay | null {
  const exact = snapshot.rasters.find((raster) => raster.name === name);
  if (exact) {
    return exact;
  }
  const base = name.replace(/\.(tif|tiff)$/i, '');
  return snapshot.rasters.find((raster) => raster.name.replace(/\.(tif|tiff)$/i, '') === base) ?? null;
}

async function runRasterResample(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  const validation = validateRasterResampleParams({ method: input.method, cellSize: input.cellSize });
  if (!validation.ok) {
    return toolResult('raster_resample', 'blocked', validation.error, {
      data: { rasters: snapshot.rasters.map((raster) => raster.name) },
      error: { code: 'INVALID_RESAMPLE_PARAMS', retryable: false, details: { rasters: snapshot.rasters.map((raster) => raster.name) } },
      nextAction: { type: 'ask_user', fields: ['method', 'cellSize'] },
    });
  }

  const rasterName = textArg(input.rasterName, '');
  const targetRaster = rasterName ? findRasterSource(snapshot, rasterName) : snapshot.raster;
  if (!targetRaster) {
    return toolResult('raster_resample', 'blocked', '输入栅格不存在，请先使用 list_layers 查看可用栅格名称。', {
      data: { rasters: snapshot.rasters.map((raster) => raster.name) },
      error: { code: 'MISSING_RASTER', retryable: false, details: { rasters: snapshot.rasters.map((raster) => raster.name) } },
      nextAction: { type: 'ask_user', fields: ['rasterName'] },
    });
  }

  const parameters: RasterResampleParameters = {
    rasterId: targetRaster.id,
    method: input.method as RasterResampleParameters['method'],
    cellSize: typeof input.cellSize === 'number' ? String(input.cellSize) : textArg(input.cellSize, ''),
    outputName: textArg(input.outputName, 'agent-raster-resample.tif'),
  };
  const result = await port.runRasterResample(parameters);
  return result.ok
    ? rasterResult('raster_resample', result.output.raster, {
      method: result.output.method,
      inputCellSize: result.output.inputCellSize,
      outputCellSize: result.output.outputCellSize,
      validCount: result.output.validCount,
      sourceRasterName: targetRaster.name,
      parameters,
    })
    : toolResult('raster_resample', 'failed', result.message, {
      error: { code: 'RASTER_RESAMPLING_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
}

type VectorSource = {
  id: string;
  name: string;
  geojson: { type: 'FeatureCollection'; features: unknown[] };
};

async function runCreateLayer(input: Record<string, unknown>, _snapshot: AiGisSnapshot, port: AiGisPort): Promise<AiToolResult> {
  const geometryType = input.geometryType;
  const labels: Record<string, string> = { Point: '点', LineString: '线', Polygon: '面' };
  if (typeof geometryType !== 'string' || !Object.hasOwn(labels, geometryType)) {
    return toolResult('create_layer', 'blocked', '几何类型必须是 Point（点）、LineString（线）或 Polygon（面）。', {
      error: { code: 'INVALID_GEOMETRY_TYPE', retryable: false },
      nextAction: { type: 'ask_user', fields: ['geometryType'] },
    });
  }
  const fileName = textArg(input.fileName, `${geometryType.toLowerCase()}-layer.geojson`);
  const created = port.createBlankGeoJsonLayer({ fileName, geometryType: geometryType as 'Point' | 'LineString' | 'Polygon' });
  return toolResult('create_layer', 'success', `已新建空白${labels[geometryType]}图层：${created.fileName}，可在编辑选项卡中绘制要素。`, {
    data: {
      resultLayer: { id: created.layerId, name: created.fileName, kind: 'vector' },
      layerId: created.layerId,
      outputName: created.fileName,
      geometryType,
      parameters: { fileName, geometryType },
    },
  });
}

function findVectorSource(snapshot: AiGisSnapshot, layerId: string): VectorSource | null {
  if (layerId === 'vectorOverlay' && snapshot.vectorOverlay) {
    return {
      id: 'vectorOverlay',
      name: displayLayerName(snapshot.vectorOverlay.name),
      geojson: snapshot.vectorOverlay.geojson,
    };
  }

  const layer = snapshot.layers.find((candidate) => candidate.id === layerId);
  return layer
    ? { id: layer.id, name: displayLayerName(layer.fileName), geojson: layer.geojson }
    : null;
}

function hasPolygonFeatures(features: unknown[]) {
  return features.some((feature) => {
    if (!feature || typeof feature !== 'object') {
      return false;
    }

    const geometry = (feature as { geometry?: { type?: unknown } }).geometry;
    return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
  });
}

function overlayToolLabel(tool: OverlayToolId) {
  if (tool === 'intersect') {
    return '相交';
  }

  if (tool === 'union') {
    return '联合';
  }

  return '擦除';
}

function rasterResult(tool: string, raster: RasterOverlay, details: Record<string, unknown>) {
  if (!(raster.width > 0 && raster.height > 0)) {
    return toolResult(tool, 'failed', '输出栅格的尺寸无效。', {
      error: { code: 'INVALID_RASTER_OUTPUT', retryable: false },
      nextAction: { type: 'none' },
    });
  }
  return toolResult(tool, 'success', `${tool} 完成：${raster.width} × ${raster.height}。`, {
    data: {
      resultRaster: { id: raster.id, name: raster.name, kind: 'raster' },
      rasterId: raster.id,
      outputName: raster.name,
      width: raster.width,
      height: raster.height,
      min: raster.min,
      max: raster.max,
      epsg: raster.epsg ?? null,
      ...details,
    },
  });
}
