import type { BufferParameters, IdwParameters, OverlayParameters, OverlayToolId, RasterOverlay, SelectByLocationParameters, SelectByValueParameters, TerrainParameters, TerrainToolId } from '../../../gisStore';
import type { AiToolExecutor, AiToolResult } from '../types';
import type { AiGisPort, AiGisSnapshot } from './gisPort';
import { errorText, isAbortError, throwIfAborted } from '../services/aiErrors';
import { displayLayerName, summarizeGisContext } from '../services/gisContextService';
import { gisToolDefinitions } from './gisToolDefinitions';
import { validateToolInput } from './toolValidation';
import { toolResult } from './toolResults';

type ToolHandler = (input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) => Promise<AiToolResult>;

const handlers: Record<string, ToolHandler> = {
  list_layers: async (_input, snapshot) => toolResult('list_layers', 'success', '已读取当前 GIS 状态。', { data: summarizeGisContext(snapshot) }),
  buffer_vector: runBuffer,
  select_by_value: runSelectByValue,
  select_by_location: runSelectByLocation,
  intersect: (input, snapshot, port) => runOverlay('intersect', input, snapshot, port),
  union: (input, snapshot, port) => runOverlay('union', input, snapshot, port),
  erase: (input, snapshot, port) => runOverlay('erase', input, snapshot, port),
  idw_interpolation: runIdw,
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
    const usesOverlay = isOverlayToolName(name);
    const changed = usesRaster
      ? snapshot.raster !== expected.raster
      : snapshot.layer?.id !== expected.layer?.id || snapshot.layer?.geojson !== expected.layer?.geojson;
    if (changed) {
      return toolResult(name, 'blocked', '当前输入图层已在本次请求期间改变，请基于新的地图状态重新发起请求。', {
        error: { code: 'GIS_STATE_CHANGED', retryable: false },
        nextAction: { type: 'ask_user' },
      });
    }
    if ((usesRaster || usesOverlay || name === 'buffer_vector' || name === 'idw_interpolation') && !snapshot.toolsReady) {
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

type VectorSource = {
  id: string;
  name: string;
  geojson: { type: 'FeatureCollection'; features: unknown[] };
};

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
