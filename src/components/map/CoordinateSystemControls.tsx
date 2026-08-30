import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { type DisplayCrsId, useMapCommands } from './MapCommandContext';
import {
  type CoordinateSystemLeaf,
  defaultCoordinateSystemPath,
  findMatchingCrs,
  formatCrsLabel,
  getCrsById,
  getMenuColumns,
  getPathForCrs,
} from './coordinateSystems';

type CoordinateSystemControlsProps = {
  activateMapPanel: () => void;
  activateProjectionMapPanel: () => void;
};

export function CoordinateSystemControls({
  activateMapPanel,
  activateProjectionMapPanel,
}: CoordinateSystemControlsProps) {
  const { hasMapCommands, mapCommandState, setDisplayCrs } = useMapCommands();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingCrsId, setPendingCrsId] = useState<DisplayCrsId>(mapCommandState.displayCrs);
  const [activePath, setActivePath] = useState<string[]>(defaultCoordinateSystemPath);
  const [highlightedCrsId, setHighlightedCrsId] = useState<DisplayCrsId | null>(null);

  const selectedCrs = useMemo(() => getCrsById(pendingCrsId), [pendingCrsId]);
  const isDisabled = !hasMapCommands || mapCommandState.mapMode === 'globe';
  const hasPendingChange = pendingCrsId !== mapCommandState.displayCrs;
  const menuColumns = getMenuColumns(activePath);

  useEffect(() => {
    setPendingCrsId(mapCommandState.displayCrs);
    setActivePath(getPathForCrs(mapCommandState.displayCrs) ?? defaultCoordinateSystemPath);
  }, [mapCommandState.displayCrs]);

  function applyCoordinateSystem() {
    if (isDisabled) {
      return;
    }

    setDisplayCrs(pendingCrsId);

    if (pendingCrsId === 'webMercator') {
      activateMapPanel();
    } else {
      activateProjectionMapPanel();
    }

    setIsOpen(false);
  }

  function locateSearchResult(value: string) {
    setSearchTerm(value);

    const match = findMatchingCrs(value);

    if (!match) {
      setHighlightedCrsId(null);
      return;
    }

    setIsOpen(true);
    setActivePath(match.path);
    setHighlightedCrsId(match.crs.id);
  }

  function selectCrs(crs: CoordinateSystemLeaf) {
    setPendingCrsId(crs.id);
    setActivePath(getPathForCrs(crs.id) ?? activePath);
    setHighlightedCrsId(crs.id);
    setIsOpen(false);
  }

  return (
    <div
      className="ribbon-coordinate-system"
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <label className="ribbon-crs-search">
        <Search size={13} strokeWidth={1.8} />
        <input
          type="search"
          value={searchTerm}
          placeholder="搜索 EPSG / 名称"
          disabled={isDisabled}
          onChange={(event) => locateSearchResult(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const match = findMatchingCrs(searchTerm);

              if (match) {
                event.preventDefault();
                selectCrs(match.crs);
              }
            }
          }}
        />
      </label>

      <div className="ribbon-crs-selector">
        <button
          className={`ribbon-crs-select-button${isOpen ? ' is-open' : ''}`}
          type="button"
          disabled={isDisabled}
          aria-label="选择显示坐标系"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        >
          <span>{formatCrsLabel(selectedCrs)}</span>
          <ChevronDown size={14} strokeWidth={1.8} />
        </button>

        {isOpen ? (
          <div className="ribbon-crs-menu" role="menu" aria-label="显示坐标系">
            {menuColumns.map((column, columnIndex) => (
              <div className="ribbon-crs-menu-column" key={`${column.parentId}-${columnIndex}`}>
                {column.nodes.map((node) => {
                  if (node.kind === 'group') {
                    const isActive = activePath[columnIndex] === node.id;

                    return (
                      <button
                        key={node.id}
                        className={`ribbon-crs-menu-item is-group${isActive ? ' is-active' : ''}`}
                        type="button"
                        role="menuitem"
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActivePath(activePath.slice(0, columnIndex).concat(node.id))}
                        onFocus={() => setActivePath(activePath.slice(0, columnIndex).concat(node.id))}
                      >
                        <span>{node.label}</span>
                        <ChevronRight className="ribbon-crs-submenu-icon" size={13} strokeWidth={1.8} />
                      </button>
                    );
                  }

                  const isSelected = node.id === pendingCrsId;
                  const isCurrent = node.id === mapCommandState.displayCrs;
                  const isHighlighted = node.id === highlightedCrsId;

                  return (
                    <button
                      key={node.id}
                      className={[
                        'ribbon-crs-menu-item',
                        isSelected ? 'is-selected' : '',
                        isHighlighted ? 'is-highlighted' : '',
                      ].filter(Boolean).join(' ')}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCrs(node)}
                    >
                      <Check className="ribbon-crs-check-icon" size={13} strokeWidth={2} aria-hidden={!isSelected} />
                      <span>{formatCrsLabel(node)}</span>
                      {isCurrent ? <small>当前</small> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <button
        className="ribbon-crs-apply-button"
        type="button"
        title={selectedCrs.engine === 'MapLibre' ? '应用到 MapLibre 主地图' : '应用到 OpenLayers 投影视图'}
        disabled={isDisabled || !hasPendingChange}
        onClick={applyCoordinateSystem}
      >
        应用
      </button>

    </div>
  );
}
