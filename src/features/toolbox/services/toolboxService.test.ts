import { describe, expect, it } from 'vitest';
import type { ToolboxCatalog, ToolboxNode } from '../types';
import {
  collectToolboxParentIds,
  filterToolboxNodes,
  normalizeToolboxQuery,
  validateToolboxCatalog,
} from './toolboxService';

const nodes: ToolboxNode[] = [{
  id: 'general',
  label: '通用',
  children: [{
    id: 'terrain',
    label: '地形',
    children: [
      { id: 'terrain-slope', label: '坡度', toolId: 'slope' },
      { id: 'terrain-aspect', label: '坡向', toolId: 'aspect' },
    ],
  }],
}];

describe('toolboxService', () => {
  it('normalizes surrounding whitespace and case', () => {
    expect(normalizeToolboxQuery('  SLOPE  ')).toBe('slope');
  });

  it('keeps the ancestor path for a matching tool', () => {
    expect(filterToolboxNodes(nodes, '坡度')).toEqual([{
      id: 'general',
      label: '通用',
      children: [{
        id: 'terrain',
        label: '地形',
        children: [{ id: 'terrain-slope', label: '坡度', toolId: 'slope', children: [] }],
      }],
    }]);
  });

  it('collects expandable ancestors from filtered nodes', () => {
    expect(collectToolboxParentIds(filterToolboxNodes(nodes, '坡向'))).toEqual(['general', 'terrain']);
  });

  it('rejects nodes that reference unregistered tools', () => {
    const catalog: ToolboxCatalog = { nodes, tools: [] };
    expect(() => validateToolboxCatalog(catalog)).toThrow('未注册工具');
  });

  it('rejects duplicate tool registrations', () => {
    const catalog: ToolboxCatalog = {
      nodes: [],
      tools: [
        { id: 'slope', title: '坡度', render: () => null },
        { id: 'slope', title: '重复坡度', render: () => null },
      ],
    };

    expect(() => validateToolboxCatalog(catalog)).toThrow('重复工具 ID');
  });
});
