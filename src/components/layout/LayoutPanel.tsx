import Ruler from '@scena/react-ruler';
import type { IDockviewPanelProps } from 'dockview-react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignLeft,
  AlignEndVertical,
  AlignRight,
  AlignStartVertical,
  ChevronDown,
  FileImage,
  FileText,
  Hexagon,
  Minus,
  Move,
  MousePointer2,
  Layers,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  SquareDashedMousePointer,
  Ruler as RulerIcon,
  Tags,
} from 'lucide-react';
import {
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  Suspense,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';

type PaperPresetId = 'a4-landscape' | 'a4-portrait' | 'a3-landscape';
type LayoutElementId = 'map-frame' | 'title' | 'north-arrow' | 'scale-bar';
type LayoutTool = 'select' | 'pan';
export type LayoutExportFormat = 'pdf' | 'png';
type LayoutSelectMode = 'single' | 'rectangle' | 'polygon';
type LayoutAlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
type LayoutOrderDirection = 'up' | 'down';
type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type DragState = {
  originX: number;
  originY: number;
} & (
  | {
      kind: 'single';
      elementId: LayoutElementId;
      mode: 'move' | 'resize';
      rect: LayoutRect;
    }
  | {
      kind: 'group';
      elementIds: LayoutElementId[];
      rects: Partial<Record<LayoutElementId, LayoutRect>>;
    }
);
type PanState = {
  originX: number;
  originY: number;
  scrollLeft: number;
  scrollTop: number;
};
type LayoutSelectionDraft =
  | {
      mode: 'rectangle';
      pointerId: number;
      start: [number, number];
      current: [number, number];
    }
  | {
      mode: 'polygon';
      points: [number, number][];
      current: [number, number] | null;
    };

const rulerGutterPx = 30;
const minElementSize = {
  width: 8,
  height: 6,
};
const layoutAlignModes: {
  id: LayoutAlignMode;
  label: string;
  renderIcon: () => ReactNode;
}[] = [
  { id: 'left', label: '左对齐', renderIcon: () => <AlignLeft size={18} strokeWidth={1.8} /> },
  { id: 'center', label: '居中对齐', renderIcon: () => <AlignCenterHorizontal size={18} strokeWidth={1.8} /> },
  { id: 'right', label: '右对齐', renderIcon: () => <AlignRight size={18} strokeWidth={1.8} /> },
  { id: 'top', label: '顶部对齐', renderIcon: () => <AlignStartVertical size={18} strokeWidth={1.8} /> },
  { id: 'middle', label: '中部对齐', renderIcon: () => <AlignCenterVertical size={18} strokeWidth={1.8} /> },
  { id: 'bottom', label: '底部对齐', renderIcon: () => <AlignEndVertical size={18} strokeWidth={1.8} /> },
];
const layoutSelectModes: {
  id: LayoutSelectMode;
  label: string;
  renderIcon: () => ReactNode;
}[] = [
  { id: 'single', label: '单选', renderIcon: () => <MousePointer2 size={18} strokeWidth={1.8} /> },
  { id: 'rectangle', label: '矩形', renderIcon: () => <SquareDashedMousePointer size={18} strokeWidth={1.8} /> },
  { id: 'polygon', label: '多边形', renderIcon: () => <Hexagon size={18} strokeWidth={1.8} /> },
];
const layoutExportFormats: {
  id: LayoutExportFormat;
  label: string;
  renderIcon: () => ReactNode;
}[] = [
  { id: 'pdf', label: 'PDF', renderIcon: () => <FileText size={18} strokeWidth={1.8} /> },
  { id: 'png', label: 'PNG', renderIcon: () => <FileImage size={18} strokeWidth={1.8} /> },
];
const layoutPreviewCenter: [number, number] = [10.4515, 51.1657];
const layoutPreviewZoom = 5.3;
const paperPresets: Record<PaperPresetId, { label: string; widthMm: number; heightMm: number }> = {
  'a4-landscape': { label: 'A4 横向', widthMm: 297, heightMm: 210 },
  'a4-portrait': { label: 'A4 纵向', widthMm: 210, heightMm: 297 },
  'a3-landscape': { label: 'A3 横向', widthMm: 420, heightMm: 297 },
};
const defaultRects: Record<LayoutElementId, LayoutRect> = {
  'map-frame': { x: 18, y: 28, width: 188, height: 126 },
  title: { x: 18, y: 10, width: 128, height: 12 },
  'north-arrow': { x: 218, y: 24, width: 18, height: 28 },
  'scale-bar': { x: 20, y: 166, width: 52, height: 14 },
};

type LayoutContextValue = {
  enabledElements: LayoutElementId[];
  exportPaper: (format?: LayoutExportFormat) => Promise<void>;
  setExportPaper: Dispatch<SetStateAction<(format?: LayoutExportFormat) => Promise<void>>>;
  mapGraticuleVisible: boolean;
  paper: { label: string; widthMm: number; heightMm: number };
  paperId: PaperPresetId;
  pxPerMm: number;
  rects: Record<LayoutElementId, LayoutRect>;
  selectedElementId: LayoutElementId;
  selectedElementIds: LayoutElementId[];
  selectedRect: LayoutRect;
  selectMode: LayoutSelectMode;
  tool: LayoutTool;
  zoom: number;
  alignMode: LayoutAlignMode;
  alignSelectedElement: (mode: LayoutAlignMode) => void;
  canMoveSelectionDown: boolean;
  canMoveSelectionUp: boolean;
  resetLayout: () => void;
  moveSelectedElements: (direction: LayoutOrderDirection) => void;
  setPaperId: (paperId: PaperPresetId) => void;
  setRects: Dispatch<SetStateAction<Record<LayoutElementId, LayoutRect>>>;
  setAlignMode: (mode: LayoutAlignMode) => void;
  setMapGraticuleVisible: (visible: boolean) => void;
  setSelectedElementId: (elementId: LayoutElementId) => void;
  setSelectedElementIds: (elementIds: LayoutElementId[]) => void;
  setSelectMode: (mode: LayoutSelectMode) => void;
  setTool: (tool: LayoutTool) => void;
  toggleElement: (elementId: LayoutElementId) => void;
  updateZoom: (zoom: number) => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayout() {
  const value = useContext(LayoutContext);

  if (!value) {
    throw new Error('useLayout must be used inside LayoutProvider');
  }

  return value;
}

const LayoutMapPreview = lazy(() => (
  import('./LayoutMapPreview').then((module) => ({ default: module.LayoutMapPreview }))
));

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [paperId, setPaperId] = useState<PaperPresetId>('a4-landscape');
  const [zoom, setZoom] = useState(115);
  const [tool, setTool] = useState<LayoutTool>('select');
  const [selectMode, setSelectMode] = useState<LayoutSelectMode>('single');
  const [alignMode, setAlignMode] = useState<LayoutAlignMode>('left');
  const [selectedElementId, setSelectedElementIdState] = useState<LayoutElementId>('map-frame');
  const [selectedElementIds, setSelectedElementIdsState] = useState<LayoutElementId[]>(['map-frame']);
  const [exportPaper, setExportPaper] = useState<(format?: LayoutExportFormat) => Promise<void>>(() => async () => {});
  const [mapGraticuleVisible, setMapGraticuleVisible] = useState(false);
  const [rects, setRects] = useState(defaultRects);
  const [enabledElements, setEnabledElements] = useState<LayoutElementId[]>(['map-frame', 'title', 'north-arrow', 'scale-bar']);
  const paper = paperPresets[paperId];
  const pxPerMm = zoom / 28;
  const selectedRect = getSelectionBounds(rects, selectedElementIds, enabledElements) ?? rects[selectedElementId];

  const updateZoom = useCallback((nextZoom: number) => {
    setZoom(Math.min(180, Math.max(45, nextZoom)));
  }, []);

  const setSelectedElementId = useCallback((elementId: LayoutElementId) => {
    setSelectedElementIdState(elementId);
    setSelectedElementIdsState([elementId]);
  }, []);

  const setSelectedElementIds = useCallback((elementIds: LayoutElementId[]) => {
    const nextIds: LayoutElementId[] = elementIds.length > 0 ? elementIds : ['map-frame'];
    setSelectedElementIdsState(nextIds);
    setSelectedElementIdState(nextIds[0]);
  }, []);

  const toggleElement = useCallback((elementId: LayoutElementId) => {
    setEnabledElements((current) => {
      if (current.includes(elementId)) {
        const next = current.filter((id) => id !== elementId);
        if (selectedElementId === elementId) {
          setSelectedElementId(next[0] ?? 'map-frame');
        }
        return next;
      }

      setSelectedElementId(elementId);
      return [...current, elementId];
    });
  }, [selectedElementId]);

  const resetLayout = useCallback(() => {
    const resetIds: LayoutElementId[] = ['map-frame', 'title', 'north-arrow', 'scale-bar'];
    const resetSelectionIds: LayoutElementId[] = ['map-frame'];

    setPaperId('a4-landscape');
    setZoom(115);
    setSelectMode('single');
    setAlignMode('left');
    setMapGraticuleVisible(false);
    setRects(defaultRects);
    setEnabledElements(resetIds);
    setSelectedElementId('map-frame');
    setSelectedElementIdsState(resetSelectionIds);
  }, []);

  const alignSelectedElement = useCallback((mode: LayoutAlignMode) => {
    setRects((current) => {
      const selectionIds = selectedElementIds.filter((id) => enabledElements.includes(id) && current[id]);
      const selectionBounds = getSelectionBounds(current, selectionIds, enabledElements);

      if (!selectionBounds || selectionIds.length === 0) {
        return current;
      }

      const centerX = selectionBounds.x + selectionBounds.width / 2;
      const centerY = selectionBounds.y + selectionBounds.height / 2;
      const nextRects = { ...current };

      selectionIds.forEach((elementId) => {
        const rect = current[elementId];

        if (!rect) {
          return;
        }

        let nextX = rect.x;
        let nextY = rect.y;

        if (mode === 'left') {
          nextX = selectionBounds.x;
        } else if (mode === 'center') {
          nextX = centerX - rect.width / 2;
        } else if (mode === 'right') {
          nextX = selectionBounds.x + selectionBounds.width - rect.width;
        } else if (mode === 'top') {
          nextY = selectionBounds.y;
        } else if (mode === 'middle') {
          nextY = centerY - rect.height / 2;
        } else if (mode === 'bottom') {
          nextY = selectionBounds.y + selectionBounds.height - rect.height;
        }

        nextRects[elementId] = {
          ...rect,
          x: clamp(nextX, 0, Math.max(0, paper.widthMm - rect.width)),
          y: clamp(nextY, 0, Math.max(0, paper.heightMm - rect.height)),
        };
      });

      return nextRects;
    });
  }, [enabledElements, paper.heightMm, paper.widthMm, selectedElementIds]);

  const selectionOrder = useMemo(
    () => enabledElements.filter((id) => selectedElementIds.includes(id)),
    [enabledElements, selectedElementIds],
  );

  const selectionOrderIndices = useMemo(
    () => selectionOrder.map((id) => enabledElements.indexOf(id)).filter((index) => index >= 0),
    [enabledElements, selectionOrder],
  );

  const canMoveSelectionUp = selectionOrderIndices.length > 0
    && Math.max(...selectionOrderIndices) < enabledElements.length - 1;

  const canMoveSelectionDown = selectionOrderIndices.length > 0
    && Math.min(...selectionOrderIndices) > 0;

  const moveSelectedElements = useCallback((direction: LayoutOrderDirection) => {
    setEnabledElements((current) => {
      const order = current;
      const selectedSet = new Set(selectedElementIds.filter((id) => order.includes(id)));
      const selectedInOrder = order.filter((id) => selectedSet.has(id));

      if (selectedInOrder.length === 0 || order.length < 2) {
        return current;
      }

      if (direction === 'up') {
        const lastSelectedIndex = Math.max(...selectedInOrder.map((id) => order.indexOf(id)));
        if (lastSelectedIndex >= order.length - 1) {
          return current;
        }

        let targetIndex = -1;
        for (let index = lastSelectedIndex + 1; index < order.length; index += 1) {
          if (!selectedSet.has(order[index])) {
            targetIndex = index;
            break;
          }
        }

        if (targetIndex === -1) {
          return current;
        }

        const targetId = order[targetIndex];
        const remaining = order.filter((id) => !selectedSet.has(id));
        const insertIndex = remaining.indexOf(targetId) + 1;

        return [
          ...remaining.slice(0, insertIndex),
          ...selectedInOrder,
          ...remaining.slice(insertIndex),
        ];
      }

      const firstSelectedIndex = Math.min(...selectedInOrder.map((id) => order.indexOf(id)));
      if (firstSelectedIndex <= 0) {
        return current;
      }

      let targetIndex = -1;
      for (let index = firstSelectedIndex - 1; index >= 0; index -= 1) {
        if (!selectedSet.has(order[index])) {
          targetIndex = index;
          break;
        }
      }

      if (targetIndex === -1) {
        return current;
      }

      const targetId = order[targetIndex];
      const remaining = order.filter((id) => !selectedSet.has(id));
      const insertIndex = remaining.indexOf(targetId);

      return [
        ...remaining.slice(0, insertIndex),
        ...selectedInOrder,
        ...remaining.slice(insertIndex),
      ];
    });
  }, [selectedElementIds]);

  const value = useMemo(
    () => ({
      enabledElements,
      exportPaper,
      setExportPaper,
      mapGraticuleVisible,
      paper,
      paperId,
      pxPerMm,
      rects,
      selectedElementId,
      selectedElementIds,
      selectedRect,
      selectMode,
      tool,
      alignMode,
      alignSelectedElement,
      canMoveSelectionDown,
      canMoveSelectionUp,
      zoom,
      resetLayout,
      moveSelectedElements,
      setPaperId,
      setRects,
      setAlignMode,
      setMapGraticuleVisible,
      setSelectedElementId,
      setSelectedElementIds,
      setSelectMode,
      setTool,
      toggleElement,
      updateZoom,
    }),
    [alignMode, alignSelectedElement, canMoveSelectionDown, canMoveSelectionUp, enabledElements, exportPaper, mapGraticuleVisible, moveSelectedElements, paper, paperId, pxPerMm, rects, resetLayout, selectedElementId, selectedElementIds, selectedRect, selectMode, setExportPaper, setMapGraticuleVisible, setSelectedElementIds, toggleElement, tool, updateZoom, zoom],
  );

  return (
    <LayoutContext.Provider value={value}>
      {children}
      <LayoutExportSurface />
    </LayoutContext.Provider>
  );
}

export function LayoutHeaderActions() {
  const layout = useLayout();

  return (
    <LayoutToolbar
      selectedRect={layout.selectedRect}
      tool={layout.tool}
      zoom={layout.zoom}
      onReset={layout.resetLayout}
      onToolChange={layout.setTool}
      onZoomChange={layout.updateZoom}
    />
  );
}

async function loadImageFromSvg(svgText: string) {
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = 'async';

    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('无法生成布局导出图片。'));
    });

    image.src = url;
    return await loaded;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function cloneLayoutPageForExport(source: HTMLElement, target: HTMLElement, exportScale: number) {
  inlineComputedStyles(source, target);

  target.style.transform = `scale(${exportScale})`;
  target.style.transformOrigin = 'top left';
  target.style.overflow = 'hidden';

  const pageLabel = target.querySelector('.layout-page-label') as HTMLElement | null;
  if (pageLabel) {
    pageLabel.style.setProperty('display', 'none', 'important');
  }

  target.querySelectorAll('.layout-selection-overlay, .layout-resize-handle').forEach((node) => {
    if (node instanceof HTMLElement) {
      node.style.setProperty('display', 'none', 'important');
    }
  });

  target.querySelectorAll('.layout-map-frame, .layout-adornment').forEach((node) => {
    if (node instanceof HTMLElement) {
      node.style.setProperty('border', 'none', 'important');
      node.style.setProperty('background', 'transparent', 'important');
      node.style.setProperty('box-shadow', 'none', 'important');
    }
  });
}

function inlineComputedStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source);
  const targetWithStyle = target as Element & { style: CSSStyleDeclaration };

  Array.from(computed).forEach((property) => {
    target.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    targetWithStyle.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
  });

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);

  sourceChildren.forEach((child, index) => {
    const targetChild = targetChildren[index];

    if (targetChild) {
      inlineComputedStyles(child, targetChild);
    }
  });

  if (source instanceof HTMLCanvasElement && target instanceof HTMLCanvasElement) {
    target.width = source.width;
    target.height = source.height;
    const context = target.getContext('2d');
    if (context) {
      try {
        source.toDataURL('image/png');
        context.drawImage(source, 0, 0);
      } catch {
        drawTaintedCanvasFallback(context, target.width, target.height);
      }
    }
  }
}

function drawTaintedCanvasFallback(context: CanvasRenderingContext2D, width: number, height: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const gridSize = Math.max(24, Math.round(Math.min(safeWidth, safeHeight) / 12));

  context.clearRect(0, 0, safeWidth, safeHeight);
  context.fillStyle = '#e8efe8';
  context.fillRect(0, 0, safeWidth, safeHeight);
  context.strokeStyle = 'rgba(75, 116, 94, 0.22)';
  context.lineWidth = 1;

  for (let x = 0; x <= safeWidth; x += gridSize) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, safeHeight);
    context.stroke();
  }

  for (let y = 0; y <= safeHeight; y += gridSize) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(safeWidth, y);
    context.stroke();
  }

  context.fillStyle = '#3f5262';
  context.font = `${Math.max(14, Math.round(Math.min(safeWidth, safeHeight) / 28))}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('底图跨域受限，无法导出在线瓦片', safeWidth / 2, safeHeight / 2);
}

async function renderLayoutPageToCanvas(page: HTMLElement, pxPerMm: number) {
  await document.fonts?.ready?.catch(() => undefined);

  const sourceRect = page.getBoundingClientRect();
  const targetPxPerMm = 300 / 25.4;
  const exportScale = targetPxPerMm / pxPerMm;
  const exportWidth = Math.max(1, Math.round(sourceRect.width * exportScale));
  const exportHeight = Math.max(1, Math.round(sourceRect.height * exportScale));
  const clonedPage = page.cloneNode(true) as HTMLDivElement;

  cloneLayoutPageForExport(page, clonedPage, exportScale);

  const html = clonedPage.outerHTML;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">`,
    `<foreignObject x="0" y="0" width="100%" height="100%">`,
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${exportWidth}px;height:${exportHeight}px;overflow:hidden;">`,
    html,
    '</div>',
    '</foreignObject>',
    '</svg>',
  ].join('');

  const image = await loadImageFromSvg(svg);
  const canvas = document.createElement('canvas');
  canvas.width = exportWidth;
  canvas.height = exportHeight;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('无法创建导出画布。');
  }

  context.drawImage(image, 0, 0);
  return canvas;
}

