import type { DataViewSort } from '../../shared/data-views/types';
export type AttributeTableState = Readonly<{ sort: DataViewSort | null }>;
export type AttributeTableProps = { datasetId?: string };
