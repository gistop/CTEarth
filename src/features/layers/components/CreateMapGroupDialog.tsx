import { useEffect, useRef, useState } from 'react';
import { MapPlus, X } from 'lucide-react';
import { isDuplicateMapGroupName, nextMapGroupName } from '../services/mapGroupService';
import type { MapGroup } from '../types';

export type CreateMapGroupTarget = {
  /** 打开对话框时的地图组快照，用于生成默认名称并校验重名。 */
  groups: MapGroup[];
};

/**
 * 新建项目（地图组）对话框：设置项目名称并做非空/重名校验。
 * 复用删除确认对话框的外壳与交互约定（Esc 取消、Enter 提交、点击遮罩取消、焦点恢复），
 * 校验结果就地以错误提示展示，替代原先的 window.prompt + window.alert 循环。
 */
export function CreateMapGroupDialog({
  target,
  onCancel,
  onCreate,
}: {
  target: CreateMapGroupTarget | null;
  onCancel: () => void;
  onCreate: (name: string) => void;
}) {
  if (!target) {
    return null;
  }

  return <CreateMapGroupForm groups={target.groups} onCancel={onCancel} onCreate={onCreate} />;
}

function CreateMapGroupForm({
  groups,
  onCancel,
  onCreate,
}: {
  groups: MapGroup[];
  onCancel: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState(() => nextMapGroupName(groups));
  const inputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const stateRef = useRef({ name });
  const callbacksRef = useRef({ onCancel, onCreate });
  stateRef.current = { name };
  callbacksRef.current = { onCancel, onCreate };

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    inputRef.current?.select();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        callbacksRef.current.onCancel();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const value = stateRef.current.name.trim();

        if (value && !isDuplicateMapGroupName(groups, value)) {
          callbacksRef.current.onCreate(value);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElementRef.current?.focus();
    };
  }, [groups]);

  const trimmedName = name.trim();
  const error = !trimmedName
    ? '项目名称不能为空。'
    : isDuplicateMapGroupName(groups, trimmedName)
      ? '项目名称不能重复。'
      : '';

  return (
    <div
      className="delete-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          callbacksRef.current.onCancel();
        }
      }}
    >
      <section
        className="delete-dialog create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-map-group-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-dialog-header">
          <div className="delete-dialog-icon" aria-hidden="true">
            <MapPlus size={20} strokeWidth={2.2} />
          </div>
          <div className="delete-dialog-heading">
            <h2 id="create-map-group-dialog-title">新建项目</h2>
            <button type="button" className="delete-dialog-close" aria-label="关闭" title="关闭" onClick={onCancel}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="dialog-form">
          <label className="dialog-field">
            <span>项目名称</span>
            <input
              ref={inputRef}
              value={name}
              placeholder={nextMapGroupName(groups)}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error ? <p className="dialog-error" role="alert">{error}</p> : null}
          <p className="dialog-note">新项目会自带一个底图图层；创建后可在项目之间拖动图层，也可把其中某个项目设为当前项目。</p>
        </div>
        <div className="delete-dialog-actions">
          <button type="button" className="delete-dialog-cancel" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="delete-dialog-confirm dialog-submit"
            disabled={Boolean(error)}
            onClick={() => onCreate(trimmedName)}
          >
            新建
          </button>
        </div>
      </section>
    </div>
  );
}
