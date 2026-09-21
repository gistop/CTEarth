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

/** 每个栅格图层独立的渲染样式，按栅格 ID 查找；缺失时回退到默认透明度。 */
export type RasterStyleLookup = Record<string, { opacity: number }>;

export const DEFAULT_RASTER_OPACITY = 0.82;

export function resolveRasterOpacity(styles: RasterStyleLookup | undefined, rasterId: string): number {
  const opacity = styles?.[rasterId]?.opacity;
  return typeof opacity === 'number' && Number.isFinite(opacity) ? opacity : DEFAULT_RASTER_OPACITY;
}

/** Adapter contract shared by MapLibre, Cesium and OpenLayers integrations. */
export type LayerEngineAdapter<TRequest = LayerAdapterEntry[]> = {
  sync: (request: TRequest) => Promise<void> | void;
  dispose?: () => void;
};
