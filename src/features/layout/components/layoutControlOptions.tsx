import type { ReactNode } from 'react';
import { AlignCenterHorizontal, AlignCenterVertical, AlignLeft, AlignEndVertical, AlignRight, AlignStartVertical, FileImage, FileText, Hexagon, MousePointer2, SquareDashedMousePointer, RectangleHorizontal, Ruler as RulerIcon } from 'lucide-react';
import type { LayoutAlignMode, LayoutSelectMode, LayoutExportFormat, LayoutElementId } from '../types';

export const layoutAlignModes: {
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

export const layoutSelectModes: {
  id: LayoutSelectMode;
  label: string;
  renderIcon: () => ReactNode;
}[] = [
  { id: 'single', label: '单选', renderIcon: () => <MousePointer2 size={18} strokeWidth={1.8} /> },
  { id: 'rectangle', label: '矩形', renderIcon: () => <SquareDashedMousePointer size={18} strokeWidth={1.8} /> },
  { id: 'polygon', label: '多边形', renderIcon: () => <Hexagon size={18} strokeWidth={1.8} /> },
];

export const layoutExportFormats: {
  id: LayoutExportFormat;
  label: string;
  renderIcon: () => ReactNode;
}[] = [
  { id: 'pdf', label: 'PDF', renderIcon: () => <FileText size={18} strokeWidth={1.8} /> },
  { id: 'png', label: 'PNG', renderIcon: () => <FileImage size={18} strokeWidth={1.8} /> },
];

export const layoutElementControls: {
  id: LayoutElementId;
  label: string;
  renderIcon: () => ReactNode;
}[] = [
  { id: 'map-frame', label: '地图框', renderIcon: () => <RectangleHorizontal size={23} strokeWidth={1.6} /> },
  { id: 'title', label: '标题', renderIcon: () => <strong className="ribbon-letter-icon">T</strong> },
  { id: 'north-arrow', label: '指北针', renderIcon: () => <strong className="ribbon-letter-icon">N</strong> },
  { id: 'scale-bar', label: '比例尺', renderIcon: () => <RulerIcon size={23} strokeWidth={1.6} /> },
];
