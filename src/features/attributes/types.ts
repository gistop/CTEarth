import type { DataFieldDefinition, DataFieldType, DataViewSort } from '../../shared/data-views/types';
export type AttributeTableState = Readonly<{ sort: DataViewSort | null }>;
export type AttributeTableProps = { datasetId?: string };
export type AttributeFieldDraft = Readonly<{
  id: string;
  name: string;
  alias: string;
  type: DataFieldType;
  nullable: boolean;
  defaultValue: string;
  length: string;
}>;
export type AttributeFieldState = Readonly<{
  drafts: readonly AttributeFieldDraft[];
  error: string;
  notice: string;
}>;
export type AddAttributeFields = (datasetId: string, fields: readonly DataFieldDefinition[]) => void;
