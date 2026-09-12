import { defaultRects, paperPresets } from '../constants';
import type { LayoutAlignMode, LayoutCommand, LayoutElementId, LayoutOrderDirection, LayoutRect, LayoutState } from '../types';
import { clamp, constrainRect, getSelectionBounds, moveRectsTogether, resizeRect } from './layoutGeometry';

const elementIds: LayoutElementId[] = ['map-frame', 'title', 'north-arrow', 'scale-bar'];
const alignmentModes: LayoutAlignMode[] = ['left', 'center', 'right', 'top', 'middle', 'bottom'];

export function createDefaultLayoutState(): LayoutState {
  return {
    paperId: 'a4-landscape', zoom: 115, tool: 'select', selectMode: 'single', alignMode: 'left',
    enabledElements: [...elementIds], selectedElementIds: ['map-frame'],
    rects: Object.fromEntries(elementIds.map((id) => [id, { ...defaultRects[id] }])) as Record<LayoutElementId, LayoutRect>,
    mapGraticuleVisible: false, mapView: null,
  };
}

function requireFinite(...values: number[]) {
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) throw new Error('布局参数必须是有限数值。');
}

function requireOption<Value extends string>(value: Value, options: readonly Value[]) {
  if (!options.includes(value)) throw new Error(`不支持的布局参数：${value}`);
}

export function layoutReducer(state: LayoutState, command: LayoutCommand): LayoutState {
  const paper = paperPresets[state.paperId];
  switch (command.type) {
    case 'set-paper': {
      if (!Object.hasOwn(paperPresets, command.paperId)) throw new Error('不支持的纸张类型。');
      const nextPaper = paperPresets[command.paperId];
      return { ...state, paperId: command.paperId, rects: Object.fromEntries(elementIds.map((id) => [id, constrainRect(state.rects[id], nextPaper.widthMm, nextPaper.heightMm)])) as LayoutState['rects'] };
    }
    case 'set-zoom':
      requireFinite(command.zoom);
      return { ...state, zoom: clamp(command.zoom, 45, 180) };
    case 'set-tool':
      requireOption(command.tool, ['select', 'pan']);
      return { ...state, tool: command.tool };
    case 'set-select-mode':
      requireOption(command.mode, ['single', 'rectangle', 'polygon']);
      return { ...state, selectMode: command.mode };
    case 'set-align-mode':
      requireOption(command.mode, alignmentModes);
      return { ...state, alignMode: command.mode };
    case 'set-selection':
      command.elementIds.forEach((id) => requireOption(id, elementIds));
      return { ...state, selectedElementIds: [...new Set(command.elementIds)].filter((id) => state.enabledElements.includes(id)) };
    case 'toggle-element': {
      requireOption(command.elementId, elementIds);
      const removing = state.enabledElements.includes(command.elementId);
      const enabledElements = removing ? state.enabledElements.filter((id) => id !== command.elementId) : [...state.enabledElements, command.elementId];
      const selection = removing ? state.selectedElementIds.filter((id) => id !== command.elementId) : [command.elementId];
      return { ...state, enabledElements, selectedElementIds: selection.length ? selection : enabledElements.slice(0, 1) };
    }
    case 'update-rects': {
      const rects = { ...state.rects };
      Object.entries(command.rects).forEach(([key, rect]) => {
        const id = key as LayoutElementId;
        requireOption(id, elementIds);
        if (!rect) throw new Error('缺少布局元素矩形。');
        requireFinite(rect.x, rect.y, rect.width, rect.height);
        rects[id] = constrainRect(rect, paper.widthMm, paper.heightMm);
      });
      return { ...state, rects };
    }
    case 'move-elements': {
      requireFinite(command.deltaX, command.deltaY);
      command.elementIds.forEach((id) => requireOption(id, elementIds));
      const ids = command.elementIds.filter((id) => state.enabledElements.includes(id));
      return { ...state, rects: { ...state.rects, ...moveRectsTogether(state.rects, ids, command.deltaX, command.deltaY, paper.widthMm, paper.heightMm) } };
    }
    case 'resize-element':
      requireOption(command.elementId, elementIds);
      requireFinite(command.deltaX, command.deltaY);
      return { ...state, rects: { ...state.rects, [command.elementId]: resizeRect(state.rects[command.elementId], command.deltaX, command.deltaY, paper.widthMm, paper.heightMm) } };
    case 'align-selection':
      requireOption(command.mode, alignmentModes);
      return { ...state, rects: alignLayoutElements(state, command.mode) };
    case 'reorder-selection':
      requireOption(command.direction, ['up', 'down']);
      return { ...state, enabledElements: reorderLayoutElements(state.enabledElements, state.selectedElementIds, command.direction) };
    case 'set-graticule':
      if (typeof command.visible !== 'boolean') throw new Error('经纬网显隐参数必须是布尔值。');
      return { ...state, mapGraticuleVisible: command.visible };
    case 'set-map-view': {
      const { center3857, resolutionPerMm, rotation } = command.view;
      requireFinite(center3857[0], center3857[1], resolutionPerMm, rotation);
      if (center3857.length !== 2 || resolutionPerMm <= 0) throw new Error('地图视图参数无效。');
      return { ...state, mapView: { center3857: [...center3857], resolutionPerMm, rotation } };
    }
    case 'reset': return createDefaultLayoutState();
    default: throw new Error('不支持的布局操作。');
  }
}

