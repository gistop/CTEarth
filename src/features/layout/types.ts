export type PaperPresetId = 'a4-landscape' | 'a4-portrait' | 'a3-landscape';

export type LayoutElementId = 'map-frame' | 'title' | 'north-arrow' | 'scale-bar';

export type LayoutTool = 'select' | 'pan';

export type LayoutExportFormat = 'pdf' | 'png';

export type LayoutSelectMode = 'single' | 'rectangle' | 'polygon';

export type LayoutAlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export type LayoutOrderDirection = 'up' | 'down';

export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutPaper = { label: string; widthMm: number; heightMm: number };
export type LayoutPoint = [number, number];
export type LayoutMapView = { center3857: LayoutPoint; resolutionPerMm: number; rotation: number };
export type LayoutMapSnapshot = { canvas: HTMLCanvasElement; rotation: number; groundMetersPerMm: number };

export type LayoutState = {
  paperId: PaperPresetId;
  zoom: number;
  tool: LayoutTool;
  selectMode: LayoutSelectMode;
  alignMode: LayoutAlignMode;
  rects: Record<LayoutElementId, LayoutRect>;
  enabledElements: LayoutElementId[];
  selectedElementIds: LayoutElementId[];
  mapGraticuleVisible: boolean;
  mapView: LayoutMapView | null;
};

export type LayoutCommand =
  | { type: 'set-paper'; paperId: PaperPresetId }
  | { type: 'set-zoom'; zoom: number }
  | { type: 'set-tool'; tool: LayoutTool }
  | { type: 'set-select-mode'; mode: LayoutSelectMode }
  | { type: 'set-align-mode'; mode: LayoutAlignMode }
  | { type: 'set-selection'; elementIds: LayoutElementId[] }
  | { type: 'toggle-element'; elementId: LayoutElementId }
  | { type: 'update-rects'; rects: Partial<Record<LayoutElementId, LayoutRect>> }
  | { type: 'move-elements'; elementIds: LayoutElementId[]; deltaX: number; deltaY: number }
  | { type: 'resize-element'; elementId: LayoutElementId; deltaX: number; deltaY: number }
  | { type: 'align-selection'; mode: LayoutAlignMode }
  | { type: 'reorder-selection'; direction: LayoutOrderDirection }
  | { type: 'set-graticule'; visible: boolean }
  | { type: 'set-map-view'; view: LayoutMapView }
  | { type: 'reset' };

export type LayoutExportResult = { blob: Blob; fileName: string; warnings: string[] };
export type LayoutExportRequest = { format?: LayoutExportFormat; signal?: AbortSignal };

export type LayoutSelectionDraft =
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
