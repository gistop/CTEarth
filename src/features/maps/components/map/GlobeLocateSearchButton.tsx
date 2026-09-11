import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Search, X } from 'lucide-react';
import { useMapCommands } from './MapCommandContext';

export function GlobeLocateSearchButton() {
  const { hasMapCommands, locateByQuery, mapCommandState } = useMapCommands();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const isVisible = mapCommandState.mapMode === 'globe';
  const isDisabled = !hasMapCommands || !isVisible || isSearching;

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isVisible) {
      setIsOpen(false);
      setStatus('');
      setIsSearching(false);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && wrapperRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [isOpen]);

  async function handleSearch() {
    const trimmed = query.trim();

    if (!trimmed || isDisabled) {
      return;
    }

    setIsSearching(true);
    setStatus('');

    const success = await locateByQuery(trimmed);

    setIsSearching(false);

    if (success) {
      setIsOpen(false);
      setStatus('');
      return;
    }

    setStatus('No results');
  }

  if (!isVisible) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      className={`map-locate-search${isOpen ? ' is-open' : ''}`}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      {isOpen ? (
        <div className={`map-locate-panel${status ? ' is-error' : ''}`} role="dialog" aria-label="Search location" title={status || 'Search location'}>
          <input
            ref={inputRef}
            className="map-locate-input"
            type="text"
            value={query}
            placeholder="Enter place or coordinates"
            aria-label="Enter place or coordinates"
            onChange={(event) => {
              setQuery(event.target.value);
              setStatus('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSearch();
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                setIsOpen(false);
              }
            }}
          />
          <button
            className="map-locate-submit"
            type="button"
            title="Locate"
            aria-label="Locate"
            disabled={isDisabled || !query.trim()}
            onClick={(event) => {
              event.stopPropagation();
              void handleSearch();
            }}
          >
            <LocateFixed size={14} strokeWidth={1.8} />
          </button>
          <button
            className="map-locate-close"
            type="button"
            title="Close"
            aria-label="Close"
            onClick={(event) => {
              event.stopPropagation();
              setIsOpen(false);
            }}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      ) : null}

      <button
        className={`map-tooltip-trigger${isOpen ? ' is-active' : ''}`}
        type="button"
        title="Search location"
        aria-label="Search location"
        aria-expanded={isOpen}
        data-tooltip="Search location"
        disabled={isDisabled}
        onClick={(event) => {
          event.stopPropagation();
          setStatus('');
          setIsOpen((value) => !value);
        }}
      >
        <Search size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}
