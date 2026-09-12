import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLayout } from '../stores/LayoutContext';
import { layoutExportFormats } from './layoutControlOptions';
import { downloadBlob } from '../adapters/browserDownloadAdapter';
import type { LayoutExportFormat } from '../types';

export function LayoutExportSplitButton() {
  const { exportPaper, isExporting } = useLayout();
  const [format, setFormat] = useState<LayoutExportFormat>('pdf');
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentFormat = layoutExportFormats.find((item) => item.id === format) ?? layoutExportFormats[0];

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

  const executeExport = useCallback(async (nextFormat: LayoutExportFormat) => {
    setFormat(nextFormat);
    setIsOpen(false);
    try {
      const result = await exportPaper(nextFormat);
      downloadBlob(result.blob, result.fileName);
      if (result.warnings.length) window.alert(result.warnings.join('\n'));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : '导出失败。';
      window.alert(message);
    }
  }, [exportPaper]);

  return (
    <div ref={rootRef} className="ribbon-export-split">
      <button
        type="button"
        className="ribbon-export-main"
        disabled={isExporting}
        aria-busy={isExporting}
        title={`导出为 ${currentFormat.label}`}
        aria-label={`导出为 ${currentFormat.label}`}
        onClick={() => void executeExport(format)}
      >
        {currentFormat.renderIcon()}
        <span>导出</span>
      </button>
      <button
        type="button"
        disabled={isExporting}
        className={`ribbon-export-toggle${isOpen ? ' is-open' : ''}`}
        title="展开导出格式"
        aria-label="展开导出格式"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {isOpen ? (
        <div className="ribbon-export-menu" role="menu" aria-label="导出格式">
          {layoutExportFormats.map((item) => (
            <button
              key={item.id}
              className={item.id === format ? 'is-selected' : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={item.id === format}
              onClick={() => void executeExport(item.id)}
            >
              {item.renderIcon()}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
