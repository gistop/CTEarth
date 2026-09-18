import type { LayerNodeKind, LayerVisibilityState } from '../types';

export type LayerAdapterEntry = {
  id: string;
  kind: LayerNodeKind;
  state: LayerVisibilityState;
  payload: unknown;
};

export type RasterRenderData = {
  id: string;
  imageUrl: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
};

/** Adapter contract shared by MapLibre, Cesium and OpenLayers integrations. */
export type LayerEngineAdapter<TRequest = LayerAdapterEntry[]> = {
  sync: (request: TRequest) => Promise<void> | void;
  dispose?: () => void;
};