async function renderLayoutModelToCanvas({
  enabledElements,
  page,
  paper,
  pxPerMm,
  rects,
}: {
  enabledElements: LayoutElementId[];
  page: HTMLElement;
  paper: { label: string; widthMm: number; heightMm: number };
  pxPerMm: number;
  rects: Record<LayoutElementId, LayoutRect>;
}) {
  await document.fonts?.ready?.catch(() => undefined);

  const targetPxPerMm = 300 / 25.4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(paper.widthMm * targetPxPerMm));
  canvas.height = Math.max(1, Math.round(paper.heightMm * targetPxPerMm));

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('无法创建导出画布。');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  enabledElements.forEach((elementId) => {
    const rect = rects[elementId];

    if (!rect) {
      return;
    }

    const x = Math.round(rect.x * targetPxPerMm);
    const y = Math.round(rect.y * targetPxPerMm);
    const width = Math.round(rect.width * targetPxPerMm);
    const height = Math.round(rect.height * targetPxPerMm);

    if (elementId === 'map-frame') {
      drawExportMapFrame(context, page, x, y, width, height);
    } else if (elementId === 'title') {
      drawExportTitle(context, x, y, width, height);
    } else if (elementId === 'north-arrow') {
      drawExportNorthArrow(context, x, y, width, height);
    } else if (elementId === 'scale-bar') {
      drawExportScaleBar(context, x, y, width, height);
    }
  });

  return canvas;
}

function drawExportMapFrame(
  context: CanvasRenderingContext2D,
  page: HTMLElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();

  const mapCanvas = getReadableMapCanvas(page);

  if (mapCanvas) {
    context.drawImage(mapCanvas, x, y, width, height);
  } else {
    const fallback = document.createElement('canvas');
    fallback.width = Math.max(1, width);
    fallback.height = Math.max(1, height);
    const fallbackContext = fallback.getContext('2d');
    if (fallbackContext) {
      drawTaintedCanvasFallback(fallbackContext, fallback.width, fallback.height);
      context.drawImage(fallback, x, y);
    }
  }

  context.restore();
}

function drawExportTitle(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  context.save();
  context.fillStyle = '#1f2f3d';
  context.font = `700 ${Math.max(24, Math.round(height * 0.52))}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('地图标题', x + width / 2, y + height / 2, width);
  context.restore();
}

function drawExportNorthArrow(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const centerX = x + width / 2;
  const arrowTop = y + Math.max(4, height * 0.08);
  const arrowBottom = y + height * 0.72;
  const arrowHalfWidth = Math.max(8, width * 0.28);

  context.save();
  context.fillStyle = '#1e2d39';
  context.beginPath();
  context.moveTo(centerX, arrowTop);
  context.lineTo(centerX + arrowHalfWidth, arrowBottom);
  context.lineTo(centerX, arrowBottom - height * 0.18);
  context.lineTo(centerX - arrowHalfWidth, arrowBottom);
  context.closePath();
  context.fill();
  context.font = `700 ${Math.max(14, Math.round(height * 0.22))}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.fillText('N', centerX, y + height);
  context.restore();
}

