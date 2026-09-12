import type { ToolboxNode } from '../../../types';

export const proximityToolGroup: ToolboxNode = {
  id: 'general-proximity',
  label: '邻近',
  children: [{ id: 'general-proximity-buffer', label: '缓冲区', toolId: 'buffer' }],
};
