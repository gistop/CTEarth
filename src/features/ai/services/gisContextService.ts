import type { AiGisSnapshot } from '../tools/gisPort';
import { isRecord as isPlainObject } from './aiErrors';
import { displayLayerName } from '../../layers/services/layerService';

export type SelectedMapContext = {
  fieldCount: number;
  geometryLabel: string;
  hasOtherVectorLayers: boolean;
  hasRaster: boolean;
  hasVectorOverlay: boolean;
  layerName: string;
  numericFieldCount: number;
  selectedCount: number;
  totalLayerCount: number;
};

export function getSelectedMapContext(gis: AiGisSnapshot): SelectedMapContext | null {
  const layer = gis.layer;

  if (!layer || layer.selectedFeatureIndexes.length === 0) {
    return null;
  }

  const geometryTypes = layer.selectedFeatureIndexes
    .map((index) => getFeatureGeometryType(layer.geojson.features[index]))
    .filter(Boolean);

  return {
    fieldCount: layer.fields.length,
    geometryLabel: formatGeometryLabel(geometryTypes),
    hasOtherVectorLayers: gis.layers.some((item) => item.id !== layer.id),
    hasRaster: Boolean(gis.raster),
    hasVectorOverlay: Boolean(gis.vectorOverlay),
    layerName: displayLayerName(layer.fileName),
    numericFieldCount: layer.numericFields.length,
    selectedCount: layer.selectedFeatureIndexes.length,
    totalLayerCount: gis.layers.length,
  };
}

export function getMapAwareActions(context: SelectedMapContext) {
  const actions = [
    {
      label: '分析建议',
      prompt: `请基于当前选中的 ${context.selectedCount} 个${context.geometryLabel}要素，结合当前图层和系统已有GIS工具，给出最值得做的分析建议，并说明推荐理由。`,
    },
  ];

  if (context.fieldCount > 0) {
    actions.push({
      label: '查看属性',
      prompt: '请概括当前选中要素的属性信息，优先列出最有代表性的字段和值，并指出哪些字段适合继续分析。',
    });
  }

  actions.push({
    label: '缓冲区',
    prompt: '请帮我为当前选中要素所在图层设置缓冲区分析参数。请先建议一个合理距离，并说明当前缓冲区工具会对活动图层执行。',
  });

  if (context.hasOtherVectorLayers || context.hasVectorOverlay) {
    actions.push({
      label: '按位置选择',
      prompt: '请基于当前选中要素，帮我判断是否适合做按位置选择，并给出目标图层、参考图层和空间关系的参数建议。',
    });
  }

  if (context.hasRaster) {
    actions.push({
      label: '地形分析',
      prompt: '请结合当前选中区域和已加载栅格，判断是否适合做坡度、坡向或山体阴影分析，并给出参数建议。',
    });
  }

  return actions.slice(0, 5);
}

function formatGeometryLabel(geometryTypes: string[]) {
  const uniqueTypes = [...new Set(geometryTypes)];

  if (uniqueTypes.length === 0) {
    return '';
  }

  if (uniqueTypes.length > 1) {
    return '混合';
  }

  const type = uniqueTypes[0];

  if (type === 'Point' || type === 'MultiPoint') {
    return '点';
  }

  if (type === 'LineString' || type === 'MultiLineString') {
    return '线';
  }

  if (type === 'Polygon' || type === 'MultiPolygon') {
    return '面';
  }

  return type;
}

function getFeatureGeometryType(feature: unknown) {
  if (!isPlainObject(feature) || !isPlainObject(feature.geometry) || typeof feature.geometry.type !== 'string') {
    return '';
  }

  return feature.geometry.type;
}

const boundsCache = new WeakMap<AiGisSnapshot['layers'][number]['geojson'], [number, number, number, number] | null>();

function layerBbox(layer: AiGisSnapshot['layers'][number]): [number, number, number, number] | null {
  if (boundsCache.has(layer.geojson)) {
    return boundsCache.get(layer.geojson) ?? null;
  }
  let bbox: [number, number, number, number] | null = null;

  for (const feature of layer.geojson.features) {
    const points = featureCoordinatePairs(feature);

    for (const [longitude, latitude] of points) {
      bbox = bbox
        ? [
          Math.min(bbox[0], longitude),
          Math.min(bbox[1], latitude),
          Math.max(bbox[2], longitude),
          Math.max(bbox[3], latitude),
        ]
        : [longitude, latitude, longitude, latitude];
    }
  }

  boundsCache.set(layer.geojson, bbox);
  return bbox;
}

