import type {
  SelectByLocationParameters as SelectByLocationRunParameters,
  SelectByValueParameters as SelectByValueRunParameters,
} from '../../../../../../gisStore';
import { displayLayerName, useGis } from '../../../../../../gisStore';
import { ToolField } from '../../../../components/ToolField';
import { selectionModeOptions } from '../services/selectionToolService';

export function SelectByValueParametersForm({
  params,
  onChange,
}: {
  params: SelectByValueRunParameters;
  onChange: (name: keyof SelectByValueRunParameters, value: string | boolean) => void;
}) {
  const { layer } = useGis();
  const valueDisabled = params.operator === 'isEmpty' || params.operator === 'isNotEmpty';

  return (
    <form className="tool-form">
      <ToolField label="输入要素" required action="folder">
        <input value={layer?.fileName ?? ''} readOnly placeholder="请先在左侧上传 Shapefile ZIP 或 GeoJSON" />
      </ToolField>
      <ToolField label="属性字段" required>
        <select value={params.field} onChange={(event) => onChange('field', event.target.value)}>
          <option value="" disabled>选择字段</option>
          {(layer?.fields ?? []).map((field) => <option key={field} value={field}>{field}</option>)}
        </select>
      </ToolField>
      <ToolField label="比较方式" required>
        <select value={params.operator} onChange={(event) => onChange('operator', event.target.value)}>
          <option value="equals">等于</option><option value="notEquals">不等于</option>
          <option value="contains">包含</option><option value="startsWith">开头为</option>
          <option value="endsWith">结尾为</option><option value="greaterThan">大于</option>
          <option value="greaterOrEqual">大于等于</option><option value="lessThan">小于</option>
          <option value="lessOrEqual">小于等于</option><option value="isEmpty">为空</option>
          <option value="isNotEmpty">非空</option>
        </select>
      </ToolField>
      <ToolField label="值">
        <input
          value={params.value}
          disabled={valueDisabled}
          placeholder={valueDisabled ? '无需输入' : '输入比较值'}
          onChange={(event) => onChange('value', event.target.value)}
        />
      </ToolField>
      <ToolField label="区分大小写">
        <input checked={params.caseSensitive} type="checkbox" onChange={(event) => onChange('caseSensitive', event.target.checked)} />
      </ToolField>
      <ToolField label="选择方式">
        <select value={params.selectionMode} onChange={(event) => onChange('selectionMode', event.target.value)}>
          {selectionModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </ToolField>
    </form>
  );
}

export function SelectByLocationParametersForm({
  params,
  onChange,
}: {
  params: SelectByLocationRunParameters;
  onChange: (name: keyof SelectByLocationRunParameters, value: string) => void;
}) {
  const { layer, layers, vectorOverlay } = useGis();
  const referenceOptions = [
    ...layers
      .filter((item) => item.id !== layer?.id)
      .map((item) => ({ id: item.id, label: displayLayerName(item.fileName) })),
    ...(vectorOverlay ? [{ id: 'vectorOverlay', label: displayLayerName(vectorOverlay.name) }] : []),
  ];

  return (
    <form className="tool-form">
      <ToolField label="目标要素" required action="folder">
        <input value={layer?.fileName ?? ''} readOnly placeholder="请先在左侧上传 Shapefile ZIP 或 GeoJSON" />
      </ToolField>
      <ToolField label="参考要素" required action="folder">
        <select value={params.referenceLayerId} onChange={(event) => onChange('referenceLayerId', event.target.value)}>
          <option value="" disabled>选择参考图层</option>
          {referenceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </ToolField>
      <ToolField label="空间关系" required>
        <select value={params.relation} onChange={(event) => onChange('relation', event.target.value)}>
          <option value="intersects">相交</option><option value="within">位于内部</option>
          <option value="contains">包含</option><option value="disjoint">不相交</option>
        </select>
      </ToolField>
      <ToolField label="选择方式">
        <select value={params.selectionMode} onChange={(event) => onChange('selectionMode', event.target.value)}>
          {selectionModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </ToolField>
    </form>
  );
}
