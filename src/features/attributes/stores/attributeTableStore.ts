import { createKeyedViewStore } from '../../../shared/data-views/keyedViewStore';
import type { AttributeTableState } from '../types';

export function createAttributeTableStore() {
  return createKeyedViewStore<AttributeTableState>(Object.freeze({ sort: null }), (previous, patch) => {
    const sort = Object.hasOwn(patch, 'sort') ? patch.sort : previous.sort;
    if (sort !== null && (!sort || typeof sort.field !== 'string' || !['asc', 'desc'].includes(sort.direction))) throw new Error('属性表排序参数无效。');
    return { sort: sort ? Object.freeze({ field: sort.field, direction: sort.direction }) : null };
  });
}
export type AttributeTableStore = ReturnType<typeof createAttributeTableStore>;
