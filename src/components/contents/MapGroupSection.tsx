import { useEffect, useRef, type ReactNode } from 'react';
import { Map as MapIcon, Square, SquareCheckBig } from 'lucide-react';
import type { LayerOrderId } from '../../gisStore';

export type MapGroupLayerItemId = Exclude<LayerOrderId, 'raster'>;

export type MapGroupLayerItem = {
  instanceId: string;
  layerId: MapGroupLayerItemId;
  visible: boolean;
};

export type MapGroup = {
  id: string;
  name: string;
  layerItems: MapGroupLayerItem[];
};

type MapGroupSectionProps = {
  allVisible: boolean;
  children: ReactNode;
  group: MapGroup;
  isDropTarget?: boolean;
  isCurrent: boolean;
  someVisible: boolean;
  onActivate: () => void;
  onDragEnter?: () => void;
  onDrop?: () => void;
  onVisibilityChange: (visible: boolean) => void;
};

export function MapGroupSection({
  allVisible,
  children,
  group,
  isDropTarget,
  isCurrent,
  someVisible,
  onActivate,
  onDragEnter,
  onDrop,
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
        className={isDropTarget ? 'tree-row root map-group-row is-drop-target' : 'tree-row root map-group-row'}
        role="button"
        tabIndex={0}
        onClick={onActivate}
        onDragEnter={(event) => {
          event.preventDefault();
          onDragEnter?.();
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onDrop?.();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onActivate();
          }
        }}
      >
        <span className="tree-drag-spacer" />
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allVisible}
          aria-label={group.name}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onVisibilityChange(event.target.checked)}
        />
        <MapIcon size={16} />
        <span>{group.name}</span>
        <button
          className={isCurrent ? 'map-group-current-button is-current' : 'map-group-current-button'}
          type="button"
          title={isCurrent ? '当前地图' : '设为当前地图'}
          aria-label={isCurrent ? `${group.name} 是当前地图` : `设为当前地图：${group.name}`}
          aria-pressed={isCurrent}
          onClick={(event) => {
            event.stopPropagation();
            onActivate();
          }}
        >
          {isCurrent ? <SquareCheckBig size={15} strokeWidth={2.4} /> : <Square size={15} strokeWidth={2} />}
        </button>
      </div>
      <div className="map-group-layers">{children}</div>
    </section>
  );
}
