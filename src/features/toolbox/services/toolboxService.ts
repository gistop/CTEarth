import type { ToolboxCatalog, ToolboxNode, ToolboxToolDefinition } from '../types';

export function normalizeToolboxQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

export function filterToolboxNodes(nodes: readonly ToolboxNode[], query: string): ToolboxNode[] {
  if (!query) {
    return [...nodes];
  }

  return nodes.flatMap((node) => {
    const children = node.children ? filterToolboxNodes(node.children, query) : [];
    const matched = node.label.toLocaleLowerCase().includes(query);

    if (!matched && children.length === 0) {
      return [];
    }

    return [{ ...node, children }];
  });
}

export function collectToolboxNodeIds(nodes: readonly ToolboxNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...collectToolboxNodeIds(node.children ?? [])]);
}

export function collectToolboxParentIds(nodes: readonly ToolboxNode[]): string[] {
  return nodes.flatMap((node) => (
    node.children?.length ? [node.id, ...collectToolboxParentIds(node.children)] : []
  ));
}

export function createToolboxRegistry(tools: readonly ToolboxToolDefinition[]) {
  const registry = new Map<string, ToolboxToolDefinition>();

  tools.forEach((tool) => {
    if (registry.has(tool.id)) {
      throw new Error(`工具箱中存在重复工具 ID：${tool.id}`);
    }

    registry.set(tool.id, tool);
  });

  return registry;
}

export function validateToolboxCatalog(catalog: ToolboxCatalog) {
  const registry = createToolboxRegistry(catalog.tools);
  const nodeIds = new Set<string>();

  function visit(nodes: readonly ToolboxNode[]) {
    nodes.forEach((node) => {
      if (nodeIds.has(node.id)) {
        throw new Error(`工具箱中存在重复节点 ID：${node.id}`);
      }

      nodeIds.add(node.id);

      if (node.toolId && !registry.has(node.toolId)) {
        throw new Error(`工具箱节点 ${node.id} 引用了未注册工具：${node.toolId}`);
      }

      visit(node.children ?? []);
    });
  }

  visit(catalog.nodes);
  return registry;
}
