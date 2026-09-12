import type { ToolboxCatalog } from '../types';
import { generalToolDefinitions, generalToolset } from './general';
import { industryToolset } from './industry';

export const defaultToolboxCatalog = {
  nodes: [generalToolset, industryToolset],
  tools: generalToolDefinitions,
} satisfies ToolboxCatalog;
