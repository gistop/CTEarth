import { useMemo } from 'react';
import { defaultUploadedLayerStyle, useGis } from '../../../gisStore';
import { useMapGroupRenderState } from '../../../mapGroupRenderState';
import type { LayoutMapInput } from '../adapters/layoutMapTypes';

export function useLayoutMapInput(): LayoutMapInput {
  const { layers, raster, vectorOverlay, layerVisibility, rasterLayerVisibility, rasterStyle, uploadedLayerStyles, uploadedLayerVisibility, vectorOverlayStyle } = useGis();
  const mapGroups = useMapGroupRenderState();
  return useMemo(() => ({ layers, raster, vectorOverlay, layerVisibility, rasterLayerVisibility, rasterStyle, uploadedLayerStyles, uploadedLayerVisibility, vectorOverlayStyle, mapGroups, defaultUploadedStyle: defaultUploadedLayerStyle }), [layers, raster, vectorOverlay, layerVisibility, rasterLayerVisibility, rasterStyle, uploadedLayerStyles, uploadedLayerVisibility, vectorOverlayStyle, mapGroups]);
}
