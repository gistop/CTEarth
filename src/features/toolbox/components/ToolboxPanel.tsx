import { ChevronDown, FolderCog, Search, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  collectToolboxNodeIds,
  collectToolboxParentIds,
  filterToolboxNodes,
  normalizeToolboxQuery,
  validateToolboxCatalog,
} from '../services/toolboxService';
import type { ToolboxCatalog, ToolboxNode } from '../types';

type ToolboxView = 'tree' | 'detail';

export function ToolboxPanel({ catalog }: { catalog: ToolboxCatalog }) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ToolboxView>('tree');
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const registry = useMemo(() => validateToolboxCatalog(catalog), [catalog]);
  const normalizedQuery = normalizeToolboxQuery(query);
  const visibleNodes = useMemo(
    () => filterToolboxNodes(catalog.nodes, normalizedQuery),
    [catalog.nodes, normalizedQuery],
  );
  const visibleIds = useMemo(() => new Set(collectToolboxNodeIds(visibleNodes)), [visibleNodes]);
  const expandedIds = useMemo(() => {
    if (!normalizedQuery) {
      return expandedNodeIds;
    }

    return new Set([...expandedNodeIds, ...collectToolboxParentIds(visibleNodes)]);
  }, [expandedNodeIds, normalizedQuery, visibleNodes]);
  const activeTool = activeToolId ? registry.get(activeToolId) : undefined;

  if (view === 'detail' && activeTool) {
    return activeTool.render({
      onBack: () => {
        setView('tree');
        setActiveToolId(null);
      },
    });
  }

  const openTool = (toolId: string) => {
    if (!registry.has(toolId)) {
      return;
    }

    setActiveToolId(toolId);
    setView('detail');
  };
  const toggleNode = (nodeId: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  };

  return (
    <section className="toolbox-panel">
      <div className="panel-search">
        <Search size={15} />
        <input
          placeholder="搜索工具"
          aria-label="搜索工具箱"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="tool-tree" role="tree" aria-label="工具箱目录">
        {visibleNodes.map((node) => (
          <ToolboxTreeNode
            key={node.id}
            depth={0}
            expandedIds={expandedIds}
            node={node}
            query={normalizedQuery}
            visibleIds={visibleIds}
            onOpenTool={openTool}
            onToggle={toggleNode}
          />
        ))}
      </div>
      {normalizedQuery && visibleNodes.length === 0 && (
        <p className="tool-empty">没有找到匹配工具。</p>
      )}
    </section>
  );
}

function ToolboxTreeNode({
  node,
  depth,
  expandedIds,
  query,
  visibleIds,
  onOpenTool,
  onToggle,
}: {
  node: ToolboxNode;
  depth: number;
  expandedIds: Set<string>;
  query: string;
  visibleIds: Set<string>;
  onOpenTool: (toolId: string) => void;
  onToggle: (nodeId: string) => void;
}) {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expandedIds.has(node.id);
  const isMatched = query.length > 0 && node.label.toLocaleLowerCase().includes(query);
  const handleOpen = node.toolId ? () => onOpenTool(node.toolId as string) : undefined;

  return (
    <>
      <ToolboxTreeRow
        depth={depth}
        label={node.label}
        leaf={!hasChildren}
        open={isExpanded}
        matched={isMatched}
        onOpen={handleOpen}
        onToggle={hasChildren ? () => onToggle(node.id) : undefined}
      />
      {hasChildren && isExpanded && node.children?.filter((child) => visibleIds.has(child.id)).map((child) => (
        <ToolboxTreeNode
          key={child.id}
          depth={depth + 1}
          expandedIds={expandedIds}
          node={child}
          query={query}
          visibleIds={visibleIds}
          onOpenTool={onOpenTool}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

function ToolboxTreeRow({
  depth,
  label,
  open = false,
  leaf = false,
  matched = false,
  onOpen,
  onToggle,
}: {
  depth: number;
  label: string;
  open?: boolean;
  leaf?: boolean;
  matched?: boolean;
  onOpen?: () => void;
  onToggle?: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' && onToggle && !open) {
      event.preventDefault();
      onToggle();
      return;
    }

    if (event.key === 'ArrowLeft' && onToggle && open) {
      event.preventDefault();
      onToggle();
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && onToggle) {
      event.preventDefault();
      onToggle();
      return;
    }

    if (!onOpen || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    onOpen();
  };

  return (
    <button
      className={`tool-tree-row${matched ? ' matched' : ''}`}
      style={{ '--tree-depth': depth } as React.CSSProperties}
      type="button"
      role="treeitem"
      aria-expanded={leaf ? undefined : open}
      aria-level={depth + 1}
      onDoubleClick={onOpen}
      onKeyDown={handleKeyDown}
      onClick={onToggle ?? onOpen}
    >
      <ChevronDown className={`${leaf ? 'is-hidden' : ''}${!open ? ' is-collapsed' : ''}`} size={14} />
      {leaf ? <Wrench size={16} /> : <FolderCog size={16} />}
      <span>{label}</span>
    </button>
  );
}
