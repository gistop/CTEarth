import type { LayoutElementId, LayoutRect, PaperPresetId } from './types';

export const rulerGutterPx = 30;

export const minElementSize = {
  width: 8,
  height: 6,
};

export const layoutPreviewCenter: [number, number] = [10.4515, 51.1657];

export const layoutPreviewZoom = 5.3;

export const paperPresets: Record<PaperPresetId, { label: string; widthMm: number; heightMm: number }> = {
  'a4-landscape': { label: 'A4 横向', widthMm: 297, heightMm: 210 },
  'a4-portrait': { label: 'A4 纵向', widthMm: 210, heightMm: 297 },
  'a3-landscape': { label: 'A3 横向', widthMm: 420, heightMm: 297 },
};

export const defaultRects: Record<LayoutElementId, LayoutRect> = {
  'map-frame': { x: 18, y: 28, width: 188, height: 126 },
  title: { x: 18, y: 10, width: 128, height: 12 },
  'north-arrow': { x: 218, y: 24, width: 18, height: 28 },
  'scale-bar': { x: 20, y: 166, width: 52, height: 14 },
};

Object.values(paperPresets).forEach(Object.freeze);
Object.freeze(paperPresets);
Object.values(defaultRects).forEach(Object.freeze);
Object.freeze(defaultRects);
Object.freeze(minElementSize);
Object.freeze(layoutPreviewCenter);
