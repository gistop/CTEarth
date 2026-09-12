import type { ReactNode } from 'react';

export type ToolboxNode = {
  id: string;
  label: string;
  children?: readonly ToolboxNode[];
  toolId?: string;
};

export type ToolboxToolRenderProps = {
  onBack: () => void;
};

export type ToolboxToolDefinition = {
  id: string;
  title: string;
  render: (props: ToolboxToolRenderProps) => ReactNode;
};

export type ToolboxCatalog = {
  nodes: readonly ToolboxNode[];
  tools: readonly ToolboxToolDefinition[];
};

export type ToolDetailTabId = 'parameters' | 'environment';
