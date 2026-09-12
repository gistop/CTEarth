import type { ToolboxNode } from '../../../types';

export const interpolationToolGroup: ToolboxNode = {
  id: 'general-interpolation',
  label: '插值',
  children: [{ id: 'general-interpolation-idw', label: '反距离加权', toolId: 'idw' }],
};
