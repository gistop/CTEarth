import type { ToolboxNode } from '../../../types';

export const pixelToolboxGroup: ToolboxNode = {
  id: 'general-pixel',
  label: '像元分析',
  children: [
    { id: 'general-pixel-raster-calculator', label: '栅格计算', toolId: 'rasterCalculator' },
    { id: 'general-pixel-raster-reclassify', label: '重分类', toolId: 'rasterReclassify' },
    { id: 'general-pixel-raster-resample', label: '重采样', toolId: 'rasterResample' },
  ],
};
