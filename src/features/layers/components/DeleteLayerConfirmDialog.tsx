import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export type DeleteLayerConfirmTarget = {
  kind: 'layer' | 'basemap';
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

  const title = target.kind === 'basemap' ? '\u5220\u9664\u5e95\u56fe' : '\u5220\u9664\u56fe\u5c42';

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
        <p className="delete-dialog-warning">{'\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\uff0c\u8bf7\u786e\u8ba4\u5f53\u524d\u9009\u62e9\u3002'}</p>
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