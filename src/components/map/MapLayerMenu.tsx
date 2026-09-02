import { useEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import { type BasemapId, useMapCommands } from './MapCommandContext';
import { cesiumImageryGroups, cesiumTerrainOptions } from './cesiumLayerOptions';

const basemapOptions: { id: BasemapId; label: string }[] = [
  { id: 'osm', label: 'OpenStreetMap' },
  { id: 'tianditu', label: '天地图 WMTS' },
  { id: 'esri', label: 'Esri World Imagery' },
];

export function MapLayerMenu() {
  const { mapCommandState, setBasemap, setCesiumImagery, setCesiumTerrain } = useMapCommands();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setMenuMaxHeight(null);
      return;
    }

    const updateMenuHeight = () => {
      const menu = menuRef.current;
      const mapPanel = document.querySelector('.map-panel') as HTMLElement | null;

      if (!menu || !mapPanel) {
        return;
      }

      const availableHeight = Math.floor(mapPanel.getBoundingClientRect().height - 12);
      setMenuMaxHeight(Math.max(availableHeight, 180));
    };

    const animationFrame = window.requestAnimationFrame(updateMenuHeight);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && wrapperRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', updateMenuHeight);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('resize', updateMenuHeight);
    };
  }, [isOpen]);

  return (
    <div className="map-layer-menu-wrapper" ref={wrapperRef}>
      <button
        className={isOpen ? 'is-active' : undefined}
        type="button"
        title="图层"
        aria-label="图层"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((value) => !value);
        }}
      >
        <Layers size={15} strokeWidth={1.8} />
      </button>
      {isOpen ? (
        <div ref={menuRef} className="map-layer-menu" role="menu" aria-label="图层" style={menuMaxHeight ? { maxHeight: `${menuMaxHeight}px` } : undefined}>
          <div className="map-layer-menu-section">
            <div className="map-layer-menu-section-title">Planar</div>
            {basemapOptions.map((option) => (
              <button
                key={option.id}
                className={option.id === mapCommandState.basemap ? 'is-selected' : undefined}
                type="button"
                role="menuitemradio"
                aria-checked={option.id === mapCommandState.basemap}
                title={option.label}
                onClick={(event) => {
                  event.stopPropagation();
                  setBasemap(option.id);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="map-layer-menu-divider" />

          <div className="map-layer-menu-section">
            <div className="map-layer-menu-section-title">Imagery</div>
            {cesiumImageryGroups.map((group) => (
              <div key={group.title} className="map-layer-menu-subsection">
                <div className="map-layer-menu-subsection-title">{group.title}</div>
                {group.options.map((option) => (
                  <button
                    key={option.id}
                    className={option.id === mapCommandState.cesiumImagery ? 'is-selected' : undefined}
                    type="button"
                    role="menuitemradio"
                    aria-checked={option.id === mapCommandState.cesiumImagery}
                    title={option.label}
                    onClick={(event) => {
                      event.stopPropagation();
                      setCesiumImagery(option.id);
                      setIsOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="map-layer-menu-divider" />

          <div className="map-layer-menu-section">
            <div className="map-layer-menu-section-title">Terrain</div>
            <div className="map-layer-menu-subsection">
              <div className="map-layer-menu-subsection-title">Cesium ion</div>
              {cesiumTerrainOptions.map((option) => (
                <button
                  key={option.id}
                  className={option.id === mapCommandState.cesiumTerrain ? 'is-selected' : undefined}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.id === mapCommandState.cesiumTerrain}
                  title={option.label}
                  onClick={(event) => {
                    event.stopPropagation();
                    setCesiumTerrain(option.id);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
