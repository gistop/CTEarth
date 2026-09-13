import type { ComponentType } from 'react';
import { Columns3, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { useAttributeFieldEditor } from '../stores/useAttributeFieldEditor';

export type AttributeFieldRibbonTool = {
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  disabled?: boolean;
  muted?: boolean;
  onClick?: () => void;
};

export type AttributeFieldRibbonGroup = {
  title: string;
  tools: AttributeFieldRibbonTool[];
};

export function useAttributeFieldRibbonGroups(datasetId?: string | null): AttributeFieldRibbonGroup[] {
  const { state, canEdit, append, update, remove, save, discard } = useAttributeFieldEditor(datasetId ?? undefined);
  return [
    {
      title: '字段编辑',
      tools: [
        { label: '新建字段', icon: Plus, disabled: !canEdit, onClick: append },
        { label: '删除新增', icon: Trash2, disabled: !canEdit || !state.drafts.length, onClick: () => state.drafts.at(-1) && remove(state.drafts.at(-1)!.id) },
      ],
    },
    {
      title: '管理编辑内容',
      tools: [
        { label: '保存', icon: Save, disabled: !canEdit || !state.drafts.length, onClick: save },
        { label: '放弃', icon: Undo2, disabled: !canEdit || !state.drafts.length, muted: true, onClick: discard },
      ],
    },
    {
      title: '字段状态',
      tools: [
        { label: state.drafts.length ? `待保存 ${state.drafts.length}` : '无待保存', icon: Columns3, disabled: true },
      ],
    },
  ];
}
