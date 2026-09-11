import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { type DisplayCrsId, useMapCommands } from './MapCommandContext';
import {
  type CoordinateSystemLeaf,
  type CoordinateSystemNode,
  defaultCoordinateSystemPath,
  findMatchingCrs,
  getCrsById,
  getMenuColumns,
  getPathForCrs,
} from './coordinateSystems';
import { CoordinateSystemMenuItem } from './CoordinateSystemMenuItem';

export function CoordinateSystemControls() {
  const { mapCommandState, setDisplayCrs } = useMapCommands();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingCrsId, setPendingCrsId] = useState<DisplayCrsId>(mapCommandState.displayCrs);
  const [activePath, setActivePath] = useState<string[]>(defaultCoordinateSystemPath);
  const [highlightedCrsId, setHighlightedCrsId] = useState<DisplayCrsId | null>(null);

  const selectedCrs = useMemo(() => getCrsById(pendingCrsId), [pendingCrsId]);
  const isDisabled = mapCommandState.mapMode === 'globe';
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
      <CoordinateSystemSearch
        disabled={isDisabled}
        searchTerm={searchTerm}
        onEnter={() => {
          const match = findMatchingCrs(searchTerm);

          if (match) {
            selectCrs(match.crs);
          }
        }}
        onOpen={() => setIsOpen(true)}
        onSearchTermChange={locateSearchResult}
      />

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
              <CoordinateSystemMenuColumn
                key={`${column.parentId}-${columnIndex}`}
                activePath={activePath}
                columnIndex={columnIndex}
                highlightedCrsId={highlightedCrsId}
                nodes={column.nodes}
                pendingCrsId={pendingCrsId}
                currentCrsId={mapCommandState.displayCrs}
                onActivateGroup={(groupId) => setActivePath(activePath.slice(0, columnIndex).concat(groupId))}
                onSelectCrs={selectCrs}
              />
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

function CoordinateSystemSearch({
  disabled,
  searchTerm,
  onEnter,
  onOpen,
  onSearchTermChange,
}: {
  disabled: boolean;
  searchTerm: string;
  onEnter: () => void;
  onOpen: () => void;
  onSearchTermChange: (value: string) => void;
}) {
  return (
    <label className="ribbon-crs-search">
      <Search size={13} strokeWidth={1.8} />
      <input
        type="search"
        value={searchTerm}
        placeholder="搜索 EPSG / 名称"
        disabled={disabled}
        onChange={(event) => onSearchTermChange(event.target.value)}
        onFocus={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onEnter();
          }
        }}
      />
    </label>
  );
}

function CoordinateSystemMenuColumn({
  activePath,
  columnIndex,
  currentCrsId,
  highlightedCrsId,
  nodes,
  onActivateGroup,
  onSelectCrs,
  pendingCrsId,
}: {
  activePath: string[];
  columnIndex: number;
  currentCrsId: DisplayCrsId;
  highlightedCrsId: DisplayCrsId | null;
  nodes: CoordinateSystemNode[];
  onActivateGroup: (groupId: string) => void;
  onSelectCrs: (crs: CoordinateSystemLeaf) => void;
  pendingCrsId: DisplayCrsId;
}) {
  return (
    <div className="ribbon-crs-menu-column">
      {nodes.map((node) => (
        <CoordinateSystemMenuItem
          key={node.id}
          activePath={activePath}
          columnIndex={columnIndex}
          currentCrsId={currentCrsId}
          highlightedCrsId={highlightedCrsId}
          node={node}
          onActivateGroup={onActivateGroup}
          onSelectCrs={onSelectCrs}
          pendingCrsId={pendingCrsId}
        />
      ))}
    </div>
  );
}

function formatCrsLabel(crs: CoordinateSystemLeaf) {
  return `${crs.code} (${crs.name})`;
}
