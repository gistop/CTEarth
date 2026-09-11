import { Ruler } from 'lucide-react';
import { useMapCommands } from './MapCommandContext';
import { useMapMeasure } from './MapMeasureContext';

export function MapMeasureButton() {
  const { hasMapCommands, mapCommandState } = useMapCommands();
  const { isMeasureOpen, toggleMeasure } = useMapMeasure();
  const isDisabled = !hasMapCommands || mapCommandState.displayCrs !== 'webMercator';

  return (
    <button
      className={isMeasureOpen ? 'is-active' : undefined}
      type="button"
      title="测量"
      aria-label="测量"
      aria-expanded={isMeasureOpen}
      aria-pressed={isMeasureOpen}
      disabled={isDisabled}
      onClick={(event) => {
        event.stopPropagation();
        toggleMeasure();
      }}
    >
      <Ruler size={15} strokeWidth={1.8} />
    </button>
  );
}
