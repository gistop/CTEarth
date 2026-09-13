export type DataRecord = Readonly<Record<string, unknown>>;
export type DataFieldType = 'text' | 'integer' | 'decimal' | 'boolean' | 'date';
export type DataFieldDefinition = Readonly<{
  name: string;
  alias: string;
  type: DataFieldType;
  nullable: boolean;
  defaultValue: string | number | boolean | null;
  length: number | null;
}>;
export type DataViewDataset = {
  id: string;
  name: string;
  records: readonly DataRecord[];
  fields: readonly string[];
  selectedIndexes: readonly number[];
  selectable: boolean;
  editable?: boolean;
  fieldDefinitions?: readonly DataFieldDefinition[];
};
export type DataViewFilter = Readonly<{ query: string; showSelectedOnly: boolean }>;
export type DataViewRow = { recordIndex: number; values: DataRecord };
export type DataViewSort = Readonly<{ field: string; direction: 'asc' | 'desc' }>;
export type CategoryCount = { name: string; value: number };
export type OpenDataView = (datasetId: string, name?: string, field?: string) => void;
