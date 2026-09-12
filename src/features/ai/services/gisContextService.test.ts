import { describe, expect, it } from 'vitest';
import { createGisFixture } from '../testing/fixtures';
import { displayLayerName, getMapAwareActions, getSelectedMapContext, summarizeGisContext } from './gisContextService';

describe('GIS context', () => {
  it('summarizes layers, selections and outputs without uploading geometries or raster pixels', () => {
    const { port } = createGisFixture();
    const context = summarizeGisContext(port.getSnapshot());
    expect(context.layers[0]).toMatchObject({ id: 'roads', fileName: 'roads', selectedFeatureCount: 1, bbox: [120, 30, 120, 30] });
    expect(context.layers[0].selectedFeatures[0]).toMatchObject({ properties: { value: 5 }, geometryType: 'Point' });
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('pixels');
    expect(serialized).not.toContain('toolInput');
    expect(serialized).not.toContain('coordinates');
  });

  it('bounds selection samples and declares truncation explicitly', () => {
    const { port, layer } = createGisFixture();
    layer.selectedFeatureIndexes = Array.from({ length: 200 }, (_, index) => index);
    const context = summarizeGisContext(port.getSnapshot()).layers[0];
    expect(context.selectedFeatureCount).toBe(200);
    expect(context.selectedFeatureIndexes).toHaveLength(100);
    expect(context.selectedFeatureIndexesTruncated).toBe(true);
    expect(context.selectedFeatures.length).toBeLessThanOrEqual(5);
  });

  it('handles nested geometry collections and ignores non-finite coordinates', () => {
    const { port, layer } = createGisFixture();
    layer.geojson = {
      type: 'FeatureCollection',
      features: [{ geometry: { type: 'GeometryCollection', geometries: [{ type: 'GeometryCollection', geometries: [
        { type: 'Point', coordinates: [10, 20] }, { type: 'Point', coordinates: [Infinity, 30] },
      ] }] } }],
    };
    expect(summarizeGisContext(port.getSnapshot()).layers[0].bbox).toEqual([10, 20, 10, 20]);
    layer.geojson = { type: 'FeatureCollection', features: [] };
    expect(summarizeGisContext(port.getSnapshot()).layers[0].bbox).toBeNull();
  });

  it('preserves map-aware suggestions without depending on React', () => {
    const { port, layer } = createGisFixture();
    const context = getSelectedMapContext(port.getSnapshot());
    expect(context).toMatchObject({ layerName: 'roads', geometryLabel: '点', selectedCount: 1 });
    expect(getMapAwareActions(context!).map((action) => action.label)).toContain('缓冲区');
    layer.selectedFeatureIndexes = [];
    expect(getSelectedMapContext(port.getSnapshot())).toBeNull();
  });

  it.each([
    ['C:\\data\\roads.geojson.zip', 'roads'], ['/data/roads.tif', 'roads'], ['', 'layer'], ['.geojson', 'layer'],
  ])('keeps the shared layer-name behavior for %s', (input, expected) => {
    expect(displayLayerName(input)).toBe(expected);
  });
});
