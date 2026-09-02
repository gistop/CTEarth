import { X } from 'lucide-react';
import type { MapGroup } from './MapGroupSection';

type MapGroupEditPanelProps = {
  group: MapGroup;
  onClose: () => void;
};

export function MapGroupEditPanel({
  group,
  onClose,
}: MapGroupEditPanelProps) {
  return (
    <section className="layer-style-panel" aria-label={`${group.name} 编辑面板`} onClick={(event) => event.stopPropagation()}>
      <div className="layer-style-header">
        <h4>编辑</h4>
        <button type="button" title="关闭" aria-label="关闭编辑面板" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <div className="layer-style-actions">
        <button type="button" onClick={onClose}>关闭</button>
      </div>
    </section>
  );
}
