import { ThreadPrimitive } from '@assistant-ui/react';
import { Sparkles } from 'lucide-react';
import { getMapAwareActions, type SelectedMapContext } from '../services/gisContextService';

export function MapAwarenessCard({ context }: { context: SelectedMapContext | null }) {

  if (!context) {
    return null;
  }

  const actions = getMapAwareActions(context);

  return (
    <section className="ai-map-context-card" aria-label="地图感知">
      <div className="ai-map-context-header">
        <Sparkles size={14} />
        <span>地图感知</span>
      </div>
      <div className="ai-map-context-summary" title={context.layerName}>
        <strong>当前选中</strong>
        <span>{context.layerName} · {context.selectedCount} 个{context.geometryLabel}要素</span>
      </div>
      <div className="ai-map-context-meta">
        <span>{context.fieldCount} 字段</span>
        <span>{context.numericFieldCount} 数值字段</span>
        <span>{context.totalLayerCount} 图层</span>
        {context.hasRaster ? <span>有栅格</span> : null}
      </div>
      <div className="ai-map-context-actions">
        {actions.map((action) => (
          <ThreadPrimitive.Suggestion
            className="ai-context-action"
            key={action.label}
            method="replace"
            prompt={action.prompt}
          >
            {action.label}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </section>
  );
}

