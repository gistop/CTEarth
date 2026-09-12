import type { ToolboxNode } from '../../../types';

export const extractionToolGroup: ToolboxNode = {
  id: 'general-extraction',
  label: '提取',
  children: [{ id: 'general-extraction-mask', label: '按掩膜提取', toolId: 'extractByMask' }],
};
