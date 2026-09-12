import type { ToolboxNode } from '../../../types';

export const overlayToolGroup: ToolboxNode = {
  id: 'general-overlay',
  label: '叠加',
  children: [
    { id: 'general-overlay-intersect', label: '相交', toolId: 'intersect' },
    { id: 'general-overlay-union', label: '联合', toolId: 'union' },
    { id: 'general-overlay-erase', label: '擦除', toolId: 'erase' },
  ],
};
