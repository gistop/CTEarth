import { displayLayerName, type UploadedLayer } from '../../gisStore';

export type IdentifiedFeature = {
  field: string;
  layerName: string;
  value: string;
};

export function getIdentifiedFeature(
  layers: UploadedLayer[],
  layerId: string,
  featureIndex: number,
): IdentifiedFeature | null {
  const layer = layers.find((item) => item.id === layerId);
  const feature = layer?.geojson.features[featureIndex];

  if (!layer || !isRecord(feature) || !isRecord(feature.properties)) {
    return null;
  }

  const field = getIdentifyField(layer);

  if (!field) {
    return {
      field: '字段',
      layerName: displayLayerName(layer.fileName),
      value: '无属性字段',
    };
  }

  return {
    field,
    layerName: displayLayerName(layer.fileName),
    value: formatIdentifyValue(feature.properties[field]),
  };
}

export function createIdentifyPopupElement(feature: IdentifiedFeature) {
  const container = document.createElement('div');
  const layer = document.createElement('div');
  const field = document.createElement('div');
  const value = document.createElement('div');

  container.className = 'map-identify-popup';
  layer.className = 'map-identify-layer';
  field.className = 'map-identify-field';
  value.className = 'map-identify-value';

  layer.textContent = feature.layerName;
  field.textContent = feature.field;
  value.textContent = feature.value;

  container.append(layer, field, value);

  return container;
}

function getIdentifyField(layer: UploadedLayer) {
  if (layer.selectedField && layer.fields.includes(layer.selectedField)) {
    return layer.selectedField;
  }

  return layer.fields[0] ?? '';
}

function formatIdentifyValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '空值';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 6 }) : String(value);
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
