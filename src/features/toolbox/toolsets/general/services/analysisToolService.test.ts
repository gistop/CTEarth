import { describe, expect, it } from 'vitest';
import type { UploadedLayer, VectorOverlay } from '../../../../../gisStore';
import {
  defaultMaskLayerId,
  defaultOverlayInputLayerId,
  isOverlayLayerAvailable,
  normalizeOverlayParams,
} from './analysisToolService';

function layer(id: string, geometryType: string): UploadedLayer {
  return {
    id,
    fileName: `${id}.geojson`,
    toolInput: { inputName: `${id}.geojson`, files: {} },
    geojson: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: geometryType, coordinates: [] } }],
    },
    points: { type: 'FeatureCollection', features: [] },
    fields: [],
    numericFields: [],
    selectedField: '',
    selectedFeatureIndexes: [],
  };
}

const polygonOverlay: VectorOverlay = {
  name: 'overlay.geojson',
  geojson: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }],
  },
};

describe('analysisToolService', () => {
  it('uses only polygon sources for masks', () => {
    expect(defaultMaskLayerId([layer('point', 'Point'), layer('polygon', 'Polygon')], null)).toBe('polygon');
  });

  it('allows polygon analysis results as overlay inputs', () => {
    expect(isOverlayLayerAvailable([], polygonOverlay, 'vectorOverlay')).toBe(true);
    expect(defaultOverlayInputLayerId([], undefined, polygonOverlay)).toBe('vectorOverlay');
  });

  it('normalizes invalid or duplicate overlay inputs', () => {
    const layers = [layer('first', 'Polygon'), layer('second', 'MultiPolygon')];
    expect(normalizeOverlayParams({
      inputLayerId: 'missing',
      overlayLayerId: 'missing',
      outputName: 'result.geojson',
      snapTolerance: '',
    }, layers, 'first', null)).toMatchObject({
      inputLayerId: 'first',
      overlayLayerId: 'second',
    });
  });
});
