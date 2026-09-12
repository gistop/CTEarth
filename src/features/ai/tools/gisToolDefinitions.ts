import type { AiToolDefinition } from '../types';

export const gisToolDefinitions: AiToolDefinition[] = [
  {
    name: 'list_layers',
    description: 'Inspect the current CTEarth map state, uploaded layers, active layer, numeric fields, and existing analysis outputs.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'buffer_vector',
    description: 'Run the browser WASM vector buffer tool on the active uploaded layer and add the output as a vector overlay.',
    parameters: {
      type: 'object',
      properties: {
        distance: {
        exclusiveMinimum: 0,
          type: 'number',
          description: 'Positive buffer distance in the input layer coordinate units.',
        },
        outputName: {
          type: 'string',
          description: 'Optional output GeoJSON file name.',
        },
        quadrantSegments: {
        minimum: 1,
          type: 'integer',
          description: 'Optional number of segments used to approximate round joins. Default is 8.',
        },
        capStyle: {
          type: 'string',
          enum: ['round', 'flat', 'square'],
          description: 'Optional buffer cap style.',
        },
        joinStyle: {
          type: 'string',
          enum: ['round', 'bevel', 'mitre'],
          description: 'Optional buffer join style.',
        },
        dissolve: {
          type: 'boolean',
          description: 'Whether to dissolve buffer results into one feature.',
        },
      },
      required: ['distance'],
      additionalProperties: false,
    },
  },
  {
    name: 'select_by_value',
    description: 'Select features on the active uploaded layer by comparing one attribute field to a value.',
    parameters: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          description: 'Attribute field name on the active layer.',
        },
        operator: {
          type: 'string',
          enum: ['equals', 'notEquals', 'contains', 'startsWith', 'endsWith', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual', 'isEmpty', 'isNotEmpty'],
          description: 'Attribute comparison operator.',
        },
        value: {
          type: 'string',
          description: 'Comparison value. Omit or leave empty for isEmpty/isNotEmpty.',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether string comparison should be case-sensitive. Default is false.',
        },
        selectionMode: {
          type: 'string',
          enum: ['new', 'add', 'remove', 'subset'],
          description: 'How to apply matches to the current selection set. Default is new.',
        },
      },
      required: ['field', 'operator'],
      additionalProperties: false,
    },
  },
  {
    name: 'select_by_location',
    description: 'Select features on the active uploaded layer by testing a spatial relation against another uploaded layer or the current vector overlay.',
    parameters: {
      type: 'object',
      properties: {
        referenceLayerId: {
          type: 'string',
          description: 'Reference layer id. Use vectorOverlay for the current vector overlay result, or an uploaded layer id from list_layers.',
        },
        relation: {
          type: 'string',
          enum: ['intersects', 'within', 'contains', 'disjoint'],
          description: 'Spatial relation from target features to the reference layer. Default is intersects.',
        },
        selectionMode: {
          type: 'string',
          enum: ['new', 'add', 'remove', 'subset'],
          description: 'How to apply matches to the current selection set. Default is new.',
        },
      },
      required: ['referenceLayerId'],
      additionalProperties: false,
    },
  },
  {
    name: 'hillshade',
    description: 'Run GeoLibre Hillshade on the current DEM GeoTIFF raster and display the output raster.',
    parameters: {
      type: 'object',
      properties: {
        outputName: {
          type: 'string',
          description: 'Optional output GeoTIFF file name.',
        },
        zFactor: {
        exclusiveMinimum: 0,
          type: 'number',
          description: 'Optional vertical exaggeration / Z conversion factor. Default is 1.',
        },
        altitude: {
        minimum: 0,
        maximum: 90,
          type: 'number',
          description: 'Optional illumination altitude in degrees from 0 to 90. Default is 45.',
        },
        azimuth: {
        minimum: 0,
        maximum: 360,
          type: 'number',
          description: 'Optional illumination azimuth in degrees clockwise from north. Default is 315.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'slope',
    description: 'Run GeoLibre Slope on the current DEM GeoTIFF raster and display the output raster.',
    parameters: {
      type: 'object',
      properties: {
        outputName: {
          type: 'string',
          description: 'Optional output GeoTIFF file name.',
        },
        zFactor: {
        exclusiveMinimum: 0,
          type: 'number',
          description: 'Optional Z conversion factor. Default is 1.',
        },
        units: {
          type: 'string',
          enum: ['degrees', 'radians', 'percent'],
          description: 'Slope output units. Default is degrees.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'aspect',
    description: 'Run GeoLibre Aspect on the current DEM GeoTIFF raster and display the output raster.',
    parameters: {
      type: 'object',
      properties: {
        outputName: {
          type: 'string',
          description: 'Optional output GeoTIFF file name.',
        },
        zFactor: {
        exclusiveMinimum: 0,
          type: 'number',
          description: 'Optional Z conversion factor. Default is 1.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'idw_interpolation',
    description: 'Run the browser WASM IDW interpolation tool on the active point layer and add the output as a raster overlay.',
    parameters: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          description: 'Numeric field to interpolate. If omitted, CTEarth uses the active layer selected field.',
        },
        outputName: {
          type: 'string',
          description: 'Optional output GeoTIFF file name.',
        },
        cellSize: {
        exclusiveMinimum: 0,
          type: 'number',
          description: 'Positive output pixel size. For WGS84 lon/lat point layers, meter-sized values such as 1000 are converted to approximate degrees by CTEarth.',
        },
        weight: {
        exclusiveMinimum: 0,
          type: 'number',
          description: 'Positive IDW power parameter. Default is 2.',
        },
        radius: {
        minimum: 0,
          type: 'number',
          description: 'Non-negative search radius. 0 means automatic/no fixed radius.',
        },
        minPoints: {
        minimum: 0,
          type: 'integer',
          description: 'Non-negative minimum point count. Default is 0.',
        },
      },
      additionalProperties: false,
    },
  },
];

