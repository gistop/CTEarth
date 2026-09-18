import type { AiToolDefinition } from '../types';

const overlayParameters: AiToolDefinition['parameters'] = {
  type: 'object',
  properties: {
    inputLayerId: {
      type: 'string',
      description: 'Input polygon layer id from list_layers. Use the real id of an uploaded or previously generated layer.',
    },
    overlayLayerId: {
      type: 'string',
      description: 'Overlay polygon layer id from list_layers. It must be different from inputLayerId.',
    },
    outputName: {
      type: 'string',
      description: 'Optional output GeoJSON file name.',
    },
    snapTolerance: {
      type: 'number',
      minimum: 0,
      description: 'Optional non-negative snapping tolerance in the input layer coordinate units.',
    },
  },
  required: ['inputLayerId', 'overlayLayerId'],
  additionalProperties: false,
};

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
    description: 'Run the browser WASM vector buffer tool on the active vector layer. Add and activate a new independent vector layer without replacing any existing layer, even when output names match. Return its real layer id for subsequent operations.',
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
          description: 'Reference vector layer id from list_layers, including generated analysis layers. Use the real resultLayer.id returned by a preceding analysis; vectorOverlay is only a legacy overlay id when explicitly listed.',
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
    name: 'intersect',
    description: 'Run polygon intersection between two different vector layers. Keep only the areas where the input and overlay layers overlap, add the result as a new independent vector layer, and return its real layer id for subsequent operations.',
    parameters: overlayParameters,
  },
  {
    name: 'union',
    description: 'Run polygon union between two different vector layers. Combine their polygon coverage into a new independent vector layer and return its real layer id for subsequent operations.',
    parameters: overlayParameters,
  },
  {
    name: 'erase',
    description: 'Erase the areas of the input polygon layer that overlap the overlay polygon layer. Add the result as a new independent vector layer and return its real layer id for subsequent operations.',
    parameters: overlayParameters,
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
  {
    name: 'raster_calculator',
    description: 'Evaluate a map-algebra expression cell by cell over the uploaded GeoTIFF rasters and add the result as a new raster. Quote raster names exactly as listed by list_layers, for example "dem.tif" * 2 + "slope.tif".',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Map-algebra expression referencing rasters by name in double quotes. Supports numbers, + - * / %, comparisons < <= > >= == !=, && || !, parentheses, and functions abs sqrt ln log log10 exp pow min max floor ceil round con(condition, trueValue, falseValue) isnull(value).',
        },
        outputName: {
          type: 'string',
          description: 'Optional output GeoTIFF file name.',
        },
      },
      required: ['expression'],
      additionalProperties: false,
    },
  },
  {
    name: 'raster_reclassify',
    description: 'Reclassify a GeoTIFF raster into sequential classes (1..N) and add the result as a new raster. Supports Jenks natural breaks, quantile, equal interval, or custom break values; nodata cells stay nodata.',
    parameters: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['jenks', 'quantile', 'equalInterval', 'custom'],
          description: 'Classification method: jenks natural breaks, quantile, equalInterval, or custom break values.',
        },
        classCount: {
          type: 'integer',
          minimum: 2,
          maximum: 64,
          description: 'Number of classes for jenks, quantile, and equalInterval. Default is 5.',
        },
        customBreaks: {
          type: 'string',
          description: 'Comma-separated strictly ascending break values for the custom method, for example "100,200,500"; classes equal breaks + 1.',
        },
        rasterName: {
          type: 'string',
          description: 'Optional input raster name exactly as listed by list_layers. Defaults to the active raster.',
        },
        outputName: {
          type: 'string',
          description: 'Optional output GeoTIFF file name.',
        },
      },
      required: ['method'],
      additionalProperties: false,
    },
  },
  {
    name: 'raster_resample',
    description: 'Resample a GeoTIFF raster to a new cell size using nearest, bilinear, cubic convolution, or majority resampling, and add the result as a new raster.',
    parameters: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['nearest', 'bilinear', 'cubic', 'majority'],
          description: 'Resampling method. Use nearest for categorical data, bilinear or cubic for continuous surfaces, and majority for downsampling categorical rasters.',
        },
        cellSize: {
        exclusiveMinimum: 0,
          type: 'number',
          description: 'Target cell size in the raster coordinate units. Omit to keep the current cell size.',
        },
        rasterName: {
          type: 'string',
          description: 'Optional input raster name exactly as listed by list_layers. Defaults to the active raster.',
        },
        outputName: {
          type: 'string',
          description: 'Optional output GeoTIFF file name.',
        },
      },
      required: ['method'],
      additionalProperties: false,
    },
  },
];
