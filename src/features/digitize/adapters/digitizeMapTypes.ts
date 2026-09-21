import type maplibregl from 'maplibre-gl';
import type { LayerVisibility, RasterOverlay, RasterLayerStyle, UploadedLayer, UploadedLayerStyle, VectorOverlay, VectorOverlayStyle } from '../../../gisStore';
import type { MapGroupRenderState } from '../../../mapGroupRenderState';
import type { DigitizeMapHandle, DigitizeState } from '../types';
import type { DigitizeEditService } from '../services/digitizeEditService';

export type DigitizeMapInput = {
  editableLayer: UploadedLayer | null;
  layers: UploadedLayer[];
  uploadedLayerVisibility: Record<string, boolean>;
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  defaultStyle: UploadedLayerStyle;
  layerVisibility: LayerVisibility;
  raster: RasterOverlay | null;
  rasterStyles: Record<string, RasterLayerStyle>;
  rasterLayerVisibility: Record<string, boolean>;
  vectorOverlay: VectorOverlay | null;
  vectorOverlayStyle: VectorOverlayStyle;
  mapGroups: MapGroupRenderState;
};

export type DigitizeMapCallbacks = {
  edits: DigitizeEditService;
  setStatus(status: string): unknown;
  setFeatureCount(count: number): unknown;
  setRasterAoi(polygon: DigitizeState['rasterAoi']): unknown;
};

export type DigitizeHostMap = Pick<maplibregl.Map, 'getCenter' | 'getZoom' | 'getBounds' | 'jumpTo' | 'fitBounds' | 'on' | 'off'>;

export interface DigitizeMapRuntime extends DigitizeMapHandle {
  sync(input: DigitizeMapInput): void;
  setState(state: DigitizeState): void;
  setHost(map: DigitizeHostMap | null): void;
  setVisible(visible: boolean): void;
  cancel(): void;
  dispose(): void;
}
