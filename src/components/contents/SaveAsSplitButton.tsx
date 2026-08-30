import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Database, Download, Save } from 'lucide-react';

export type VectorExportFormat = 'geojson' | 'geopackage';

export function SaveAsSplitButton({
  disabled,
  onExport,
}: {
  disabled?: boolean;
  onExport: (format: VectorExportFormat) => void | Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<VectorExportFormat>('geojson');

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

  const execute = async (nextFormat: VectorExportFormat) => {
    setFormat(nextFormat);
    setIsOpen(false);
    try {
      await onExport(nextFormat);
    } catch (error) {
      console.error(error);
    }
  };

  const currentLabel = format === 'geojson' ? 'GeoJSON' : 'GeoPackage';

  return (
    <div ref={rootRef} className="save-as-split">
      <button
        className="save-as-main"
        type="button"
        title={`另存为 ${currentLabel}`}
        aria-label={`另存为 ${currentLabel}`}
        disabled={disabled}
        onClick={() => {
          void execute(format);
        }}
      >
        <Download size={14} />
      </button>
      <button
        className={isOpen ? 'save-as-toggle is-open' : 'save-as-toggle'}
        type="button"
        title="选择另存格式"
        aria-label="选择另存格式"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ChevronDown size={12} />
      </button>
      {isOpen ? (
        <div className="save-as-menu" role="menu" aria-label="另存格式">
          <button
            className={format === 'geojson' ? 'is-selected' : undefined}
            type="button"
            role="menuitemradio"
            aria-checked={format === 'geojson'}
            onClick={() => {
              void execute('geojson');
            }}
          >
            <Save size={14} />
            <span>GeoJSON</span>
          </button>
          <button
            className={format === 'geopackage' ? 'is-selected' : undefined}
            type="button"
            role="menuitemradio"
            aria-checked={format === 'geopackage'}
            onClick={() => {
              void execute('geopackage');
            }}
          >
            <Database size={14} />
            <span>GeoPackage</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
