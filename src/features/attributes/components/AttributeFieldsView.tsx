import { useMemo } from 'react';
import { Columns3, Plus, Trash2 } from 'lucide-react';
import { dataFieldTypeLabels } from '../../../shared/data-views/dataFieldService';
import { formatDataValue, getDataValue } from '../../../shared/data-views';
import type { DataFieldType, DataViewDataset } from '../../../shared/data-views/types';
import { useAttributeFieldEditor } from '../stores/useAttributeFieldEditor';
import type { AttributeTableProps } from '../types';

function describeFields(dataset: DataViewDataset | undefined) {
  return (dataset?.fields ?? []).map(name => {
    const definition = dataset?.fieldDefinitions?.find(field => field.name === name);
    if (definition) return { name, alias: definition.alias, type: dataFieldTypeLabels[definition.type], nullable: definition.nullable ? '是' : '否', defaultValue: formatDataValue(definition.defaultValue), length: definition.length ?? '—' };
    const sample = dataset?.records.find(record => getDataValue(record, name) != null);
    const value = sample ? getDataValue(sample, name) : null;
    const type = typeof value === 'number' ? '数值' : typeof value === 'string' ? '文本' : typeof value === 'boolean' ? '布尔' : value == null ? '未指定' : '对象';
    return { name, alias: '', type, nullable: '—', defaultValue: '—', length: '—' };
  });
}

export function AttributeFieldsView({ datasetId }: AttributeTableProps) {
  const { dataset, state, canEdit, append, update, remove } = useAttributeFieldEditor(datasetId);
  const existingFields = useMemo(() => describeFields(dataset), [dataset]);
  if (!dataset) return <section className='attribute-table-panel attribute-table-empty'><Columns3 size={20} /><span>图层已移除或不可用，请重新打开字段页。</span></section>;
  return <section className='attribute-fields-panel' aria-label='字段设计'>
    {state.error ? <div className='attribute-fields-message is-error' role='alert'>{state.error}</div> : null}
    {state.notice ? <div className='attribute-fields-message' role='status'>{state.notice}</div> : null}
    <div className='attribute-fields-grid'>
      <table className='attribute-fields-table' aria-label='图层字段'>
        <thead><tr><th scope='col' className='attribute-fields-row-number'>#</th><th scope='col'>字段名</th><th scope='col'>别名</th><th scope='col'>数据类型</th><th scope='col'>允许空值</th><th scope='col'>默认值</th><th scope='col'>长度</th><th scope='col'>状态</th><th scope='col' className='attribute-fields-remove'><span className='attribute-fields-sr-only'>操作</span></th></tr></thead>
        <tbody>
          {existingFields.map((field, index) => <tr key={field.name} className='attribute-fields-existing'>
            <td>{index + 1}</td><th scope='row' title={field.name}>{field.name}</th><td title={field.alias}>{field.alias || '—'}</td><td>{field.type}</td><td>{field.nullable}</td><td>{field.defaultValue}</td><td>{field.length}</td><td><span className='attribute-fields-state'>已有</span></td><td />
          </tr>)}
          {state.drafts.map((draft, index) => <tr key={draft.id} className='attribute-fields-draft'>
            <td>{existingFields.length + index + 1}</td>
            <td><input aria-label={`新增字段 ${index + 1} 名称`} value={draft.name} maxLength={64} disabled={!canEdit} autoFocus={index === state.drafts.length - 1} onFocus={event => event.target.select()} onChange={event => update(draft.id, { name: event.target.value })} /></td>
            <td><input aria-label={`新增字段 ${index + 1} 别名`} value={draft.alias} maxLength={128} disabled={!canEdit} placeholder='可选' onChange={event => update(draft.id, { alias: event.target.value })} /></td>
            <td><select aria-label={`新增字段 ${index + 1} 数据类型`} value={draft.type} disabled={!canEdit} onChange={event => update(draft.id, { type: event.target.value as DataFieldType, defaultValue: '' })}>
              {Object.entries(dataFieldTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </select></td>
            <td className='attribute-fields-checkbox'><input type='checkbox' aria-label={`新增字段 ${index + 1} 允许空值`} checked={draft.nullable} disabled={!canEdit} onChange={event => update(draft.id, { nullable: event.target.checked })} /></td>
            <td>{draft.type === 'boolean' ? <select aria-label={`新增字段 ${index + 1} 默认值`} value={draft.defaultValue} disabled={!canEdit} onChange={event => update(draft.id, { defaultValue: event.target.value })}>
              <option value=''>空值</option><option value='true'>true</option><option value='false'>false</option>
            </select> : <input aria-label={`新增字段 ${index + 1} 默认值`} type={draft.type === 'date' ? 'date' : 'text'} value={draft.defaultValue} disabled={!canEdit} placeholder={draft.nullable ? '空值' : '必填'} onChange={event => update(draft.id, { defaultValue: event.target.value })} />}</td>
            <td>{draft.type === 'text' ? <input type='number' min={1} max={65535} step={1} aria-label={`新增字段 ${index + 1} 长度`} value={draft.length} disabled={!canEdit} onChange={event => update(draft.id, { length: event.target.value })} /> : '—'}</td>
            <td><span className='attribute-fields-state is-new'>新增</span></td>
            <td><button type='button' className='attribute-fields-delete' aria-label={`移除新增字段 ${index + 1}`} title='移除新增字段' disabled={!canEdit} onClick={() => remove(draft.id)}><Trash2 size={14} /></button></td>
          </tr>)}
          <tr><td colSpan={9} className='attribute-fields-add-cell'><button type='button' onClick={append} disabled={!canEdit}><Plus size={14} />单击此处添加新字段</button></td></tr>
        </tbody>
      </table>
    </div>
    <footer className='attribute-fields-footer'>
      <span>{existingFields.length} 个字段{state.drafts.length ? ` · ${state.drafts.length} 个待保存` : ''}</span>
      <span>{canEdit ? `保存将应用到全部 ${dataset.records.length} 条记录；已有字段仅供查看。` : '当前图层不支持添加字段。'}</span>
    </footer>
  </section>;
}
