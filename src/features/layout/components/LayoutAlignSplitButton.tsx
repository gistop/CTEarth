import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLayout } from '../stores/LayoutContext';
import { layoutAlignModes } from './layoutControlOptions';
import type { LayoutAlignMode } from '../types';

export function LayoutAlignSplitButton() {
  const { alignMode, alignSelectedElement, setAlignMode } = useLayout();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentMode = layoutAlignModes.find((mode) => mode.id === alignMode) ?? layoutAlignModes[0];

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

  const executeAlign = useCallback((mode: LayoutAlignMode) => {
    setAlignMode(mode);
    alignSelectedElement(mode);
    setIsOpen(false);
  }, [alignSelectedElement, setAlignMode]);

  return (
    <div ref={rootRef} className="ribbon-align-split">
      <button
        type="button"
        className="ribbon-align-main"
        title={currentMode.label}
        aria-label={currentMode.label}
        onClick={() => executeAlign(alignMode)}
      >
        {currentMode.renderIcon()}
        <span>{currentMode.label}</span>
      </button>
      <button
        type="button"
        className={`ribbon-align-toggle${isOpen ? ' is-open' : ''}`}
        title="展开其他对齐方式"
        aria-label="展开其他对齐方式"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {isOpen ? (
        <div className="ribbon-align-menu" role="menu" aria-label="对齐方式">
          {layoutAlignModes.map((mode) => (
            <button
              key={mode.id}
              className={mode.id === alignMode ? 'is-selected' : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={mode.id === alignMode}
              onClick={() => executeAlign(mode.id)}
            >
              {mode.renderIcon()}
              <span>{mode.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
