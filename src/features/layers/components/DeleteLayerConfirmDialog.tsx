import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export type DeleteLayerConfirmTarget = {
  kind: 'layer' | 'basemap' | 'map';
  name: string;
};

type DeleteLayerConfirmDialogProps = {
  target: DeleteLayerConfirmTarget | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteLayerConfirmDialog({ target, onCancel, onConfirm }: DeleteLayerConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!target) {
      return;
    }

    previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        onConfirm();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElementRef.current?.focus();
    };
  }, [onCancel, onConfirm, target]);

  if (!target) {
    return null;
  }

  const title = target.kind === 'basemap' ? '删除底图' : target.kind === 'map' ? '删除地图' : '删除图层';
  const warning = target.kind === 'map'
    ? '地图中的图层将移动到相邻地图，删除后无法恢复，请确认当前选择。'
    : '删除后无法恢复，请确认当前选择。';

  return (
    <div
      className="delete-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        className="delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-dialog-header">
          <div className="delete-dialog-icon" aria-hidden="true">
            <AlertTriangle size={20} strokeWidth={2.2} />
          </div>
          <div className="delete-dialog-heading">
            <h2 id="delete-dialog-title">{title}</h2>
            <button type="button" className="delete-dialog-close" aria-label={'\u5173\u95ed'} title={'\u5173\u95ed'} onClick={onCancel}>
              <X size={18} />
            </button>
          </div>
        </div>
        <p id="delete-dialog-description" className="delete-dialog-description">
          {'\u786e\u5b9a\u8981\u5220\u9664\u201c'}<strong>{target.name}</strong>{'\u201d\u5417\uff1f'}
        </p>
        <p className="delete-dialog-warning">{warning}</p>
        <div className="delete-dialog-actions">
          <button type="button" className="delete-dialog-cancel" ref={cancelButtonRef} onClick={onCancel}>
            {'\u53d6\u6d88'}
          </button>
          <button type="button" className="delete-dialog-confirm" onClick={onConfirm}>
            <Trash2 size={16} />
            {'\u5220\u9664'}
          </button>
        </div>
      </section>
    </div>
  );
}