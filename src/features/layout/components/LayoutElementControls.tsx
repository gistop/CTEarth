import { Layers, Tags } from 'lucide-react';
import { useLayout } from '../stores/LayoutContext';
import { layoutElementControls } from './layoutControlOptions';
import type { LayoutOrderDirection } from '../types';

export function LayoutOrderButton({ direction }: { direction: LayoutOrderDirection }) {
  const { canMoveSelectionDown, canMoveSelectionUp, moveSelectedElements } = useLayout();
  const isUp = direction === 'up';
  const disabled = isUp ? !canMoveSelectionUp : !canMoveSelectionDown;

  return (
    <button
      type="button"
      disabled={disabled}
      title={isUp ? '上移选中元素' : '下移选中元素'}
      aria-label={isUp ? '上移选中元素' : '下移选中元素'}
      onClick={() => moveSelectedElements(direction)}
    >
      {isUp ? <Layers size={23} strokeWidth={1.6} /> : <Tags size={23} strokeWidth={1.6} />}
      <span>{isUp ? '上移' : '下移'}</span>
    </button>
  );
}

export function LayoutElementControls() {
  const { enabledElements, mapGraticuleVisible, setMapGraticuleVisible, toggleElement } = useLayout();

  return (
    <div className="ribbon-layout-element-controls" role="toolbar" aria-label="整饬元素">
      <div className="ribbon-layout-element-buttons">
        {layoutElementControls.map((control) => {
          const isEnabled = enabledElements.includes(control.id);

          return (
            <button
              className={isEnabled ? 'is-active' : undefined}
              key={control.id}
              type="button"
              title={control.label}
              aria-label={control.label}
              aria-pressed={isEnabled}
              onClick={() => toggleElement(control.id)}
            >
              {control.renderIcon()}
              <span>{control.label}</span>
            </button>
          );
        })}
      </div>
      <label className="ribbon-map-graticule-toggle" title="显示 Map Graticule" aria-label="显示 Map Graticule">
        <input
          type="checkbox"
          checked={mapGraticuleVisible}
          onChange={(event) => setMapGraticuleVisible(event.target.checked)}
        />
        <span>经纬网</span>
      </label>
    </div>
  );
}
