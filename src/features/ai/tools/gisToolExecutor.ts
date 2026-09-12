import type { BufferParameters, IdwParameters, RasterOverlay, SelectByLocationParameters, SelectByValueParameters, TerrainParameters, TerrainToolId } from '../../../gisStore';
import type { AiToolExecutor, AiToolResult } from '../types';
import type { AiGisPort, AiGisSnapshot } from './gisPort';
import { errorText, isAbortError, throwIfAborted } from '../services/aiErrors';
import { displayLayerName, summarizeGisContext } from '../services/gisContextService';
import { gisToolDefinitions } from './gisToolDefinitions';
import { validateToolInput } from './toolValidation';
import { toolResult } from './toolResults';

type ToolHandler = (input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) => Promise<AiToolResult>;

const handlers: Record<string, ToolHandler> = {
  list_layers: async (_input, snapshot) => toolResult('list_layers', 'success', '已读取当前 GIS 状态。', [], summarizeGisContext(snapshot)),
  buffer_vector: runBuffer,
  select_by_value: runSelectByValue,
  select_by_location: runSelectByLocation,
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
      return toolResult(name, 'blocked', `未注册的 GIS 工具：${name}`);
    }
    try {
      validateToolInput(definition, input);
    } catch (error) {
      return toolResult(name, 'blocked', errorText(error));
    }

    const snapshot = port.getSnapshot();
    if (name === 'list_layers') {
      return handler(input, snapshot, port);
    }
    if (running || snapshot.isRunning) {
      return toolResult(name, 'blocked', '已有 GIS 操作正在执行，请等待完成后再运行。');
    }
    const usesRaster = name === 'hillshade' || name === 'slope' || name === 'aspect';
    const changed = usesRaster
      ? snapshot.raster !== expected.raster
      : snapshot.layer?.id !== expected.layer?.id || snapshot.layer?.geojson !== expected.layer?.geojson;
    if (changed) {
      return toolResult(name, 'blocked', '当前输入图层已在本次请求期间改变，请基于新的地图状态重新发起请求。');
    }
    if ((usesRaster || name === 'buffer_vector' || name === 'idw_interpolation') && !snapshot.toolsReady) {
      return toolResult(name, 'blocked', 'WASM 工具仍在加载，请稍后再运行。');
    }

    running = true;
    try {
      throwIfAborted(signal);
      const result = await handler(input, snapshot, port);
      throwIfAborted(signal);
      const next = port.getSnapshot();
      if (result.ok && (usesRaster || name === 'idw_interpolation') && next.raster?.id === result.output?.rasterId) {
        expected = { ...expected, raster: next.raster };
      }
      if (result.ok && name === 'idw_interpolation' && next.layer?.id === result.output?.sourceLayerId) {
        expected = { ...expected, layer: next.layer };
      }
      return result;
    } catch (error) {
      throwIfAborted(signal);
      if (isAbortError(error)) throw error;
      return toolResult(name, 'failed', errorText(error));
    } finally {
      running = false;
    }
  };
}

function textArg(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function runBuffer(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  if (!snapshot.layer) {
    return toolResult('buffer_vector', 'blocked', '请先选择一个矢量图层。');
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
    return toolResult('buffer_vector', 'failed', result.message);
  }
  const count = result.output.geojson.features.length;
  return toolResult('buffer_vector', 'success', `缓冲区完成：${count} 个要素。`, ['GIS 操作返回了有效结果'], {
    outputName: result.output.name,
    featureCount: count,
    sourceLayerId: snapshot.layer.id,
    sourceLayerName: displayLayerName(snapshot.layer.fileName),
    parameters,
  });
}

async function runSelectByValue(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  const field = textArg(input.field, '');
  if (!snapshot.layer || !snapshot.layer.fields.includes(field)) {
    return toolResult('select_by_value', 'blocked', '请指定当前图层中存在的字段。', [], { fields: snapshot.layer?.fields ?? [] });
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
    ? toolResult('select_by_value', 'success', `已选中 ${result.selectedCount} / ${result.totalCount} 个要素。`, [], { ...result, parameters })
    : toolResult('select_by_value', 'failed', '属性选择未完成，请检查字段和比较值。');
}

async function runSelectByLocation(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  if (!snapshot.layer) {
    return toolResult('select_by_location', 'blocked', '请先选择目标矢量图层。');
  }
  const referenceLayerId = textArg(input.referenceLayerId, '');
  const exists = referenceLayerId === 'vectorOverlay'
    ? Boolean(snapshot.vectorOverlay)
    : snapshot.layers.some((layer) => layer.id === referenceLayerId);
  if (!exists) {
    return toolResult('select_by_location', 'blocked', '参考图层不存在，请先查看当前图层列表。');
  }
  const parameters: SelectByLocationParameters = {
    targetLayerId: snapshot.layer.id,
    referenceLayerId,
    relation: (input.relation as SelectByLocationParameters['relation'] | undefined) ?? 'intersects',
    selectionMode: (input.selectionMode as SelectByLocationParameters['selectionMode'] | undefined) ?? 'new',
  };
  const result = await port.selectByLocation(parameters);
  return result
    ? toolResult('select_by_location', 'success', `已选中 ${result.selectedCount} / ${result.totalCount} 个要素。`, [], { ...result, parameters })
    : toolResult('select_by_location', 'failed', '空间选择未完成，请检查图层和空间关系。');
}

async function runTerrain(tool: TerrainToolId, input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  if (!snapshot.raster) {
    return toolResult(tool, 'blocked', '请先添加一个 DEM 栅格。');
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
    : toolResult(tool, 'failed', result.message);
}

async function runIdw(input: Record<string, unknown>, snapshot: AiGisSnapshot, port: AiGisPort) {
  const layer = snapshot.layer?.points.features.length
    ? snapshot.layer
    : snapshot.layers.find((candidate) => candidate.points.features.length > 0);
  if (!layer) {
    return toolResult('idw_interpolation', 'blocked', '请先添加一个点图层。');
  }
  const field = textArg(input.field, layer.selectedField || layer.numericFields[0] || '');
  if (!layer.numericFields.includes(field)) {
    return toolResult('idw_interpolation', 'blocked', '请指定点图层中的数值字段。', [], { numericFields: layer.numericFields });
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
    : toolResult('idw_interpolation', 'failed', result.message);
}

function rasterResult(tool: string, raster: RasterOverlay, details: Record<string, unknown>) {
  if (!(raster.width > 0 && raster.height > 0)) {
    return toolResult(tool, 'failed', '输出栅格的尺寸无效。');
  }
  return toolResult(tool, 'success', `${tool} 完成：${raster.width} × ${raster.height}。`, ['GIS 操作返回了有效栅格'], {
    rasterId: raster.id,
    outputName: raster.name,
    width: raster.width,
    height: raster.height,
    min: raster.min,
    max: raster.max,
    epsg: raster.epsg ?? null,
    ...details,
  });
}
