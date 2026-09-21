import { useState, type ComponentType } from 'react';
import { useLayerStore } from '../../layers';
import { CreateBlankLayerDialog } from '../../layers/components/CreateBlankLayerDialog';
import { useDigitize } from '../stores/DigitizeContext';
import type { EditableGeometryType } from '../../../gisStore';

/**
 * 功能区“编辑”选项卡中的新建空白图层按钮：点击弹出统一的创建对话框，
 * 创建成功后自动切换到对应几何类型的绘制工具。
 */
export function NewLayerButton({
  geometryType,
  label,
  icon: Icon,
}: {
  geometryType: EditableGeometryType;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  const [open, setOpen] = useState(false);
  const { createBlankGeoJsonLayer } = useLayerStore();
  const digitize = useDigitize();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon size={23} strokeWidth={1.6} />
        <span>{label}</span>
      </button>
      <CreateBlankLayerDialog
        target={open ? { geometryType } : null}
        onCancel={() => setOpen(false)}
        onCreate={({ fileName, geometryType: nextGeometryType }) => {
          setOpen(false);
          createBlankGeoJsonLayer({ fileName, geometryType: nextGeometryType });
          digitize.setActiveTool(nextGeometryType);
        }}
      />
    </>
  );
}
