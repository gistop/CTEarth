import { describe, expect, it } from 'vitest';
import { parseCoordinateQuery } from './mapSearchService';

describe('parseCoordinateQuery', () => {
  it('accepts longitude latitude input', () => {
    expect(parseCoordinateQuery('121.4737, 31.2304')).toEqual({
      kind: 'point',
      longitude: 121.4737,
      latitude: 31.2304,
    });
  });

  it('rejects an ambiguous pair and invalid ranges', () => {
    expect(parseCoordinateQuery('31.2304 181')).toBeNull();
    expect(parseCoordinateQuery('31.2304 121.4737')).toEqual({
      kind: 'point',
      longitude: 121.4737,
      latitude: 31.2304,
    });
  });

  it('rejects invalid input', () => {
    expect(parseCoordinateQuery('')).toBeNull();
    expect(parseCoordinateQuery('200, 95')).toBeNull();
    expect(parseCoordinateQuery('Shanghai')).toBeNull();
  });
});
