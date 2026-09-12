import type { ToolboxNode, ToolboxToolDefinition } from '../../../types';
import { SelectionToolPanel } from './components/SelectionToolPanel';
import { selectionToolTitles } from './services/selectionToolService';
import type { SelectionToolId } from './types';

export const selectionToolboxGroup: ToolboxNode = {
  id: 'general-selection',
  label: '选择',
  children: [
    { id: 'general-selection-value', label: '按属性选择', toolId: 'selectByValue' },
    { id: 'general-selection-location', label: '按位置选择', toolId: 'selectByLocation' },
  ],
};

const toolIds: readonly SelectionToolId[] = ['selectByValue', 'selectByLocation'];

export const selectionToolDefinitions: readonly ToolboxToolDefinition[] = toolIds.map((tool) => ({
  id: tool,
  title: selectionToolTitles[tool],
  render: ({ onBack }) => <SelectionToolPanel tool={tool} onBack={onBack} />,
}));
