import { Sun } from 'lucide-react';
import { useMapCommands } from './MapCommandContext';
import { useMapSunlight } from './MapSunlightContext';

export function MapSunlightButton() {
  const { hasMapCommands, mapCommandState } = useMapCommands();
  const { isSunlightOpen, toggleSunlight } = useMapSunlight();
  const isGlobe = mapCommandState.mapMode === 'globe';

  if (!isGlobe) {
    return null;
  }

  return (
    <button
      className={isSunlightOpen ? 'is-active' : undefined}
      type="button"
      title="太阳光照与时间"
      aria-label="太阳光照与时间"
      aria-expanded={isSunlightOpen}
      aria-pressed={isSunlightOpen}
      disabled={!hasMapCommands}
      onClick={(event) => {
        event.stopPropagation();
        toggleSunlight();
      }}
    >
      <Sun size={15} strokeWidth={1.8} />
    </button>
  );
}
