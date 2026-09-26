import type { DigitizeCommand, DigitizeGeometryType, DigitizeState } from '../types';
import { copyAoiPolygon } from './digitizeValidation';

export function labelForTool(tool: DigitizeGeometryType) {
  return tool === 'Point' ? '点' : tool === 'LineString' ? '线' : '面';
}

export function getDrawingStatus(tool: DigitizeGeometryType, traceEnabled: boolean, snapEnabled: boolean) {
  if (tool === 'Polygon' && traceEnabled) return '面绘制中：从已有面边界起笔，在已有面边界结束，双击后自动补齐公共边。';
  return `${labelForTool(tool)}绘制中${snapEnabled ? '，靠近已有线或节点会自动吸附' : '，Snap 已关闭'}。`;
}

export function getToolStatus(state: Pick<DigitizeState, 'activeTool' | 'modifyEnabled' | 'snapEnabled' | 'traceEnabled' | 'rasterAoiActive'>) {
  const snap = state.snapEnabled ? 'Snap 已开启' : 'Snap 已关闭';
  if (state.rasterAoiActive) return `AOI 绘制已启用：双击结束多边形，${snap}。`;
  if (state.modifyEnabled) return `节点编辑已启用，${snap}。`;
  const trace = state.traceEnabled && state.activeTool === 'Polygon' ? '公共边自动完成已开启' : '公共边自动完成已关闭';
  return `${labelForTool(state.activeTool)}工具已启用，${snap}，${trace}。`;
}

export function createDefaultDigitizeState(): DigitizeState {
  const state: DigitizeState = {
    activeTool: 'Point', editingActive: false, featureCount: 0, modifyEnabled: false,
    rasterAoi: null, rasterAoiActive: false, rasterAoiRevision: 0, rasterPixelValuesVisible: false, snapEnabled: true, traceEnabled: true, status: '',
  };
  return { ...state, status: getToolStatus(state) };
}

export function digitizeReducer(state: DigitizeState, command: DigitizeCommand): DigitizeState {
  let next = state;
  switch (command.type) {
    case 'set-tool':
      if (!['Point', 'LineString', 'Polygon'].includes(command.tool)) throw new Error('不支持的编辑工具。');
      next = { ...state, activeTool: command.tool, modifyEnabled: false, rasterAoiActive: false };
      break;
    case 'set-editing':
      requireBoolean(command.active);
      next = { ...state, editingActive: command.active, modifyEnabled: command.active && state.modifyEnabled, rasterAoiActive: command.active && state.rasterAoiActive };
      break;
    case 'toggle-modify': next = { ...state, modifyEnabled: !state.modifyEnabled, rasterAoiActive: false }; break;
    case 'set-snap': requireBoolean(command.enabled); next = { ...state, snapEnabled: command.enabled }; break;
    case 'set-trace': requireBoolean(command.enabled); next = { ...state, traceEnabled: command.enabled }; break;
    case 'set-feature-count':
      if (!Number.isSafeInteger(command.count) || command.count < 0) throw new Error('要素数量必须是非负整数。');
      return { ...state, featureCount: command.count };
    case 'set-status':
      if (typeof command.status !== 'string') throw new Error('编辑状态消息必须是文本。');
      return { ...state, status: command.status };
    case 'start-aoi': next = { ...state, modifyEnabled: false, rasterAoi: null, rasterAoiActive: true, rasterAoiRevision: state.rasterAoiRevision + 1 }; break;
    case 'set-aoi':
      return { ...state, rasterAoi: command.polygon ? copyAoiPolygon(command.polygon) : null, rasterAoiActive: command.polygon ? false : state.rasterAoiActive, status: command.polygon ? 'AOI 已绘制，可输入像元值并执行栅格修改。' : 'AOI 已清空。' };
    case 'clear-aoi':
      return { ...state, rasterAoi: null, rasterAoiActive: false, rasterAoiRevision: state.rasterAoiRevision + 1, status: 'AOI 已清空。' };
    case 'set-raster-values':
      requireBoolean(command.visible);
      next = { ...state, rasterPixelValuesVisible: command.visible };
      break;
    default: throw new Error('不支持的编辑状态命令。');
  }
  return { ...next, status: getToolStatus(next) };
}

function requireBoolean(value: boolean) {
  if (typeof value !== 'boolean') throw new Error('编辑开关参数必须是布尔值。');
}
