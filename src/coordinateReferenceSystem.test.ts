import { describe, expect, it } from 'vitest';
import { sourceCrsFromGeoJson, sourceCrsFromDefinition, sourceCrsFromEpsg } from './coordinateReferenceSystem';

describe('coordinate reference system metadata', () => {
  it('represents known EPSG codes without changing the source declaration', () => {
    expect(sourceCrsFromEpsg(32651)).toMatchObject({ epsg: 32651, assumed: false });
  });

  it('extracts EPSG codes from projection definitions', () => {
    expect(sourceCrsFromDefinition('AUTHORITY[EPSG,3857]')).toMatchObject({ epsg: 3857 });
  });

  it('defaults CRS-less GeoJSON to the RFC 7946 WGS84 convention', () => {
    expect(sourceCrsFromGeoJson({ type: 'FeatureCollection', features: [] })).toMatchObject({ epsg: 4326, assumed: true });
  });
});
