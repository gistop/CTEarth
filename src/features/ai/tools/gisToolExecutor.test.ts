import { describe, expect, it } from 'vitest';
import { createGisFixture } from '../testing/fixtures';
import { createGisToolExecutor } from './gisToolExecutor';

describe('GIS tool execution boundary', () => {
  it('calls the ordinary GIS buffer action and uses its returned output, not rendered state', async () => {
    const { port } = createGisFixture();
    const execute = createGisToolExecutor(port);
    const result = await execute('buffer_vector', { distance: 500 });
    expect(port.getSnapshot().vectorOverlay).toBeNull();
    expect(port.runBufferAnalysis).toHaveBeenCalledWith({
      distance: '500', outputName: 'agent-buffer.geojson', quadrantSegments: '8', capStyle: 'round', joinStyle: 'round', dissolve: false,
    });
    expect(result).toMatchObject({
      status: 'success',
      data: {
        featureCount: 1,
        sourceLayerId: 'roads',
        distance: 500,
        distanceUnits: 'input-layer-coordinate-units',
        resultLayer: { id: 'buffer-result', kind: 'vector' },
      },
      error: null,
      nextAction: { type: 'none' },
    });
    expect(result).not.toHaveProperty('ok');
    expect(result).not.toHaveProperty('output');
  });

  it('propagates business failures even if a previous output is visible', async () => {
    const { port, overlay, setSnapshot } = createGisFixture();
    setSnapshot({ vectorOverlay: overlay });
    port.runBufferAnalysis.mockResolvedValue({ ok: false, message: 'Invalid CRS' });
    const result = await createGisToolExecutor(port)('buffer_vector', { distance: 1 });
    expect(result).toMatchObject({
      status: 'failed',
      message: 'Invalid CRS',
      data: null,
      error: { code: 'BUFFER_ANALYSIS_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
  });

  it('keeps zero-match selections successful and preserves comparison whitespace', async () => {
    const { port, selection } = createGisFixture();
    port.selectByValue.mockResolvedValue({ ...selection, selectedCount: 0, matchedCount: 0 });
    const result = await createGisToolExecutor(port)('select_by_value', { field: 'name', operator: 'equals', value: '  test  ' });
    expect(result.status).toBe('success');
    expect(port.selectByValue).toHaveBeenCalledWith(expect.objectContaining({ value: '  test  ' }));
  });

  it.each([
    ['buffer_vector', { distance: 0 }],
    ['buffer_vector', { distance: 1, quadrantSegments: 0 }],
    ['buffer_vector', { distance: 1, dissolve: 'true' }],
    ['slope', { units: 'meters' }],
    ['hillshade', { altitude: 91 }],
    ['idw_interpolation', { minPoints: 1.5 }],
    ['raster_calculator', {}],
    ['raster_calculator', { expression: '' }],
    ['raster_calculator', { expression: '"missing.tif" + 1' }],
    ['raster_calculator', { expression: '"dem.tif" *' }],
    ['raster_calculator', { expression: 'dem * 2' }],
    ['raster_reclassify', {}],
    ['raster_reclassify', { method: 'natural' }],
    ['raster_reclassify', { method: 'jenks', classCount: 1.5 }],
    ['raster_reclassify', { method: 'custom' }],
    ['raster_reclassify', { method: 'custom', customBreaks: '5, 3' }],
    ['raster_reclassify', { method: 'jenks', rasterName: 'missing.tif' }],
    ['raster_resample', {}],
    ['raster_resample', { method: 'lanczos' }],
    ['raster_resample', { method: 'nearest', cellSize: 0 }],
    ['raster_resample', { method: 'bilinear', cellSize: 'abc' }],
    ['raster_resample', { method: 'bilinear', rasterName: 'missing.tif' }],
    ['select_by_value', { field: 'missing', operator: 'equals' }],
    ['select_by_location', { referenceLayerId: 'missing' }],
    ['toString', {}],
  ])('validates direct tool entry points too: %s', async (name, input) => {
    const { port } = createGisFixture();
    const result = await createGisToolExecutor(port)(name, input);
    expect(result.status).toBe('blocked');
    expect(port.runBufferAnalysis).not.toHaveBeenCalled();
    expect(port.runTerrainAnalysis).not.toHaveBeenCalled();
    expect(port.runIdwInterpolation).not.toHaveBeenCalled();
    expect(port.runRasterCalculator).not.toHaveBeenCalled();
    expect(port.runRasterReclassify).not.toHaveBeenCalled();
    expect(port.runRasterResample).not.toHaveBeenCalled();
    expect(port.selectByValue).not.toHaveBeenCalled();
    expect(port.selectByLocation).not.toHaveBeenCalled();
  });

  it('blocks an active layer switch while the model is responding', async () => {
    const { port, layer, setSnapshot } = createGisFixture();
    const execute = createGisToolExecutor(port);
    setSnapshot({ layer: { ...layer, id: 'other-layer' } });
    expect((await execute('buffer_vector', { distance: 1 })).status).toBe('blocked');
    expect(port.runBufferAnalysis).not.toHaveBeenCalled();
    expect((await execute('list_layers', {})).status).toBe('success');
  });

  it('blocks busy GIS operations but allows read-only inspection', async () => {
    const { port, setSnapshot } = createGisFixture();
    setSnapshot({ isRunning: true });
    const execute = createGisToolExecutor(port);
    expect((await execute('list_layers', {})).status).toBe('success');
    expect((await execute('buffer_vector', { distance: 1 })).status).toBe('blocked');
  });

  it('does not authorize an unrelated layer switch during a completed operation', async () => {
    const { port, layer, generatedLayer, setSnapshot } = createGisFixture();
    port.runBufferAnalysis.mockImplementation(async () => {
      setSnapshot({ layer: { ...layer, id: 'other-layer' } });
      return { ok: true, output: generatedLayer };
    });
    const execute = createGisToolExecutor(port);
    expect((await execute('buffer_vector', { distance: 1 })).status).toBe('success');
    expect((await execute('buffer_vector', { distance: 1 })).status).toBe('blocked');
    expect(port.runBufferAnalysis).toHaveBeenCalledTimes(1);
  });

  it('rejects already-cancelled executions before any GIS side effects', async () => {
    const { port } = createGisFixture();
    const controller = new AbortController();
    controller.abort();
    await expect(createGisToolExecutor(port)('buffer_vector', { distance: 1 }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(port.runBufferAnalysis).not.toHaveBeenCalled();
  });

  it('runs all existing terrain tools through the same GIS business action', async () => {
    const { port } = createGisFixture();
    const execute = createGisToolExecutor(port);
    for (const tool of ['slope', 'aspect', 'hillshade']) {
      expect((await execute(tool, {})).status).toBe('success');
      expect(port.runTerrainAnalysis).toHaveBeenCalledWith(tool, expect.objectContaining({ zFactor: '1' }));
    }
  });

  it('does not require WASM for the existing JavaScript selection functions', async () => {
    const { port, setSnapshot, overlay } = createGisFixture();
    setSnapshot({ toolsReady: false, vectorOverlay: overlay });
    const execute = createGisToolExecutor(port);
    expect((await execute('select_by_value', { field: 'value', operator: 'equals', value: '5' })).status).toBe('success');
    expect((await execute('select_by_location', { referenceLayerId: 'vectorOverlay' })).status).toBe('success');
    expect(port.selectByValue).toHaveBeenCalledWith(expect.objectContaining({ layerId: 'roads' }));
    expect(port.selectByLocation).toHaveBeenCalledWith(expect.objectContaining({ targetLayerId: 'roads' }));
  });

  it('passes explicit input ids to IDW without changing the business algorithm', async () => {
    const { port } = createGisFixture();
    const result = await createGisToolExecutor(port)('idw_interpolation', { cellSize: 1000 });
    expect(result.status).toBe('success');
    expect(port.runIdwInterpolation).toHaveBeenCalledWith(expect.objectContaining({ layerId: 'roads', field: 'value', cellSize: '1000' }));
  });

  it('executes raster_calculator through the GIS business action and returns a chainable raster result', async () => {
    const { port } = createGisFixture();
    const result = await createGisToolExecutor(port)('raster_calculator', { expression: '"dem.tif" * 2', outputName: 'calc.tif' });
    expect(port.runRasterCalculator).toHaveBeenCalledWith({ expression: '"dem.tif" * 2', outputName: 'calc.tif' });
    expect(result).toMatchObject({
      status: 'success',
      data: {
        resultRaster: { id: 'raster-calculator-result', name: 'raster-calculator.tif', kind: 'raster' },
        rasterId: 'raster-calculator-result',
        expression: '"dem.tif" * 2',
        referencedRasters: ['dem.tif'],
        width: 2,
        height: 2,
      },
      error: null,
      nextAction: { type: 'none' },
    });
  });

  it('propagates raster calculator failures from the business action', async () => {
    const { port } = createGisFixture();
    port.runRasterCalculator.mockResolvedValue({ ok: false, message: 'GeoTIFF 缺少有效的 GeoTransform，无法导出修改结果。' });
    const result = await createGisToolExecutor(port)('raster_calculator', { expression: '"dem.tif" * 2' });
    expect(result).toMatchObject({
      status: 'failed',
      message: 'GeoTIFF 缺少有效的 GeoTransform，无法导出修改结果。',
      data: null,
      error: { code: 'RASTER_CALCULATION_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
  });

  it('blocks raster_calculator while WASM tools are loading and after unrelated raster changes', async () => {
    const { port, raster, setSnapshot } = createGisFixture();
    setSnapshot({ toolsReady: false });
    const execute = createGisToolExecutor(port);
    expect((await execute('raster_calculator', { expression: '"dem.tif" * 2' })).status).toBe('blocked');
    expect(port.runRasterCalculator).not.toHaveBeenCalled();

    setSnapshot({ toolsReady: true });
    expect((await execute('raster_calculator', { expression: '"dem.tif" * 2' })).status).toBe('success');

    setSnapshot({ rasters: [raster, { ...raster, id: 'slope', name: 'slope.tif' }] });
    const result = await execute('raster_calculator', { expression: '"dem.tif" * 2' });
    expect(result).toMatchObject({ status: 'blocked', error: { code: 'GIS_STATE_CHANGED' } });
    expect(port.runRasterCalculator).toHaveBeenCalledTimes(1);
  });

  it('executes raster_reclassify through the GIS business action and returns breaks and class counts', async () => {
    const { port } = createGisFixture();
    const result = await createGisToolExecutor(port)('raster_reclassify', {
      method: 'quantile',
      classCount: 4,
      rasterName: 'dem.tif',
      outputName: 'reclass.tif',
    });
    expect(port.runRasterReclassify).toHaveBeenCalledWith({
      rasterId: 'dem',
      method: 'quantile',
      classCount: '4',
      customBreaks: '',
      outputName: 'reclass.tif',
    });
    expect(result).toMatchObject({
      status: 'success',
      data: {
        resultRaster: { id: 'raster-reclassify-result', name: 'raster-reclassify.tif', kind: 'raster' },
        rasterId: 'raster-reclassify-result',
        method: 'quantile',
        classCount: 3,
        breaks: [2.5, 3.5],
        classHistogram: [1, 1, 2],
        sourceRasterName: 'dem.tif',
      },
      error: null,
      nextAction: { type: 'none' },
    });
  });

  it('defaults raster_reclassify to the active raster and resolves names without the tif extension', async () => {
    const { port } = createGisFixture();
    await createGisToolExecutor(port)('raster_reclassify', { method: 'equalInterval', classCount: 3 });
    expect(port.runRasterReclassify).toHaveBeenCalledWith(expect.objectContaining({
      rasterId: 'dem',
      method: 'equalInterval',
      classCount: '3',
      outputName: 'agent-raster-reclassify.tif',
    }));
    await createGisToolExecutor(port)('raster_reclassify', { method: 'custom', customBreaks: '10, 20' });
    expect(port.runRasterReclassify).toHaveBeenLastCalledWith(expect.objectContaining({ rasterId: 'dem', customBreaks: '10, 20' }));
  });

  it('propagates raster reclassification failures from the business action', async () => {
    const { port } = createGisFixture();
    port.runRasterReclassify.mockResolvedValue({ ok: false, message: '有效像元值全部相同，无法分级。' });
    const result = await createGisToolExecutor(port)('raster_reclassify', { method: 'jenks', classCount: 5 });
    expect(result).toMatchObject({
      status: 'failed',
      message: '有效像元值全部相同，无法分级。',
      data: null,
      error: { code: 'RASTER_RECLASSIFICATION_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
  });

  it('blocks raster_reclassify after unrelated raster changes during the request', async () => {
    const { port, raster, setSnapshot } = createGisFixture();
    const execute = createGisToolExecutor(port);
    expect((await execute('raster_reclassify', { method: 'jenks', classCount: 5 })).status).toBe('success');
    setSnapshot({ rasters: [raster, { ...raster, id: 'slope', name: 'slope.tif' }] });
    expect(await execute('raster_reclassify', { method: 'jenks', classCount: 5 })).toMatchObject({
      status: 'blocked',
      error: { code: 'GIS_STATE_CHANGED' },
    });
    expect(port.runRasterReclassify).toHaveBeenCalledTimes(1);
  });

  it('executes raster_resample through the GIS business action and reports the resolution change', async () => {
    const { port } = createGisFixture();
    const result = await createGisToolExecutor(port)('raster_resample', {
      method: 'bilinear',
      cellSize: 1,
      rasterName: 'dem.tif',
      outputName: 'resampled.tif',
    });
    expect(port.runRasterResample).toHaveBeenCalledWith({
      rasterId: 'dem',
      method: 'bilinear',
      cellSize: '1',
      outputName: 'resampled.tif',
    });
    expect(result).toMatchObject({
      status: 'success',
      data: {
        resultRaster: { id: 'raster-resample-result', name: 'raster-resample.tif', kind: 'raster' },
        rasterId: 'raster-resample-result',
        method: 'bilinear',
        inputCellSize: 0.5,
        outputCellSize: 1,
        validCount: 4,
        sourceRasterName: 'dem.tif',
      },
      error: null,
      nextAction: { type: 'none' },
    });
  });

  it('defaults raster_resample to the active raster and keeps the resolution when cellSize is omitted', async () => {
    const { port } = createGisFixture();
    await createGisToolExecutor(port)('raster_resample', { method: 'majority' });
    expect(port.runRasterResample).toHaveBeenCalledWith({
      rasterId: 'dem',
      method: 'majority',
      cellSize: '',
      outputName: 'agent-raster-resample.tif',
    });
  });

  it('propagates raster resampling failures from the business action', async () => {
    const { port } = createGisFixture();
    port.runRasterResample.mockResolvedValue({ ok: false, message: '仅支持北向上（无旋转）且具有有效像元大小的栅格进行重采样。' });
    const result = await createGisToolExecutor(port)('raster_resample', { method: 'cubic', cellSize: 2 });
    expect(result).toMatchObject({
      status: 'failed',
      message: '仅支持北向上（无旋转）且具有有效像元大小的栅格进行重采样。',
      data: null,
      error: { code: 'RASTER_RESAMPLING_FAILED', retryable: false },
      nextAction: { type: 'none' },
    });
  });

  it.each(['intersect', 'union', 'erase'] as const)('executes %s through the GIS business action and returns a chainable layer result', async (tool) => {
    const { port, layer, setSnapshot } = createGisFixture();
    const polygon = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [[[120, 30], [121, 30], [121, 31], [120, 31], [120, 30]]] },
        properties: { zone: 'a' },
      }],
    };
    const inputLayer = { ...layer, id: 'parcels', fileName: 'parcels.geojson', geojson: polygon, points: { type: 'FeatureCollection' as const, features: [] }, fields: ['zone'], numericFields: [], selectedField: '' };
    const overlayLayer = { ...inputLayer, id: 'protected', fileName: 'protected.geojson' };
    const output = { ...inputLayer, id: `${tool}-result`, fileName: `${tool}.geojson` };
    setSnapshot({ layer: inputLayer, layers: [inputLayer, overlayLayer], vectorOverlay: null });
    port.runOverlayAnalysis.mockResolvedValue({ ok: true, output });

    const result = await createGisToolExecutor(port)(tool, {
      inputLayerId: 'parcels',
      overlayLayerId: 'protected',
      snapTolerance: 0,
    });

    expect(result).toMatchObject({
      status: 'success',
      data: {
        layerId: `${tool}-result`,
        resultLayer: { id: `${tool}-result`, kind: 'vector' },
        featureCount: 1,
        inputLayer: { id: 'parcels', featureCount: 1 },
        overlayLayer: { id: 'protected', featureCount: 1 },
        parameters: { inputLayerId: 'parcels', overlayLayerId: 'protected', snapTolerance: '0' },
      },
    });
    expect(port.runOverlayAnalysis).toHaveBeenCalledWith(tool, {
      inputLayerId: 'parcels',
      overlayLayerId: 'protected',
      outputName: `${tool}.geojson`,
      snapTolerance: '0',
    });
  });

  it('blocks overlay tools when either input is not a polygon layer', async () => {
    const { port, overlay, setSnapshot } = createGisFixture();
    setSnapshot({ vectorOverlay: overlay });
    const result = await createGisToolExecutor(port)('intersect', { inputLayerId: 'roads', overlayLayerId: 'vectorOverlay' });
    expect(result).toMatchObject({ status: 'blocked', error: { code: 'POLYGON_LAYERS_REQUIRED' } });
    expect(port.runOverlayAnalysis).not.toHaveBeenCalled();
  });

  it('propagates runtime disposal rather than reporting a retriable tool failure', async () => {
    const { port } = createGisFixture();
    port.runBufferAnalysis.mockRejectedValueOnce(new DOMException('disposed', 'AbortError'));
    await expect(createGisToolExecutor(port)('buffer_vector', { distance: 1 })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
