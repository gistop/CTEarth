import type { CategoryCount } from '../../shared/data-views/types';
export type ChartKind = 'distribution' | 'bar' | 'pie';
export type ChartState = Readonly<{ field: string; kind: ChartKind }>;
export type ChartModel = { kind: 'empty' | 'bar' | 'pie'; title: string; categories: CategoryCount[]; summary: string };
export type ChartPanelProps = { datasetId?: string; preferredField?: string };
export type ChartRuntime = { setModel(model: ChartModel): void; resize(): void; dispose(): void };
