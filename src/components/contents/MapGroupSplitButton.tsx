import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Layers, MapPlus } from 'lucide-react';

export function MapGroupSplitButton({
  onCreateMapGroup,
  onAddBasemapToCurrentMapGroup,
}: {
  onCreateMapGroup: () => void | Promise<void>;
  onAddBasemapToCurrentMapGroup: () => void | Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const execute = async (action: 'create' | 'add-basemap') => {
    setIsOpen(false);

    try {
      if (action === 'create') {
        await onCreateMapGroup();
      } else {
        await onAddBasemapToCurrentMapGroup();
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div ref={rootRef} className="map-group-split">
      <button
        className="map-group-main"
        type="button"
        title="新建地图"
        aria-label="新建地图"
        onClick={() => {
          void execute('create');
        }}
      >
        <MapPlus size={16} />
        <span>新建地图</span>
      </button>
      <button
        className={isOpen ? 'map-group-toggle is-open' : 'map-group-toggle'}
        type="button"
        title="更多地图组操作"
        aria-label="更多地图组操作"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ChevronDown size={14} />
      </button>
      {isOpen ? (
        <div className="map-group-menu" role="menu" aria-label="地图组操作">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void execute('add-basemap');
            }}
          >
            <Layers size={14} />
            <span>给当前地图组添加底图</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
