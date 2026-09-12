export type DataRecord = Readonly<Record<string, unknown>>;
export type DataViewDataset = {
  id: string;
  name: string;
  records: readonly DataRecord[];
  fields: readonly string[];
  selectedIndexes: readonly number[];
  selectable: boolean;
};
export type DataViewFilter = Readonly<{ query: string; showSelectedOnly: boolean }>;
export type DataViewRow = { recordIndex: number; values: DataRecord };
export type DataViewSort = Readonly<{ field: string; direction: 'asc' | 'desc' }>;
export type CategoryCount = { name: string; value: number };
export type OpenDataView = (datasetId: string, name?: string, field?: string) => void;
