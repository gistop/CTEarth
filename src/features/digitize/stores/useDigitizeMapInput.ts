import { useMemo } from 'react';
import { useLayerStore } from '../../layers';
import { defaultUploadedLayerStyle } from '../../../gisStore';
import { useMapGroupRenderState } from '../../../mapGroupRenderState';
import type { DigitizeMapInput } from '../adapters/digitizeMapTypes';

export function useDigitizeMapInput(): DigitizeMapInput {
  const { activeLayerId, layers, uploadedLayerVisibility, uploadedLayerStyles, layerVisibility, raster, rasterStyle, rasterLayerVisibility, vectorOverlay, vectorOverlayStyle } = useLayerStore();
  const mapGroups = useMapGroupRenderState();
  const editableLayer = layers.find(layer => layer.id === activeLayerId) ?? layers.at(-1) ?? null;
  return useMemo(() => ({ editableLayer, layers, uploadedLayerVisibility, uploadedLayerStyles, defaultStyle: defaultUploadedLayerStyle, layerVisibility, raster, rasterStyle, rasterLayerVisibility, vectorOverlay, vectorOverlayStyle, mapGroups }), [editableLayer, layers, uploadedLayerVisibility, uploadedLayerStyles, layerVisibility, raster, rasterStyle, rasterLayerVisibility, vectorOverlay, vectorOverlayStyle, mapGroups]);
}
