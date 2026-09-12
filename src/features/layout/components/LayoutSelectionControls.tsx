import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLayout } from '../stores/LayoutContext';
import { MousePointer2 } from 'lucide-react';
import { layoutSelectModes } from './layoutControlOptions';
import type { LayoutSelectMode } from '../types';

export function LayoutSelectButton() {
  const { setSelectMode, setTool, tool } = useLayout();

  return (
    <button
      className={tool === 'select' ? 'is-selected' : undefined}
      type="button"
      title="选择"
      aria-label="选择"
      aria-pressed={tool === 'select'}
      onClick={() => {
        setTool('select');
        setSelectMode('single');
      }}
    >
      <MousePointer2 size={16} />
    </button>
  );
}

export function LayoutSelectionSplitButton() {
  const { selectMode, setSelectMode, setTool, tool } = useLayout();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentMode = layoutSelectModes.find((mode) => mode.id === selectMode) ?? layoutSelectModes[0];

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

  const activateMode = useCallback((mode: LayoutSelectMode) => {
    setTool('select');
    setSelectMode(mode);
    setIsOpen(false);
  }, [setSelectMode, setTool]);

  return (
    <div ref={rootRef} className={`ribbon-select-split${tool === 'select' ? ' is-selected' : ''}`}>
      <button
        type="button"
        className="ribbon-select-main"
        title={currentMode.label}
        aria-label={currentMode.label}
        onClick={() => activateMode(selectMode)}
      >
        {currentMode.renderIcon()}
        <span>{currentMode.label}</span>
      </button>
      <button
        type="button"
        className={`ribbon-select-toggle${isOpen ? ' is-open' : ''}`}
        title="展开其他选择方式"
        aria-label="展开其他选择方式"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {isOpen ? (
        <div className="ribbon-select-menu" role="menu" aria-label="选择方式">
          {layoutSelectModes.map((mode) => (
            <button
              key={mode.id}
              className={mode.id === selectMode ? 'is-selected' : undefined}
              type="button"
              role="menuitemradio"
              aria-checked={mode.id === selectMode}
              onClick={() => activateMode(mode.id)}
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
