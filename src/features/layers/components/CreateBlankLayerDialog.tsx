import { useEffect, useRef, useState } from 'react';
import { Circle, Layers, Spline, Square, X } from 'lucide-react';
import type { EditableGeometryType } from '../../../gisStore';

export type CreateBlankLayerTarget = {
  /** 打开对话框时预选的几何类型。 */
  geometryType: EditableGeometryType;
  /** 可选的默认图层名；缺省时按几何类型生成，如 "polygon-layer.geojson"。 */
  defaultFileName?: string;
};

export type CreateBlankLayerParams = {
  fileName: string;
  geometryType: EditableGeometryType;
};

const GEOMETRY_OPTIONS: ReadonlyArray<{
  value: EditableGeometryType;
  label: string;
  icon: typeof Circle;
}> = [
  { value: 'Point', label: '点', icon: Circle },
  { value: 'LineString', label: '线', icon: Spline },
  { value: 'Polygon', label: '面', icon: Square },
];

export const blankLayerGeometryLabels: Record<EditableGeometryType, string> = {
  Point: '点',
  LineString: '线',
  Polygon: '面',
};

export function defaultBlankLayerFileName(geometryType: EditableGeometryType) {
  return `${geometryType.toLowerCase()}-layer.geojson`;
}

function isDefaultBlankLayerFileName(value: string) {
  return /^(point|linestring|polygon)-layer\.geojson$/i.test(value.trim());
}

/**
 * 新建空白 GeoJSON 图层对话框：设置图层名称与几何类型（点/线/面，一层一型）。
 * 复用删除确认对话框的外壳与交互约定（Esc 取消、Enter 提交、点击遮罩取消、焦点恢复）。
 */
export function CreateBlankLayerDialog({
  target,
  onCancel,
  onCreate,
}: {
  target: CreateBlankLayerTarget | null;
  onCancel: () => void;
  onCreate: (params: CreateBlankLayerParams) => void;
}) {
  if (!target) {
    return null;
  }

  // target 变为 null 时表单整体卸载，下次打开以全新状态挂载，避免残留上次输入。
  return (
    <CreateBlankLayerForm
      target={target}
      onCancel={onCancel}
      onCreate={onCreate}
    />
  );
}

function CreateBlankLayerForm({
  target,
  onCancel,
  onCreate,
}: {
  target: CreateBlankLayerTarget;
  onCancel: () => void;
  onCreate: (params: CreateBlankLayerParams) => void;
}) {
  const [geometryType, setGeometryType] = useState<EditableGeometryType>(target.geometryType);
  const [fileName, setFileName] = useState(target.defaultFileName?.trim() || defaultBlankLayerFileName(target.geometryType));
  const nameInputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const formStateRef = useRef({ fileName, geometryType });
  const callbacksRef = useRef({ onCancel, onCreate });
  formStateRef.current = { fileName, geometryType };
  callbacksRef.current = { onCancel, onCreate };

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        callbacksRef.current.onCancel();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const { fileName: name, geometryType: type } = formStateRef.current;
        callbacksRef.current.onCreate({
          fileName: name.trim() || defaultBlankLayerFileName(type),
          geometryType: type,
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElementRef.current?.focus();
    };
  }, []);

  const selectGeometry = (next: EditableGeometryType) => {
    setGeometryType(next);
    setFileName((current) => (!current.trim() || isDefaultBlankLayerFileName(current)
      ? defaultBlankLayerFileName(next)
      : current));
  };

  const submit = () => {
    callbacksRef.current.onCreate({
      fileName: fileName.trim() || defaultBlankLayerFileName(geometryType),
      geometryType,
    });
  };

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
        aria-labelledby="create-layer-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-dialog-header">
          <div className="delete-dialog-icon" aria-hidden="true">
            <Layers size={20} strokeWidth={2.2} />
          </div>
          <div className="delete-dialog-heading">
            <h2 id="create-layer-dialog-title">新建空白图层</h2>
            <button type="button" className="delete-dialog-close" aria-label="关闭" title="关闭" onClick={onCancel}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="dialog-form">
          <label className="dialog-field">
            <span>图层名称</span>
            <input
              ref={nameInputRef}
              value={fileName}
              placeholder={defaultBlankLayerFileName(geometryType)}
              onChange={(event) => setFileName(event.target.value)}
            />
          </label>
          <div className="dialog-field" role="radiogroup" aria-label="几何类型">
            <span>几何类型</span>
            <div className="create-layer-types">
              {GEOMETRY_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = geometryType === option.value;
                return (
                  <label key={option.value} className={selected ? 'create-layer-type is-active' : 'create-layer-type'}>
                    <input
                      type="radio"
                      name="create-layer-geometry"
                      value={option.value}
                      checked={selected}
                      onChange={() => selectGeometry(option.value)}
                    />
                    <Icon size={16} strokeWidth={2} />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <p className="dialog-note">每个图层只包含一种几何类型；创建后可在“编辑”选项卡中绘制要素。</p>
        </div>
        <div className="delete-dialog-actions">
          <button type="button" className="delete-dialog-cancel" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="delete-dialog-confirm dialog-submit" onClick={submit}>
            新建
          </button>
        </div>
      </section>
    </div>
  );
}
