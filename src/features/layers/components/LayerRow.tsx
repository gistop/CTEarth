import type { ReactNode } from 'react';
import { GripVertical, Settings } from 'lucide-react';
import type { LayerOrderId } from '../../../gisStore';

export type LayerRowProps = {
  badge: ReactNode;
  checked: boolean;
  dragState?: 'dragging' | 'target';
  isSelected?: boolean;
  isEditOpen?: boolean;
  label: string;
  nameNode: ReactNode;
  orderId: LayerOrderId;
  onChange: (checked: boolean) => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDragStart?: () => void;
  onDrop: () => void;
  onDoubleClick?: () => void;
  onEdit: () => void;
  onMoveDown?: () => void;
  onMoveUp?: () => void;
  onSelect?: () => void;
};

export function LayerRow({
  badge,
  checked,
  dragState,
  isSelected,
  isEditOpen,
  label,
  nameNode,
  orderId,
  onChange,
  onDragEnd,
  onDragEnter,
  onDragStart,
  onDrop,
  onDoubleClick,
  onEdit,
  onMoveDown,
  onMoveUp,
  onSelect,
}: LayerRowProps) {
  const className = [
    'tree-row',
    isSelected ? 'selected' : '',
    dragState === 'dragging' ? 'is-dragging' : '',
    dragState === 'target' ? 'is-drop-target' : '',
  ].filter(Boolean).join(' ');
  const isDraggable = Boolean(onDragStart);

  return (
    <div
      className={className}
      aria-keyshortcuts={onMoveUp || onMoveDown ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      aria-label={onSelect ? label : undefined}
      aria-selected={onSelect ? Boolean(isSelected) : undefined}
      onClick={onSelect}
      onDragEnd={onDragEnd}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onDoubleClick={onDoubleClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (event.altKey && event.key === 'ArrowUp' && onMoveUp) {
          event.preventDefault();
          onMoveUp();
          return;
        }

        if (event.altKey && event.key === 'ArrowDown' && onMoveDown) {
          event.preventDefault();
          onMoveDown();
          return;
        }

        if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onSelect();
        }
      }}
      role={onSelect ? 'treeitem' : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <span
        className="tree-drag-handle"
        draggable={isDraggable}
        title={isDraggable ? '拖动排序；也可在图层行上按 Alt+上下箭头' : undefined}
        aria-hidden="true"
        onDragStart={(event) => {
          if (!onDragStart) {
            event.preventDefault();
            return;
          }

          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', orderId);
          onDragStart();
        }}
      >
        <GripVertical size={15} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        aria-label={`${label} 图层`}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.checked)}
      />
      {badge}
      {nameNode}
      <div className="tree-row-actions">
        <div className="tree-row-action-spacer" aria-hidden="true" />
        <button
          className={isEditOpen ? 'layer-style-toggle is-open' : 'layer-style-toggle'}
          type="button"
          title="编辑"
          aria-label={`编辑 ${label}`}
          aria-expanded={isEditOpen}
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Settings size={15} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