function layerCoordinateHint(layer: AiGisSnapshot['layers'][number]) {
  const bbox = layerBbox(layer);

  if (!bbox) {
    return 'unknown';
  }

  return bbox[0] >= -180 && bbox[2] <= 180 && bbox[1] >= -90 && bbox[3] <= 90
    ? 'likely_wgs84_lonlat_degrees'
    : 'projected_or_local_map_units';
}

function featureCoordinatePairs(feature: unknown) {
  if (!isPlainObject(feature) || !isPlainObject(feature.geometry)) {
    return [];
  }

  const points: [number, number][] = [];
  collectGeometryPairs(feature.geometry, points);

  return points;
}

function collectGeometryPairs(geometry: Record<string, unknown>, points: [number, number][]) {
  collectCoordinatePairs(geometry.coordinates, points);
  if (Array.isArray(geometry.geometries)) {
    geometry.geometries.forEach((child) => {
      if (isPlainObject(child)) {
        collectGeometryPairs(child, points);
      }
    });
  }
}

function collectCoordinatePairs(value: unknown, points: [number, number][]) {
  if (!Array.isArray(value)) {
    return;
  }

  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    if (Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      points.push([value[0], value[1]]);
    }
    return;
  }

  value.forEach((item) => collectCoordinatePairs(item, points));
}

function getFeaturePropertiesPreview(feature: unknown) {
  if (!isPlainObject(feature) || !isPlainObject(feature.properties)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(feature.properties)
      .slice(0, 12)
      .map(([key, value]) => [key, previewPropertyValue(value)]),
  );
}

function previewPropertyValue(value: unknown) {
  if (value === undefined || value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value ?? null;
  }

  if (typeof value === 'string') {
    return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  }

  try {
    const text = JSON.stringify(value);
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  } catch {
    return String(value);
  }
}


export function summarizeGisContext(gis: AiGisSnapshot) {
  return {
    toolsReady: gis.toolsReady,
    isRunning: gis.isRunning,
    message: gis.message,
    activeLayerId: gis.layer?.id ?? null,
    activeLayerName: gis.layer ? displayLayerName(gis.layer.fileName) : null,
    layers: gis.layers.map((layer) => ({
      id: layer.id,
      fileName: displayLayerName(layer.fileName),
      featureCount: layer.geojson.features.length,
      pointCount: layer.points.features.length,
      fields: layer.fields,
      numericFields: layer.numericFields,
      selectedField: layer.selectedField,
      selectedFeatureCount: layer.selectedFeatureIndexes.length,
      bbox: layerBbox(layer),
      coordinateHint: layerCoordinateHint(layer),
      selectedFeatureIndexes: layer.selectedFeatureIndexes.slice(0, 100),
      selectedFeatureIndexesTruncated: layer.selectedFeatureIndexes.length > 100,
      selectedFeatures: layer.selectedFeatureIndexes.slice(0, 5).flatMap((featureIndex) => {
        const feature = layer.geojson.features[featureIndex];

        if (!feature) {
          return [];
        }

        return [{
          featureIndex,
          geometryType: getFeatureGeometryType(feature),
          properties: getFeaturePropertiesPreview(feature),
        }];
      }),
      visible: gis.uploadedLayerVisibility[layer.id] ?? true,
    })),
    outputs: {
      raster: gis.raster ? {
        name: gis.raster.name,
        width: gis.raster.width,
        height: gis.raster.height,
        min: gis.raster.min,
        max: gis.raster.max,
        epsg: gis.raster.epsg ?? null,
        visible: gis.layerVisibility.raster,
      } : null,
      rasters: gis.rasters.map((raster) => ({
        name: raster.name,
        width: raster.width,
        height: raster.height,
        min: raster.min,
        max: raster.max,
        epsg: raster.epsg ?? null,
        active: raster === gis.raster,
      })),
      vectorOverlay: gis.vectorOverlay ? {
        id: 'vectorOverlay',
        name: displayLayerName(gis.vectorOverlay.name),
        featureCount: gis.vectorOverlay.geojson.features.length,
        visible: gis.layerVisibility.vectorOverlay,
      } : null,
    },
  };
}

export { displayLayerName } from '../../layers/services/layerService';