function drawExportScaleBar(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const steps = 4;
  const barX = x + width * 0.08;
  const barY = y + height * 0.48;
  const barWidth = width * 0.84;
  const barHeight = Math.max(8, height * 0.22);
  const stepWidth = barWidth / steps;

  context.save();
  context.strokeStyle = '#1e2d39';
  context.lineWidth = Math.max(2, height * 0.06);
  context.font = `${Math.max(10, Math.round(height * 0.22))}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = '#1f2f3d';

  for (let index = 0; index < steps; index += 1) {
    context.fillStyle = index % 2 === 0 ? '#1e2d39' : '#ffffff';
    context.fillRect(barX + stepWidth * index, barY, stepWidth, barHeight);
    context.strokeRect(barX + stepWidth * index, barY, stepWidth, barHeight);
  }

  context.fillStyle = '#1f2f3d';
  context.fillText('0', barX, barY + barHeight + height * 0.08);
  context.fillText('500 km', barX + barWidth, barY + barHeight + height * 0.08);
  context.restore();
}

function getReadableMapCanvas(page: HTMLElement) {
  const canvases = Array.from(page.querySelectorAll<HTMLCanvasElement>('.layout-map-frame canvas'))
    .filter((canvas) => canvas.width > 0 && canvas.height > 0)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  return canvases.find((canvas) => isCanvasReadable(canvas)) ?? null;
}

function isCanvasReadable(canvas: HTMLCanvasElement) {
  try {
    canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function canvasToPdfBlob(canvas: HTMLCanvasElement, paperWidthMm: number, paperHeightMm: number) {
  const imageData = canvas.toDataURL('image/jpeg', 0.96);
  const imageBytes = base64ToBytes(imageData.split(',')[1] ?? '');
  const pageWidthPt = mmToPdfPoints(paperWidthMm);
  const pageHeightPt = mmToPdfPoints(paperHeightMm);
  const content = `q ${pageWidthPt.toFixed(2)} 0 0 ${pageHeightPt.toFixed(2)} 0 0 cm /Im0 Do Q`;
  const contentBytes = encodeAscii(content);
  const chunks: Uint8Array[] = [];
  const offsets = [0];
  let offset = 0;

  const append = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? encodeAscii(chunk) : chunk;
    chunks.push(bytes);
    offset += bytes.length;
  };

  const appendObject = (objectId: number, body: string, stream?: Uint8Array) => {
    offsets[objectId] = offset;
    append(`${objectId} 0 obj\n${body}`);

    if (stream) {
      append('\nstream\n');
      append(stream);
      append('\nendstream');
    }

    append('\nendobj\n');
  };

  append('%PDF-1.4\n% CTEarth\n');
  appendObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  appendObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  appendObject(
    3,
    [
      '<< /Type /Page',
      '/Parent 2 0 R',
      `/MediaBox [0 0 ${pageWidthPt.toFixed(2)} ${pageHeightPt.toFixed(2)}]`,
      '/Resources << /XObject << /Im0 5 0 R >> >>',
      '/Contents 4 0 R',
      '>>',
    ].join(' '),
  );
  appendObject(4, `<< /Length ${contentBytes.length} >>`, contentBytes);
  appendObject(
    5,
    [
      '<< /Type /XObject',
      '/Subtype /Image',
      `/Width ${canvas.width}`,
      `/Height ${canvas.height}`,
      '/ColorSpace /DeviceRGB',
      '/BitsPerComponent 8',
      '/Filter /DCTDecode',
      `/Length ${imageBytes.length}`,
      '>>',
    ].join(' '),
    imageBytes,
  );

  const xrefOffset = offset;
  append('xref\n0 6\n0000000000 65535 f \n');

  for (let objectId = 1; objectId <= 5; objectId += 1) {
    append(`${offsetNumber(offsets[objectId])} 00000 n \n`);
  }

  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const pdfBytes = new Uint8Array(offset);
  let writeOffset = 0;

  chunks.forEach((chunk) => {
    pdfBytes.set(chunk, writeOffset);
    writeOffset += chunk.length;
  });

  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

function base64ToBytes(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeAscii(text: string) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function mmToPdfPoints(mm: number) {
  return (mm / 25.4) * 72;
}

function offsetNumber(value: number) {
  return value.toString().padStart(10, '0');
}

function LayoutExportSurface() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [northArrowTarget, setNorthArrowTarget] = useState<HTMLDivElement | null>(null);
  const [scaleBarTarget, setScaleBarTarget] = useState<HTMLDivElement | null>(null);
  const {
    enabledElements,
    paper,
    paperId,
    pxPerMm,
    rects,
    setExportPaper,
  } = useLayout();
  const pageWidthPx = paper.widthMm * pxPerMm;
  const pageHeightPx = paper.heightMm * pxPerMm;

  useEffect(() => {
    const exportPaper = async (format: LayoutExportFormat = 'pdf') => {
      const page = pageRef.current;

      if (!page) {
        throw new Error('导出版面尚未准备好。');
      }

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      const canvas = await renderLayoutModelToCanvas({
        enabledElements,
        page,
        paper,
        pxPerMm,
        rects,
      });
      const blob = format === 'png'
        ? await canvasToBlob(canvas, 'image/png')
        : canvasToPdfBlob(canvas, paper.widthMm, paper.heightMm);

      if (!blob) {
        throw new Error('无法生成导出文件。');
      }

      downloadBlob(blob, `${paperId}-300dpi.${format}`);
    };

    setExportPaper(() => exportPaper);

    return () => {
      setExportPaper(() => async () => {});
    };
  }, [enabledElements, paper, paperId, pxPerMm, rects, setExportPaper]);

  return (
    <div className="layout-export-surface" aria-hidden="true">
      <div
        className="layout-page"
        ref={pageRef}
        style={{
          height: pageHeightPx,
          width: pageWidthPx,
        }}
      >
        {enabledElements.map((elementId) => (
          elementId === 'map-frame' ? (
            <LayoutMapFrame
              key={elementId}
              rect={rects[elementId]}
              active={false}
              selected={false}
              northArrowTarget={northArrowTarget}
              scaleBarTarget={scaleBarTarget}
              zoomScale={pxPerMm}
              onPointerDown={noopPointerHandler}
              onResizePointerDown={noopPointerHandler}
            />
          ) : (
            <LayoutAdornment
              key={elementId}
              elementId={elementId}
              rect={rects[elementId]}
              active={false}
              selected={false}
              hostRef={elementId === 'north-arrow' ? setNorthArrowTarget : elementId === 'scale-bar' ? setScaleBarTarget : undefined}
              zoomScale={pxPerMm}
              onPointerDown={noopPointerHandler}
              onResizePointerDown={noopPointerHandler}
            />
          )
        ))}
      </div>
    </div>
  );
}

function noopPointerHandler(_event: ReactPointerEvent<HTMLElement>) {}

export function LayoutOrderButton({ direction }: { direction: LayoutOrderDirection }) {
  const { canMoveSelectionDown, canMoveSelectionUp, moveSelectedElements } = useLayout();
  const isUp = direction === 'up';
  const disabled = isUp ? !canMoveSelectionUp : !canMoveSelectionDown;

  return (
    <button
      type="button"
      disabled={disabled}
      title={isUp ? '上移选中元素' : '下移选中元素'}
      aria-label={isUp ? '上移选中元素' : '下移选中元素'}
      onClick={() => moveSelectedElements(direction)}
    >
      {isUp ? <Layers size={23} strokeWidth={1.6} /> : <Tags size={23} strokeWidth={1.6} />}
      <span>{isUp ? '上移' : '下移'}</span>
    </button>
  );
}

const layoutElementControls: {
  id: LayoutElementId;
  label: string;
  renderIcon: () => ReactNode;
}[] = [
  { id: 'map-frame', label: '地图框', renderIcon: () => <RectangleHorizontal size={23} strokeWidth={1.6} /> },
  { id: 'title', label: '标题', renderIcon: () => <strong className="ribbon-letter-icon">T</strong> },
  { id: 'north-arrow', label: '指北针', renderIcon: () => <strong className="ribbon-letter-icon">N</strong> },
  { id: 'scale-bar', label: '比例尺', renderIcon: () => <RulerIcon size={23} strokeWidth={1.6} /> },
];

export function LayoutElementControls() {
  const { enabledElements, mapGraticuleVisible, setMapGraticuleVisible, toggleElement } = useLayout();

  return (
    <div className="ribbon-layout-element-controls" role="toolbar" aria-label="整饬元素">
      <div className="ribbon-layout-element-buttons">
        {layoutElementControls.map((control) => {
          const isEnabled = enabledElements.includes(control.id);

          return (
            <button
              className={isEnabled ? 'is-active' : undefined}
              key={control.id}
              type="button"
              title={control.label}
              aria-label={control.label}
              aria-pressed={isEnabled}
              onClick={() => toggleElement(control.id)}
            >
              {control.renderIcon()}
              <span>{control.label}</span>
            </button>
          );
        })}
      </div>
      <label className="ribbon-map-graticule-toggle" title="显示 Map Graticule" aria-label="显示 Map Graticule">
        <input
          type="checkbox"
          checked={mapGraticuleVisible}
          onChange={(event) => setMapGraticuleVisible(event.target.checked)}
        />
        <span>经纬网</span>
      </label>
    </div>
  );
}

export function LayoutAlignSplitButton() {
  const { alignMode, alignSelectedElement, setAlignMode } = useLayout();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentMode = layoutAlignModes.find((mode) => mode.id === alignMode) ?? layoutAlignModes[0];

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const executeAlign = useCallback((mode: LayoutAlignMode) => {
    setAlignMode(mode);
    alignSelectedElement(mode);
    setIsOpen(false);
  }, [alignSelectedElement, setAlignMode]);

  return (
    <div ref={rootRef} className="ribbon-align-split">
      <button
        type="button"
        className="ribbon-align-main"
        title={currentMode.label}
        aria-label={currentMode.label}
        onClick={() => executeAlign(alignMode)}
      >
        {currentMode.renderIcon()}
        <span>{currentMode.label}</span>
      </button>
      <button
        type="button"
        className={`ribbon-align-toggle${isOpen ? ' is-open' : ''}`}
        title="展开其他对齐方式"
        aria-label="展开其他对齐方式"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {isOpen ? (
        <div className="ribbon-align-menu" role="menu" aria-label="对齐方式">
          {layoutAlignModes.map((mode) => (
            <button
              key={mode.id}
              className={mode.id === alignMode ? 'is-selected' : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={mode.id === alignMode}
              onClick={() => executeAlign(mode.id)}
            >
              {mode.renderIcon()}
              <span>{mode.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LayoutExportSplitButton() {
  const { exportPaper } = useLayout();
  const [format, setFormat] = useState<LayoutExportFormat>('pdf');
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentFormat = layoutExportFormats.find((item) => item.id === format) ?? layoutExportFormats[0];

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const executeExport = useCallback(async (nextFormat: LayoutExportFormat) => {
    setFormat(nextFormat);
    setIsOpen(false);
    try {
      await exportPaper(nextFormat);
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败。';
      window.alert(message);
    }
  }, [exportPaper]);

  return (
    <div ref={rootRef} className="ribbon-export-split">
      <button
        type="button"
        className="ribbon-export-main"
        title={`导出为 ${currentFormat.label}`}
        aria-label={`导出为 ${currentFormat.label}`}
        onClick={() => void executeExport(format)}
      >
        {currentFormat.renderIcon()}
        <span>导出</span>
      </button>
      <button
        type="button"
        className={`ribbon-export-toggle${isOpen ? ' is-open' : ''}`}
        title="展开导出格式"
        aria-label="展开导出格式"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {isOpen ? (
        <div className="ribbon-export-menu" role="menu" aria-label="导出格式">
          {layoutExportFormats.map((item) => (
            <button
              key={item.id}
              className={item.id === format ? 'is-selected' : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={item.id === format}
              onClick={() => void executeExport(item.id)}
            >
              {item.renderIcon()}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LayoutPaperSelect() {
  const { paperId, setPaperId } = useLayout();

  return (
    <label className="ribbon-layer-select layout-paper-select">
      <RectangleHorizontal size={18} strokeWidth={1.7} />
      <select value={paperId} aria-label="纸张" onChange={(event) => setPaperId(event.target.value as PaperPresetId)}>
        {Object.entries(paperPresets).map(([id, paper]) => (
          <option key={id} value={id}>{paper.label}</option>
        ))}
      </select>
    </label>
  );
}

export function LayoutPanel({ api }: IDockviewPanelProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const horizontalRulerRef = useRef<Ruler | null>(null);
  const verticalRulerRef = useRef<Ruler | null>(null);
  const {
    enabledElements,
    paper,
    paperId,
    pxPerMm,
    rects,
    selectedElementId,
    selectedElementIds,
    setRects,
    setSelectedElementId,
    setSelectedElementIds,
    selectMode,
    tool,
  } = useLayout();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<LayoutSelectionDraft | null>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [northArrowTarget, setNorthArrowTarget] = useState<HTMLDivElement | null>(null);
  const [scaleBarTarget, setScaleBarTarget] = useState<HTMLDivElement | null>(null);
  const pageWidthPx = paper.widthMm * pxPerMm;
  const pageHeightPx = paper.heightMm * pxPerMm;

  const rulerScrollLeftMm = Math.max(0, (scroll.left - rulerGutterPx) / pxPerMm);
  const rulerScrollTopMm = Math.max(0, (scroll.top - rulerGutterPx) / pxPerMm);

  const resizeRulers = useCallback(() => {
    window.requestAnimationFrame(() => {
      horizontalRulerRef.current?.resize();
      verticalRulerRef.current?.resize();
    });
  }, []);

  const beginElementDrag = useCallback((
    elementId: LayoutElementId,
    event: ReactPointerEvent<HTMLElement>,
    mode: 'move' | 'resize' = 'move',
  ) => {
    if (tool !== 'select') {
      return;
    }

    if (selectMode !== 'single') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const isSelected = selectedElementIds.includes(elementId);

    if (!isSelected) {
      setSelectedElementId(elementId);
    }

    if (mode === 'move' && isSelected) {
      const nextElementIds = selectedElementIds.filter((id) => enabledElements.includes(id));
      const dragIds = nextElementIds.length > 0 ? nextElementIds : [elementId];
      const snapshotRects: Partial<Record<LayoutElementId, LayoutRect>> = {};

      dragIds.forEach((id) => {
        snapshotRects[id] = rects[id];
      });

      setDragState({
        kind: 'group',
        elementIds: dragIds,
        originX: event.clientX,
        originY: event.clientY,
        rects: snapshotRects,
      });
      return;
    }

    setDragState({
      kind: 'single',
      elementId,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      rect: rects[elementId],
    });
  }, [enabledElements, rects, selectMode, selectedElementIds, setSelectedElementId, tool]);

  const beginSelectionDraft = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'select' || selectMode !== 'rectangle' || !pageRef.current || event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = pagePointFromClient(event.clientX, event.clientY, pageRef.current, pxPerMm);

    if (!point) {
      return;
    }

    setSelectionDraft({
      mode: 'rectangle',
      pointerId: event.pointerId,
      start: point,
      current: point,
    });
  }, [pxPerMm, selectMode, tool]);

  const handlePolygonClick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'select' || selectMode !== 'polygon' || !pageRef.current || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = pagePointFromClient(event.clientX, event.clientY, pageRef.current, pxPerMm);

    if (!point) {
      return;
    }

    setSelectionDraft((current) => {
      if (!current || current.mode !== 'polygon') {
        return { mode: 'polygon', points: [point], current: null };
      }

      const lastPoint = current.points[current.points.length - 1];
      if (lastPoint && distanceMm(lastPoint, point) < 0.5) {
        return {
          ...current,
          current: point,
        };
      }

      return {
        ...current,
        points: [...current.points, point],
        current: null,
      };
    });
  }, [pxPerMm, selectMode, tool]);

  const handlePolygonDoubleClick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'select' || selectMode !== 'polygon' || !pageRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setSelectionDraft((current) => {
      if (!current || current.mode !== 'polygon') {
        return current;
      }

      const points = dedupeAdjacentPoints(current.points);

      if (points.length >= 3) {
        const nextIds = selectElementsByPolygon(rects, enabledElements, points);

        if (nextIds.length > 0) {
          setSelectedElementIds(nextIds);
        }
      }

      return null;
    });
  }, [enabledElements, rects, selectMode, setSelectedElementIds, tool]);

  const beginBoardPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'pan' || !boardRef.current) {
      return;
    }

    event.preventDefault();
    setPanState({
      originX: event.clientX,
      originY: event.clientY,
      scrollLeft: boardRef.current.scrollLeft,
      scrollTop: boardRef.current.scrollTop,
    });
  }, [tool]);

  useEffect(() => {
    setSelectionDraft(null);
  }, [selectMode, tool]);

  useEffect(() => {
    if (!dragState && !panState && selectionDraft?.mode !== 'rectangle' && selectionDraft?.mode !== 'polygon') {
      return undefined;
    }

    const move = (event: PointerEvent) => {
      if (selectionDraft?.mode === 'rectangle' && event.pointerId === selectionDraft.pointerId && pageRef.current) {
        const point = pagePointFromClient(event.clientX, event.clientY, pageRef.current, pxPerMm);

        if (point) {
          setSelectionDraft({
            ...selectionDraft,
            current: point,
          });
        }
      }

      if (selectionDraft?.mode === 'polygon' && pageRef.current) {
        const point = pagePointFromClient(event.clientX, event.clientY, pageRef.current, pxPerMm);

        if (point) {
          setSelectionDraft((current) => {
            if (!current || current.mode !== 'polygon') {
              return current;
            }

            return {
              ...current,
              current: point,
            };
          });
        }
      }

      if (dragState) {
        const deltaX = (event.clientX - dragState.originX) / pxPerMm;
        const deltaY = (event.clientY - dragState.originY) / pxPerMm;

        if (dragState.kind === 'group') {
          setRects((current) => {
            const nextRects = { ...current };

            dragState.elementIds.forEach((elementId) => {
              const rect = dragState.rects[elementId];

              if (rect) {
                nextRects[elementId] = moveRect(rect, deltaX, deltaY, paper.widthMm, paper.heightMm);
              }
            });

            return nextRects;
          });
        } else {
          setRects((current) => ({
            ...current,
            [dragState.elementId]: dragState.mode === 'resize'
              ? resizeRect(dragState.rect, deltaX, deltaY, paper.widthMm, paper.heightMm)
              : moveRect(dragState.rect, deltaX, deltaY, paper.widthMm, paper.heightMm),
          }));
        }
      }

      if (panState && boardRef.current) {
        boardRef.current.scrollLeft = panState.scrollLeft - (event.clientX - panState.originX);
        boardRef.current.scrollTop = panState.scrollTop - (event.clientY - panState.originY);
      }
    };
    const stop = (event: PointerEvent) => {
      if (selectionDraft?.mode === 'rectangle' && event.pointerId === selectionDraft.pointerId) {
        const nextIds = selectElementsByRect(rects, enabledElements, normalizeMmRect(selectionDraft.start, selectionDraft.current));

        if (nextIds.length > 0) {
          setSelectedElementIds(nextIds);
        }
        setSelectionDraft(null);
      }

      setDragState(null);
      setPanState(null);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragState, enabledElements, panState, pxPerMm, rects, selectionDraft, setSelectedElementIds]);

  useEffect(() => {
    resizeRulers();
  }, [paper.heightMm, paper.widthMm, pxPerMm, resizeRulers]);

  useEffect(() => {
    const visibilityDisposable = api.onDidVisibilityChange((event) => {
      if (event.isVisible) {
        resizeRulers();
      }
    });
    const activeDisposable = api.onDidActiveChange((event) => {
      if (event.isActive) {
        resizeRulers();
      }
    });
    const dimensionsDisposable = api.onDidDimensionsChange(resizeRulers);

    window.addEventListener('resize', resizeRulers);

    return () => {
      visibilityDisposable.dispose();
      activeDisposable.dispose();
      dimensionsDisposable.dispose();
      window.removeEventListener('resize', resizeRulers);
    };
  }, [api, resizeRulers]);

  const handlePagePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'select') {
      return;
    }

    if (selectMode === 'single') {
      if (event.target === event.currentTarget && event.button === 0) {
        setSelectedElementId('map-frame');
      }

      return;
    }

    if (selectMode === 'rectangle') {
      beginSelectionDraft(event);
    }
  }, [beginSelectionDraft, selectMode, setSelectedElementId, tool]);

  const handlePageClick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    handlePolygonClick(event);
  }, [handlePolygonClick]);

  const handlePageDoubleClick = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    handlePolygonDoubleClick(event);
  }, [handlePolygonDoubleClick]);

  return (
    <section className="layout-panel" aria-label="地图布局">
      <div className={`layout-workspace ${tool}-mode`}>
        <div className="layout-ruler-corner" aria-hidden="true" />
        <div className="layout-ruler layout-ruler-top" aria-hidden="true">
          <Ruler
            ref={horizontalRulerRef}
            backgroundColor="#f6f8f9"
            direction="end"
            font="12px sans-serif"
            lineColor="#6f7f8a"
            negativeRuler={false}
            range={[0, paper.widthMm]}
            scrollPos={rulerScrollLeftMm}
            segment={10}
            textColor="#56636d"
            textFormat={(value) => `${value}`}
            textOffset={[2, 2]}
            type="horizontal"
            unit={10}
            useResizeObserver
            zoom={pxPerMm}
          />
        </div>
        <div className="layout-ruler layout-ruler-left" aria-hidden="true">
          <Ruler
            ref={verticalRulerRef}
            backgroundColor="#f6f8f9"
            direction="end"
            font="12px sans-serif"
            lineColor="#6f7f8a"
            negativeRuler={false}
            range={[0, paper.heightMm]}
            scrollPos={rulerScrollTopMm}
            segment={10}
            textColor="#56636d"
            textFormat={(value) => `${value}`}
            textOffset={[2, 1]}
            type="vertical"
            unit={10}
            useResizeObserver
            zoom={pxPerMm}
          />
        </div>
        <div
          className="layout-board"
          ref={boardRef}
          onPointerDown={beginBoardPan}
          onScroll={(event) => {
            setScroll({
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop,
            });
          }}
        >
          <div
            className="layout-canvas"
            style={{
              minHeight: pageHeightPx + rulerGutterPx * 2,
              minWidth: pageWidthPx + rulerGutterPx * 2,
              padding: rulerGutterPx,
            }}
          >
            <div
              className="layout-page"
              ref={pageRef}
              style={{
                height: pageHeightPx,
                width: pageWidthPx,
              }}
              onPointerDown={handlePagePointerDown}
              onClick={handlePageClick}
              onDoubleClick={handlePageDoubleClick}
            >
              <div className="layout-page-label">
                <span>{paper.label}</span>
                <strong>{paper.widthMm} x {paper.heightMm} mm</strong>
              </div>
              {enabledElements.map((elementId) => (
                elementId === 'map-frame' ? (
                  <LayoutMapFrame
                    key={elementId}
                    rect={rects[elementId]}
                    active={selectedElementId === elementId}
                    selected={selectedElementIds.includes(elementId)}
                    northArrowTarget={northArrowTarget}
                    scaleBarTarget={scaleBarTarget}
                    zoomScale={pxPerMm}
                    onPointerDown={(event) => beginElementDrag(elementId, event)}
                    onResizePointerDown={(event) => beginElementDrag(elementId, event, 'resize')}
                  />
                ) : (
                  <LayoutAdornment
                    key={elementId}
                    elementId={elementId}
                    rect={rects[elementId]}
                    active={selectedElementId === elementId}
                    selected={selectedElementIds.includes(elementId)}
                    hostRef={elementId === 'north-arrow' ? setNorthArrowTarget : elementId === 'scale-bar' ? setScaleBarTarget : undefined}
                    zoomScale={pxPerMm}
                    onPointerDown={(event) => beginElementDrag(elementId, event)}
                    onResizePointerDown={(event) => beginElementDrag(elementId, event, 'resize')}
                  />
                )
              ))}
              {selectionDraft ? (
                <LayoutSelectionOverlay
                  draft={selectionDraft}
                  pageHeightPx={pageHeightPx}
                  pageWidthPx={pageWidthPx}
                  zoomScale={pxPerMm}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LayoutPageSettings() {
  return (
    <div className="layout-page-settings">
      <LayoutPaperSelect />
    </div>
  );
}

function LayoutToolbar({
  selectedRect,
  tool,
  zoom,
  onReset,
  onToolChange,
  onZoomChange,
}: {
  selectedRect: LayoutRect;
  tool: LayoutTool;
  zoom: number;
  onReset: () => void;
  onToolChange: (tool: LayoutTool) => void;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <header
      className="layout-toolbar"
      aria-label="布局工具"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="layout-toolbar-group">
        <LayoutSelectButton />
        <button
          className={tool === 'pan' ? 'is-selected' : undefined}
          type="button"
          title="平移页面"
          aria-label="平移页面"
          aria-pressed={tool === 'pan'}
          onClick={() => onToolChange('pan')}
        >
          <Move size={16} />
        </button>
      </div>
      <div className="layout-toolbar-group">
        <button type="button" title="缩小" aria-label="缩小" onClick={() => onZoomChange(zoom - 10)}>
          <Minus size={16} />
        </button>
        <input
          className="layout-zoom-slider"
          type="range"
          min={45}
          max={180}
          step={5}
          value={zoom}
          aria-label="缩放"
          onChange={(event) => onZoomChange(Number(event.target.value))}
        />
        <output className="layout-zoom-value">{zoom}%</output>
        <button type="button" title="放大" aria-label="放大" onClick={() => onZoomChange(zoom + 10)}>
          <Plus size={16} />
        </button>
      </div>
      <div className="layout-selection-readout">
        <span>X {formatMm(selectedRect.x)}</span>
        <span>Y {formatMm(selectedRect.y)}</span>
        <span>W {formatMm(selectedRect.width)}</span>
        <span>H {formatMm(selectedRect.height)}</span>
      </div>
      <button className="layout-reset-button" type="button" title="重置布局" aria-label="重置布局" onClick={onReset}>
        <RotateCcw size={16} />
      </button>
    </header>
  );
}

function LayoutMapFrame({
  rect,
  active,
  selected,
  northArrowTarget,
  scaleBarTarget,
  zoomScale,
  onPointerDown,
  onResizePointerDown,
}: {
  rect: LayoutRect;
  active: boolean;
  selected: boolean;
  northArrowTarget: HTMLDivElement | null;
  scaleBarTarget: HTMLDivElement | null;
  zoomScale: number;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className={[ 'layout-map-frame', selected ? 'is-selected' : '', active ? 'is-active' : '' ].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      aria-label="地图框"
      style={rectToStyle(rect, zoomScale)}
      onPointerDown={onPointerDown}
    >
      <Suspense fallback={<div className="layout-map-preview-map" aria-hidden="true" />}>
        <LayoutMapPreview northArrowTarget={northArrowTarget} scaleBarTarget={scaleBarTarget} />
      </Suspense>
      {active ? <span className="layout-resize-handle se" aria-hidden="true" onPointerDown={onResizePointerDown} /> : null}
    </div>
  );
}

export function LayoutSelectButton() {
  const { setSelectMode, setTool, tool } = useLayout();

  return (
    <button
      className={tool === 'select' ? 'is-selected' : undefined}
      type="button"
      title="选择"
      aria-label="选择"
      aria-pressed={tool === 'select'}
      onClick={() => {
        setTool('select');
        setSelectMode('single');
      }}
    >
      <MousePointer2 size={16} />
    </button>
  );
}

export function LayoutSelectionSplitButton() {
  const { selectMode, setSelectMode, setTool, tool } = useLayout();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentMode = layoutSelectModes.find((mode) => mode.id === selectMode) ?? layoutSelectModes[0];

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const activateMode = useCallback((mode: LayoutSelectMode) => {
    setTool('select');
    setSelectMode(mode);
    setIsOpen(false);
  }, [setSelectMode, setTool]);

  return (
    <div ref={rootRef} className={`ribbon-select-split${tool === 'select' ? ' is-selected' : ''}`}>
      <button
        type="button"
        className="ribbon-select-main"
        title={currentMode.label}
        aria-label={currentMode.label}
        onClick={() => activateMode(selectMode)}
      >
        {currentMode.renderIcon()}
        <span>{currentMode.label}</span>
      </button>
      <button
        type="button"
        className={`ribbon-select-toggle${isOpen ? ' is-open' : ''}`}
        title="展开其他选择方式"
        aria-label="展开其他选择方式"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {isOpen ? (
        <div className="ribbon-select-menu" role="menu" aria-label="选择方式">
          {layoutSelectModes.map((mode) => (
            <button
              key={mode.id}
              className={mode.id === selectMode ? 'is-selected' : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={mode.id === selectMode}
              onClick={() => activateMode(mode.id)}
            >
              {mode.renderIcon()}
              <span>{mode.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LayoutAdornment({
  elementId,
  rect,
  active,
  selected,
  hostRef,
  zoomScale,
  onPointerDown,
  onResizePointerDown,
}: {
  elementId: LayoutElementId;
  rect: LayoutRect;
  active: boolean;
  selected: boolean;
  hostRef?: (node: HTMLDivElement | null) => void;
  zoomScale: number;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const className = [
    'layout-adornment',
    `layout-${elementId}`,
    active ? 'is-active' : '',
    selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      aria-label={elementLabel(elementId)}
      style={rectToStyle(rect, zoomScale)}
      onPointerDown={onPointerDown}
    >
      {elementId === 'title' ? <strong>地图标题</strong> : null}
      {elementId === 'north-arrow' ? <div ref={hostRef} className="layout-control-host layout-north-arrow-host" aria-hidden="true" /> : null}
      {elementId === 'scale-bar' ? <div ref={hostRef} className="layout-control-host layout-scale-bar-host" aria-hidden="true" /> : null}
      {active ? <span className="layout-resize-handle se" aria-hidden="true" onPointerDown={onResizePointerDown} /> : null}
    </div>
  );
}

function rectToStyle(rect: LayoutRect, scale: number): CSSProperties {
  return {
    height: `${rect.height * scale}px`,
    left: `${rect.x * scale}px`,
    top: `${rect.y * scale}px`,
    width: `${rect.width * scale}px`,
  };
}

function moveRect(rect: LayoutRect, deltaX: number, deltaY: number, paperWidth: number, paperHeight: number): LayoutRect {
  return {
    ...rect,
    x: clamp(rect.x + deltaX, 0, Math.max(0, paperWidth - rect.width)),
    y: clamp(rect.y + deltaY, 0, Math.max(0, paperHeight - rect.height)),
  };
}

function resizeRect(rect: LayoutRect, deltaX: number, deltaY: number, paperWidth: number, paperHeight: number): LayoutRect {
  return {
    ...rect,
    width: clamp(rect.width + deltaX, minElementSize.width, paperWidth - rect.x),
    height: clamp(rect.height + deltaY, minElementSize.height, paperHeight - rect.y),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSelectionBounds(
  rects: Record<LayoutElementId, LayoutRect>,
  elementIds: LayoutElementId[],
  enabledElements: LayoutElementId[],
) {
  const selectionRects = elementIds
    .filter((id) => enabledElements.includes(id))
    .map((id) => rects[id])
    .filter((rect): rect is LayoutRect => Boolean(rect));

  if (selectionRects.length === 0) {
    return null;
  }

  const minX = Math.min(...selectionRects.map((rect) => rect.x));
  const minY = Math.min(...selectionRects.map((rect) => rect.y));
  const maxX = Math.max(...selectionRects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...selectionRects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function formatMm(value: number) {
  return `${value.toFixed(1)} mm`;
}

function elementLabel(elementId: LayoutElementId) {
  if (elementId === 'title') {
    return '标题';
  }

  if (elementId === 'north-arrow') {
    return '指北针';
  }

  if (elementId === 'scale-bar') {
    return '比例尺';
  }

  return '地图框';
}

function LayoutSelectionOverlay({
  draft,
  pageHeightPx,
  pageWidthPx,
  zoomScale,
}: {
  draft: LayoutSelectionDraft;
  pageHeightPx: number;
  pageWidthPx: number;
  zoomScale: number;
}) {
  const className = `layout-selection-overlay is-${draft.mode}`;

  if (draft.mode === 'rectangle') {
    const rect = normalizeMmRect(draft.start, draft.current);

    return (
      <svg className={className} viewBox={`0 0 ${pageWidthPx} ${pageHeightPx}`} aria-hidden="true">
        <rect
          x={rect.x * zoomScale}
          y={rect.y * zoomScale}
          width={rect.width * zoomScale}
          height={rect.height * zoomScale}
        />
      </svg>
    );
  }

  const previewPoints = draft.current ? [...draft.points, draft.current] : draft.points;
  const points = previewPoints.map(([x, y]) => `${x * zoomScale},${y * zoomScale}`).join(' ');

  return (
    <svg className={className} viewBox={`0 0 ${pageWidthPx} ${pageHeightPx}`} aria-hidden="true">
      {draft.points.length === 1 ? (
        <circle
          cx={draft.points[0][0] * zoomScale}
          cy={draft.points[0][1] * zoomScale}
          r={3.5}
        />
      ) : null}
      {previewPoints.length >= 3 ? <polygon points={points} /> : <polyline points={points} />}
    </svg>
  );
}

function pagePointFromClient(
  clientX: number,
  clientY: number,
  pageElement: HTMLDivElement,
  zoomScale: number,
): [number, number] | null {
  const bounds = pageElement.getBoundingClientRect();
  const x = (clientX - bounds.left) / zoomScale;
  const y = (clientY - bounds.top) / zoomScale;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return [x, y];
}

function normalizeMmRect(start: [number, number], current: [number, number]): LayoutRect {
  const x = Math.min(start[0], current[0]);
  const y = Math.min(start[1], current[1]);
  const width = Math.abs(current[0] - start[0]);
  const height = Math.abs(current[1] - start[1]);

  return { x, y, width, height };
}

function dedupeAdjacentPoints(points: [number, number][]) {
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }

    const previous = points[index - 1];
    return distanceMm(previous, point) >= 0.5;
  });
}

function selectElementsByRect(
  rects: Record<LayoutElementId, LayoutRect>,
  elementIds: LayoutElementId[],
  selectionRect: LayoutRect,
) {
  return elementIds.filter((elementId) => rectIntersectsRect(rects[elementId], selectionRect));
}

function selectElementsByPolygon(
  rects: Record<LayoutElementId, LayoutRect>,
  elementIds: LayoutElementId[],
  polygon: [number, number][],
) {
  return elementIds.filter((elementId) => rectIntersectsPolygon(rects[elementId], polygon));
}

function rectIntersectsRect(a: LayoutRect, b: LayoutRect) {
  return a.x <= b.x + b.width
    && a.x + a.width >= b.x
    && a.y <= b.y + b.height
    && a.y + a.height >= b.y;
}

function rectIntersectsPolygon(rect: LayoutRect, polygon: [number, number][]) {
  if (polygon.length < 3) {
    return false;
  }

  const corners: [number, number][] = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];

  if (corners.some((point) => pointInPolygon(point, polygon))) {
    return true;
  }

  if (polygon.some((point) => pointInRect(point, rect))) {
    return true;
  }

  const rectEdges: [[number, number], [number, number]][] = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];

    if (rectEdges.some(([rectStart, rectEnd]) => segmentsIntersect(start, end, rectStart, rectEnd))) {
      return true;
    }
  }

  return false;
}

function pointInRect(point: [number, number], rect: LayoutRect) {
  return point[0] >= rect.x
    && point[0] <= rect.x + rect.width
    && point[1] >= rect.y
    && point[1] <= rect.y + rect.height;
}

function pointInPolygon(point: [number, number], polygon: [number, number][]) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1])
      && point[0] <= ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) / (previousPoint[1] - currentPoint[1]) + currentPoint[0];

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function segmentsIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
) {
  const orientation = (p: [number, number], q: [number, number], r: [number, number]) => {
    const value = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);

    if (Math.abs(value) < 1e-9) {
      return 0;
    }

    return value > 0 ? 1 : 2;
  };
  const onSegment = (p: [number, number], q: [number, number], r: [number, number]) => (
    q[0] <= Math.max(p[0], r[0])
    && q[0] >= Math.min(p[0], r[0])
    && q[1] <= Math.max(p[1], r[1])
    && q[1] >= Math.min(p[1], r[1])
  );

  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;

  return false;
}

function distanceMm(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
