import { useLayout } from '../stores/LayoutContext';
import { RectangleHorizontal } from 'lucide-react';
import { paperPresets } from '../constants';
import type { PaperPresetId } from '../types';

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

export function LayoutPageSettings() {
  return (
    <div className="layout-page-settings">
      <LayoutPaperSelect />
    </div>
  );
}
