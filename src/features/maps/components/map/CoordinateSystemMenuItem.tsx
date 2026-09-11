import { Check, ChevronRight } from 'lucide-react';
import type { CoordinateSystemGroup, CoordinateSystemLeaf, CoordinateSystemNode } from './coordinateSystems';
import type { DisplayCrsId } from './MapCommandContext';

type CoordinateSystemMenuItemProps = {
  activePath: string[];
  columnIndex: number;
  currentCrsId: DisplayCrsId;
  highlightedCrsId: DisplayCrsId | null;
  node: CoordinateSystemNode;
  onActivateGroup: (groupId: string) => void;
  onSelectCrs: (crs: CoordinateSystemLeaf) => void;
  pendingCrsId: DisplayCrsId;
};

export function CoordinateSystemMenuItem({
  activePath,
  columnIndex,
  currentCrsId,
  highlightedCrsId,
  node,
  onActivateGroup,
  onSelectCrs,
  pendingCrsId,
}: CoordinateSystemMenuItemProps) {
  if (node.kind === 'group') {
    return renderGroupItem(node, activePath, columnIndex, onActivateGroup);
  }

  const isSelected = node.id === pendingCrsId;
  const isCurrent = node.id === currentCrsId;
  const isHighlighted = node.id === highlightedCrsId;
  const isMarked = isSelected || isCurrent;

  return (
    <button
      className={[
        'ribbon-crs-menu-item',
        isCurrent ? 'is-current' : '',
        isSelected ? 'is-selected' : '',
        isHighlighted ? 'is-highlighted' : '',
      ].filter(Boolean).join(' ')}
      type="button"
      role="menuitemradio"
      aria-checked={isSelected}
      aria-current={isCurrent ? 'true' : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelectCrs(node)}
    >
      <Check className="ribbon-crs-check-icon" size={13} strokeWidth={2} aria-hidden={!isMarked} />
      <span>{formatCrsLabel(node)}</span>
    </button>
  );
}

function renderGroupItem(
  node: CoordinateSystemGroup,
  activePath: string[],
  columnIndex: number,
  onActivateGroup: (groupId: string) => void,
) {
  const isActive = activePath[columnIndex] === node.id;

  return (
    <button
      className={`ribbon-crs-menu-item is-group${isActive ? ' is-active' : ''}`}
      type="button"
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => onActivateGroup(node.id)}
      onFocus={() => onActivateGroup(node.id)}
    >
      <span>{node.label}</span>
      <ChevronRight className="ribbon-crs-submenu-icon" size={13} strokeWidth={1.8} />
    </button>
  );
}

function formatCrsLabel(crs: CoordinateSystemLeaf) {
  return `${crs.code} (${crs.name})`;
}
