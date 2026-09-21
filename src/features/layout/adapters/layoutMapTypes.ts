import type { LayerVisibility, RasterLayerStyle, RasterOverlay, UploadedLayer, UploadedLayerStyle, VectorOverlay, VectorOverlayStyle } from '../../../gisStore';
import type { MapGroupRenderState } from '../../../mapGroupRenderState';
import type { LayoutMapSnapshot, LayoutMapView } from '../types';

export type LayoutMapInput = {
  layers: UploadedLayer[];
  raster: RasterOverlay | null;
  vectorOverlay: VectorOverlay | null;
  layerVisibility: LayerVisibility;
  rasterLayerVisibility: Record<string, boolean>;
  rasterStyles: Record<string, RasterLayerStyle>;
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  uploadedLayerVisibility: Record<string, boolean>;
  vectorOverlayStyle: VectorOverlayStyle;
  defaultUploadedStyle: UploadedLayerStyle;
  mapGroups: MapGroupRenderState;
};

export type LayoutMapOptions = {
  pxPerMm: number;
  graticuleVisible: boolean;
  view: LayoutMapView | null;
  onViewChange: (view: LayoutMapView) => void;
};

export interface LayoutMapRuntime {
  sync(input: LayoutMapInput): void;
  setOptions(options: LayoutMapOptions): void;
  setTargets(northArrow: HTMLDivElement | null, scaleBar: HTMLDivElement | null): void;
  capture(width: number, height: number, signal?: AbortSignal): Promise<LayoutMapSnapshot>;
  dispose(): void;
}
