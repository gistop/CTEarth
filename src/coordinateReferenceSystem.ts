export type SourceCrs = {
  epsg?: number;
  name?: string;
  definition?: string;
  assumed?: boolean;
};

export function sourceCrsFromEpsg(epsg: number, assumed = false): SourceCrs {
  return {
    epsg,
    name: epsg === 4326 ? 'WGS 84' : undefined,
    assumed,
  };
}

export function sourceCrsFromDefinition(definition: string | undefined, assumed = false): SourceCrs {
  if (!definition) {
    return { assumed };
  }

  const epsgMatch = definition.match(/(?:EPSG|epsg)[^0-9]{0,12}(\d{3,6})/);

  return {
    ...(epsgMatch ? { epsg: Number(epsgMatch[1]) } : {}),
    definition,
    assumed,
  };
}

export function sourceCrsFromGeoJson(data: unknown): SourceCrs {
  if (!isRecord(data) || !isRecord(data.crs) || !isRecord(data.crs.properties)) {
    return sourceCrsFromEpsg(4326, true);
  }

  const properties = data.crs.properties;
  const name = typeof properties.name === 'string' ? properties.name : undefined;
  const href = typeof properties.href === 'string' ? properties.href : undefined;
  const definition = name ?? href;

  if (!definition) {
    return sourceCrsFromEpsg(4326, true);
  }

  return {
    ...sourceCrsFromDefinition(definition),
    name: definition,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
