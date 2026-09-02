import { useEffect, useRef } from 'react';

type InlineRenameLabelProps = {
  value: string;
  canEdit: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onChange: (value: string) => void;
  onCommit: () => boolean;
  onCancel: () => void;
};

export function InlineRenameLabel({
  value,
  canEdit,
  isEditing,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
}: InlineRenameLabelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="tree-inline-rename-input"
        type="text"
        value={value}
        autoComplete="off"
        spellCheck={false}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onDragStart={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const committed = onCommit();

          if (!committed) {
            window.setTimeout(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            }, 0);
          }
        }}
        onKeyDown={(event) => {
          event.stopPropagation();

          if (event.key === 'Enter') {
            event.preventDefault();
            const committed = onCommit();

            if (!committed) {
              window.setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
              }, 0);
            }
            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    );
  }

  return (
    <span
      className={canEdit ? 'tree-inline-rename is-editable' : 'tree-inline-rename'}
      onClick={(event) => {
        if (!canEdit) {
          return;
        }

        event.stopPropagation();
        onStartEdit();
      }}
    >
      {value}
    </span>
  );
}
