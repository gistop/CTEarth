import { Columns3, Plus, Save, Undo2 } from 'lucide-react';
import { useAttributeFieldEditor } from '../stores/useAttributeFieldEditor';

export function AttributeFieldsHeader({ datasetId }: { datasetId: string }) {
  const { dataset, state, canEdit, append, save, discard } = useAttributeFieldEditor(datasetId);
  return <div className='attribute-header-actions attribute-fields-header-actions' aria-label='字段编辑工具'
    onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <div className='attribute-header-title' title={dataset?.name ?? '字段'}><Columns3 size={15} /><span>{dataset?.name ?? '字段'}</span></div>
    <span className='attribute-fields-pending'>{state.drafts.length ? `${state.drafts.length} 个待保存` : '字段设计'}</span>
    <button type='button' onClick={append} disabled={!canEdit}><Plus size={14} />添加字段</button>
    <button type='button' onClick={save} disabled={!canEdit || !state.drafts.length}><Save size={14} />保存字段</button>
    <button type='button' onClick={discard} disabled={!canEdit || !state.drafts.length}><Undo2 size={14} />放弃新增</button>
  </div>;
}
