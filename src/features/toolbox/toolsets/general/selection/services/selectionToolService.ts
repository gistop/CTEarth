import type { UploadedLayer, VectorOverlay } from '../../../../../../gisStore';
import type { SelectionToolId } from '../types';

export const selectionToolTitles: Record<SelectionToolId, string> = {
  selectByValue: '按属性选择',
  selectByLocation: '按位置选择',
};

export const selectionModeOptions = [
  { value: 'new', label: '新建选择集' },
  { value: 'add', label: '添加到当前选择集' },
  { value: 'remove', label: '从当前选择集移除' },
  { value: 'subset', label: '从当前选择集筛选' },
] as const;

export function defaultReferenceLayerId(
  layers: Pick<UploadedLayer, 'id'>[],
  activeLayerId: string | undefined,
  vectorOverlay: VectorOverlay | null,
) {
  return layers.find((item) => item.id !== activeLayerId)?.id ?? (vectorOverlay ? 'vectorOverlay' : '');
}

export function isReferenceLayerAvailable(
  layers: Pick<UploadedLayer, 'id'>[],
  activeLayerId: string | undefined,
  vectorOverlay: VectorOverlay | null,
  referenceLayerId: string,
) {
  return layers.some((item) => item.id === referenceLayerId && item.id !== activeLayerId)
    || (referenceLayerId === 'vectorOverlay' && Boolean(vectorOverlay));
}
