import type {
  ExtractByMaskParameters,
  OverlayParameters,
  OverlayToolId,
  TerrainToolId,
  UploadedLayer,
  VectorOverlay,
} from '../../../../../gisStore';
import type { AnalysisToolId } from '../types';

export const overlayToolIds = ['intersect', 'union', 'erase'] as const satisfies readonly OverlayToolId[];

export const analysisToolTitles: Record<AnalysisToolId, string> = {
  idw: '反距离加权',
  buffer: '缓冲区',
  extractByMask: '按掩膜提取',
  intersect: '相交',
  union: '联合',
  erase: '擦除',
  hillshade: '山体阴影',
  slope: '坡度',
  aspect: '坡向',
};

export function isTerrainTool(tool: AnalysisToolId): tool is TerrainToolId {
  return tool === 'hillshade' || tool === 'slope' || tool === 'aspect';
}

export function isOverlayTool(tool: AnalysisToolId): tool is OverlayToolId {
  return (overlayToolIds as readonly AnalysisToolId[]).includes(tool);
}

export function defaultIdwLayerId(
  layers: Pick<UploadedLayer, 'id' | 'points'>[],
  activeLayer: Pick<UploadedLayer, 'id' | 'points'> | null,
) {
  if (activeLayer && activeLayer.points.features.length > 0) {
    return activeLayer.id;
  }

  return layers.find((item) => item.points.features.length > 0)?.id ?? '';
}

export function idwLayerDisplayName(fileName: string) {
  return /\.geojson$/i.test(fileName) ? fileName : `${fileName}.geojson`;
}

export function isIdwLayerAvailable(
  layers: Pick<UploadedLayer, 'id' | 'points'>[],
  layerId: string,
) {
  return Boolean(layerId) && layers.some((item) => item.id === layerId && item.points.features.length > 0);
}

export function defaultMaskLayerId(layers: UploadedLayer[], vectorOverlay: VectorOverlay | null) {
  return layers.find(isPolygonOverlaySource)?.id
    ?? (isPolygonOverlayVectorOverlay(vectorOverlay) ? 'vectorOverlay' : '');
}

export function isMaskLayerAvailable(
  layers: UploadedLayer[],
  vectorOverlay: VectorOverlay | null,
  maskLayerId: string,
) {
  return isOverlayLayerAvailable(layers, vectorOverlay, maskLayerId);
}

export function defaultOverlayInputLayerId(
  layers: UploadedLayer[],
  activeLayerId: string | undefined,
  vectorOverlay: VectorOverlay | null,
) {
  const polygonLayers = layers.filter(isPolygonOverlaySource);

  if (activeLayerId && polygonLayers.some((item) => item.id === activeLayerId)) {
    return activeLayerId;
  }

  return polygonLayers[0]?.id ?? (isPolygonOverlayVectorOverlay(vectorOverlay) ? 'vectorOverlay' : '');
}

export function defaultOverlayLayerId(
  layers: UploadedLayer[],
  inputLayerId: string | undefined,
  vectorOverlay: VectorOverlay | null,
) {
  const polygonLayers = layers.filter(isPolygonOverlaySource).filter((item) => item.id !== inputLayerId);

  return polygonLayers[0]?.id
    ?? (isPolygonOverlayVectorOverlay(vectorOverlay) && inputLayerId !== 'vectorOverlay' ? 'vectorOverlay' : '');
}

export function isOverlayLayerAvailable(
  layers: UploadedLayer[],
  vectorOverlay: VectorOverlay | null,
  layerId: string,
) {
  if (!layerId) {
    return false;
  }

  return layers.some((item) => item.id === layerId && isPolygonOverlaySource(item))
    || (layerId === 'vectorOverlay' && isPolygonOverlayVectorOverlay(vectorOverlay));
}

export function normalizeOverlayParams(
  params: OverlayParameters,
  layers: UploadedLayer[],
  activeLayerId: string | undefined,
  vectorOverlay: VectorOverlay | null,
): OverlayParameters {
  const inputLayerId = isOverlayLayerAvailable(layers, vectorOverlay, params.inputLayerId)
    ? params.inputLayerId
    : defaultOverlayInputLayerId(layers, activeLayerId, vectorOverlay);
  const overlayLayerId = isOverlayLayerAvailable(layers, vectorOverlay, params.overlayLayerId)
    && params.overlayLayerId !== inputLayerId
    ? params.overlayLayerId
    : defaultOverlayLayerId(layers, inputLayerId, vectorOverlay);

  return { ...params, inputLayerId, overlayLayerId };
}

export function sameOverlayParams(left: OverlayParameters, right: OverlayParameters) {
  return left.inputLayerId === right.inputLayerId
    && left.overlayLayerId === right.overlayLayerId
    && left.outputName === right.outputName
    && left.snapTolerance === right.snapTolerance;
}

export function createDefaultOverlayParameters(
  layers: UploadedLayer[],
  activeLayerId: string | undefined,
  vectorOverlay: VectorOverlay | null,
): Record<OverlayToolId, OverlayParameters> {
  const inputLayerId = defaultOverlayInputLayerId(layers, activeLayerId, vectorOverlay);
  const overlayLayerId = defaultOverlayLayerId(layers, inputLayerId, vectorOverlay);

  return {
    intersect: { inputLayerId, overlayLayerId, outputName: 'intersect.geojson', snapTolerance: '' },
    union: { inputLayerId, overlayLayerId, outputName: 'union.geojson', snapTolerance: '' },
    erase: { inputLayerId, overlayLayerId, outputName: 'erase.geojson', snapTolerance: '' },
  };
}

export function createDefaultExtractByMaskParameters(
  layers: UploadedLayer[],
  vectorOverlay: VectorOverlay | null,
): ExtractByMaskParameters {
  return {
    maskLayerId: defaultMaskLayerId(layers, vectorOverlay),
    outputName: 'extract-by-mask.tif',
    maintainDimensions: true,
  };
}

export function isPolygonOverlaySource(layer: Pick<UploadedLayer, 'geojson'>) {
  return hasPolygonOverlayFeatures(layer.geojson.features);
}

export function isPolygonOverlayVectorOverlay(vectorOverlay: VectorOverlay | null) {
  return hasPolygonOverlayFeatures(vectorOverlay?.geojson.features ?? []);
}

export function hasPolygonOverlayFeatures(features: unknown[]) {
  return features.some(isPolygonFeature);
}

function isPolygonFeature(feature: unknown) {
  if (!feature || typeof feature !== 'object') {
    return false;
  }

  const geometry = (feature as { geometry?: { type?: unknown } }).geometry;
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}
