import { Minus, Move, Plus, RotateCcw } from 'lucide-react';
import { useLayout } from '../stores/LayoutContext';
import { LayoutSelectButton } from './LayoutSelectionControls';
import type { LayoutRect, LayoutTool } from '../types';

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

export function LayoutToolbar({
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

export function formatMm(value: number) {
  return `${value.toFixed(1)} mm`;
}
