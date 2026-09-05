import { useEffect, useRef, type DragEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Settings, Square, SquareCheckBig } from 'lucide-react';
import type { LayerOrderId } from '../../gisStore';
import type { BasemapId } from '../map/basemapOptions';

export type MapGroupLayerItemId = Exclude<LayerOrderId, 'raster'>;

export type MapGroupLayerItem = {
  instanceId: string;
  layerId: MapGroupLayerItemId;
  visible: boolean;
  basemapId?: BasemapId;
  opacity?: number;
};

export type MapGroup = {
  id: string;
  name: string;
  displayVisible?: boolean;
  layerItems: MapGroupLayerItem[];
};

type MapGroupSectionProps = {
  allVisible: boolean;
  children: ReactNode;
  panel?: ReactNode;
  group: MapGroup;
  isExpanded: boolean;
  isDropTarget?: boolean;
  dropPosition?: 'before' | 'after';
  isDragging?: boolean;
  isCurrent: boolean;
  isEditOpen?: boolean;
  nameNode: ReactNode;
  someVisible: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnter?: () => void;
  onDrop?: () => void;
  onEdit?: () => void;
  onDisplayVisibilityChange: (visible: boolean) => void;
  onSetCurrent: () => void;
  onToggleExpanded: () => void;
  onVisibilityChange: (visible: boolean) => void;
};

export function MapGroupSection({
  allVisible,
  children,
  panel,
  group,
  isExpanded,
  isDropTarget,
  dropPosition,
  isDragging,
  isCurrent,
  isEditOpen,
  nameNode,
  someVisible,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDrop,
  onEdit,
  onDisplayVisibilityChange,
  onSetCurrent,
  onToggleExpanded,
  onVisibilityChange,
}: MapGroupSectionProps) {
  const checkboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someVisible && !allVisible;
    }
  }, [allVisible, someVisible]);

  return (
    <section className={isCurrent ? 'map-group-section is-current' : 'map-group-section'}>
      <div
        className={[
          'tree-row',
          'root',
          'map-group-row',
          isDragging ? 'is-dragging' : '',
          isDropTarget ? (dropPosition === 'after' ? 'is-drop-target-after' : 'is-drop-target') : '',
        ].filter(Boolean).join(' ')}
        draggable={Boolean(onDragStart)}
        onDragStart={(event) => {
          if (!onDragStart) {
            event.preventDefault();
            return;
          }

          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', group.id);
          onDragStart();
        }}
        onDragEnd={() => {
          onDragEnd?.();
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          onDragEnter?.();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOver?.(event);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDrop?.();
        }}
      >
        <button
          className="map-group-expand-button"
          type="button"
          title={isExpanded ? '收起地图组' : '展开地图组'}
          aria-label={isExpanded ? `收起 ${group.name}` : `展开 ${group.name}`}
          aria-expanded={isExpanded}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded();
          }}
        >
          {isExpanded ? <ChevronDown size={15} strokeWidth={2.2} /> : <ChevronRight size={15} strokeWidth={2.2} />}
        </button>
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allVisible}
          aria-label={group.name}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onVisibilityChange(event.target.checked)}
        />
        <button
          className={isCurrent ? 'map-group-current-button is-current' : 'map-group-current-button'}
          type="button"
          title={isCurrent ? '当前地图' : '设为当前地图'}
          aria-label={isCurrent ? `${group.name} 是当前地图` : `设为当前地图：${group.name}`}
          aria-pressed={isCurrent}
          onClick={(event) => {
            event.stopPropagation();
            onSetCurrent();
          }}
        >
          {isCurrent ? <SquareCheckBig size={15} strokeWidth={2.4} /> : <Square size={15} strokeWidth={2} />}
        </button>
        {nameNode}
        <div className="tree-row-actions map-group-actions">
          <button
            className={(group.displayVisible ?? true) ? 'map-group-visibility-button is-visible' : 'map-group-visibility-button'}
            type="button"
            title={(group.displayVisible ?? true) ? `隐藏 ${group.name}` : `显示 ${group.name}`}
            aria-label={(group.displayVisible ?? true) ? `隐藏 ${group.name}` : `显示 ${group.name}`}
            aria-pressed={group.displayVisible ?? true}
            onClick={(event) => {
              event.stopPropagation();
              onDisplayVisibilityChange(!(group.displayVisible ?? true));
            }}
          >
            {(group.displayVisible ?? true) ? <Eye size={15} strokeWidth={1.9} /> : <EyeOff size={15} strokeWidth={1.9} />}
          </button>
          <button
            className={isEditOpen ? 'layer-style-toggle is-open' : 'layer-style-toggle'}
            type="button"
            title="编辑"
            aria-label={`编辑 ${group.name}`}
            aria-expanded={isEditOpen}
            onClick={(event) => {
              event.stopPropagation();
              onEdit?.();
            }}
          >
            <Settings size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      {panel}
      {isExpanded ? <div className="map-group-layers">{children}</div> : null}
    </section>
  );
}
