import type { ToolboxNode, ToolboxToolDefinition } from '../../types';
import { AnalysisToolPanel } from './components/AnalysisToolPanel';
import { extractionToolGroup } from './extraction';
import { interpolationToolGroup } from './interpolation';
import { overlayToolGroup } from './overlay';
import { pixelToolboxGroup } from './pixel';
import { proximityToolGroup } from './proximity';
import { analysisToolTitles } from './services/analysisToolService';
import { selectionToolDefinitions, selectionToolboxGroup } from './selection';
import { terrainToolGroup } from './terrain';
import type { AnalysisToolId } from './types';

export const generalToolset: ToolboxNode = {
  id: 'general',
  label: '通用',
  children: [
    interpolationToolGroup,
    proximityToolGroup,
    overlayToolGroup,
    extractionToolGroup,
    terrainToolGroup,
    selectionToolboxGroup,
    pixelToolboxGroup,
  ],
};

const analysisToolIds: readonly AnalysisToolId[] = [
  'idw',
  'buffer',
  'intersect',
  'union',
  'erase',
  'extractByMask',
  'hillshade',
  'slope',
  'aspect',
  'rasterCalculator',
  'rasterReclassify',
  'rasterResample',
];

const analysisToolDefinitions: readonly ToolboxToolDefinition[] = analysisToolIds.map((tool) => ({
  id: tool,
  title: analysisToolTitles[tool],
  render: ({ onBack }) => <AnalysisToolPanel tool={tool} onBack={onBack} />,
}));

export const generalToolDefinitions: readonly ToolboxToolDefinition[] = [
  ...analysisToolDefinitions,
  ...selectionToolDefinitions,
];
