import type { ToolboxNode } from '../../types';

export const industryToolset: ToolboxNode = {
  id: 'industry',
  label: '行业',
  children: [
    { id: 'industry-water', label: '水利' },
    { id: 'industry-forestry', label: '林业' },
    { id: 'industry-geology', label: '地质' },
  ],
};
