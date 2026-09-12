import type { ToolboxNode } from '../../../types';

export const terrainToolGroup: ToolboxNode = {
  id: 'general-terrain',
  label: '地形',
  children: [
    { id: 'general-terrain-hillshade', label: '山体阴影', toolId: 'hillshade' },
    { id: 'general-terrain-slope', label: '坡度', toolId: 'slope' },
    { id: 'general-terrain-aspect', label: '坡向', toolId: 'aspect' },
  ],
};
