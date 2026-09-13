import { isDataRecord } from '../../../shared/data-views/dataViewQueryService';
import { validateDataFields } from '../../../shared/data-views/dataFieldService';
import type { DataFieldDefinition } from '../../../shared/data-views/types';

type FieldCollection = { type: 'FeatureCollection'; features: unknown[]; 'ctearth:fields'?: unknown };
const fieldMetadataKey = 'ctearth:fields';

export function readLayerFieldDefinitions(collection: FieldCollection): readonly DataFieldDefinition[] {
  const metadata: unknown = Reflect.get(collection, fieldMetadataKey);
  if (!Array.isArray(metadata)) return [];
  const definitions: DataFieldDefinition[] = [];
  for (const entry of metadata) {
    if (!isDataRecord(entry)) continue;
    const field = entry as DataFieldDefinition;
    try {
      validateDataFields([field], definitions.map(existing => existing.name));
      definitions.push({ name: field.name, alias: field.alias, type: field.type, nullable: field.nullable, defaultValue: field.defaultValue, length: field.length });
    } catch {
      continue;
    }
  }
  return definitions;
}

export function getLayerFields(collection: FieldCollection): string[] {
  const names = new Set(readLayerFieldDefinitions(collection).map(field => field.name));
  for (const feature of collection.features) {
    if (isDataRecord(feature) && isDataRecord(feature.properties)) Object.keys(feature.properties).forEach(name => names.add(name));
  }
  return [...names].sort();
}

export function addLayerFields(collection: FieldCollection, fields: readonly DataFieldDefinition[]): FieldCollection {
  if (!fields.length) throw new Error('请先添加至少一个字段。');
  validateDataFields(fields, getLayerFields(collection));
  const definitions = fields.map(field => ({ ...field }));
  const defaults = Object.fromEntries(definitions.map(field => [field.name, field.defaultValue]));
  const features = collection.features.map(feature => {
    if (!isDataRecord(feature) || feature.type !== 'Feature') throw new Error('图层包含无效要素，未添加任何字段。');
    if (feature.properties != null && !isDataRecord(feature.properties)) throw new Error('图层包含无效属性，未添加任何字段。');
    const properties = isDataRecord(feature.properties) ? feature.properties : {};
    return { ...feature, properties: { ...properties, ...defaults } };
  });
  return { ...collection, features, [fieldMetadataKey]: [...readLayerFieldDefinitions(collection), ...definitions] };
}