export function alignLayoutElements(state: LayoutState, mode: LayoutAlignMode) {
  const ids = state.selectedElementIds.filter((id) => state.enabledElements.includes(id));
  const bounds = getSelectionBounds(state.rects, ids);
  if (!bounds) return state.rects;
  const paper = paperPresets[state.paperId];
  const rects = { ...state.rects };
  ids.forEach((id) => {
    const rect = state.rects[id];
    let horizontal = rect.x;
    let vertical = rect.y;
    if (mode === 'left') horizontal = bounds.x;
    if (mode === 'center') horizontal = bounds.x + (bounds.width - rect.width) / 2;
    if (mode === 'right') horizontal = bounds.x + bounds.width - rect.width;
    if (mode === 'top') vertical = bounds.y;
    if (mode === 'middle') vertical = bounds.y + (bounds.height - rect.height) / 2;
    if (mode === 'bottom') vertical = bounds.y + bounds.height - rect.height;
    rects[id] = constrainRect({ ...rect, x: horizontal, y: vertical }, paper.widthMm, paper.heightMm);
  });
  return rects;
}

export function canReorderLayoutElements(order: LayoutElementId[], selected: LayoutElementId[], direction: LayoutOrderDirection) {
  const indices = selected.map((id) => order.indexOf(id)).filter((index) => index >= 0);
  return indices.length > 0 && (direction === 'up' ? Math.max(...indices) < order.length - 1 : Math.min(...indices) > 0);
}

export function reorderLayoutElements(order: LayoutElementId[], selected: LayoutElementId[], direction: LayoutOrderDirection) {
  if (!canReorderLayoutElements(order, selected, direction)) return order;
  const selection = order.filter((id) => selected.includes(id));
  const edge = direction === 'up' ? Math.max(...selection.map((id) => order.indexOf(id))) : Math.min(...selection.map((id) => order.indexOf(id)));
  const target = order[edge + (direction === 'up' ? 1 : -1)];
  const remaining = order.filter((id) => !selection.includes(id));
  const insertion = remaining.indexOf(target) + (direction === 'up' ? 1 : 0);
  return [...remaining.slice(0, insertion), ...selection, ...remaining.slice(insertion)];
}

export function getLayoutDerivedState(state: LayoutState) {
  return {
    paper: paperPresets[state.paperId],
    pxPerMm: state.zoom / 28,
    selectedElementId: state.selectedElementIds[0] ?? null,
    selectedRect: getSelectionBounds(state.rects, state.selectedElementIds, state.enabledElements) ?? { x: 0, y: 0, width: 0, height: 0 },
    canMoveSelectionUp: canReorderLayoutElements(state.enabledElements, state.selectedElementIds, 'up'),
    canMoveSelectionDown: canReorderLayoutElements(state.enabledElements, state.selectedElementIds, 'down'),
  };
}
