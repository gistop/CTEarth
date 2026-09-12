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
    expect(result).toMatchObject({ ok: true, output: { featureCount: 1, sourceLayerId: 'roads' } });
  });

  it('propagates business failures even if a previous output is visible', async () => {
    const { port, overlay, setSnapshot } = createGisFixture();
    setSnapshot({ vectorOverlay: overlay });
    port.runBufferAnalysis.mockResolvedValue({ ok: false, message: 'Invalid CRS' });
    const result = await createGisToolExecutor(port)('buffer_vector', { distance: 1 });
    expect(result).toMatchObject({ ok: false, status: 'failed', message: 'Invalid CRS' });
  });

  it('keeps zero-match selections successful and preserves comparison whitespace', async () => {
    const { port, selection } = createGisFixture();
    port.selectByValue.mockResolvedValue({ ...selection, selectedCount: 0, matchedCount: 0 });
    const result = await createGisToolExecutor(port)('select_by_value', { field: 'name', operator: 'equals', value: '  test  ' });
    expect(result.ok).toBe(true);
    expect(port.selectByValue).toHaveBeenCalledWith(expect.objectContaining({ value: '  test  ' }));
  });

  it.each([
    ['buffer_vector', { distance: 0 }],
    ['buffer_vector', { distance: 1, quadrantSegments: 0 }],
    ['buffer_vector', { distance: 1, dissolve: 'true' }],
    ['slope', { units: 'meters' }],
    ['hillshade', { altitude: 91 }],
    ['idw_interpolation', { minPoints: 1.5 }],
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
    expect(port.selectByValue).not.toHaveBeenCalled();
    expect(port.selectByLocation).not.toHaveBeenCalled();
  });

  it('blocks an active layer switch while the model is responding', async () => {
    const { port, layer, setSnapshot } = createGisFixture();
    const execute = createGisToolExecutor(port);
    setSnapshot({ layer: { ...layer, id: 'other-layer' } });
    expect((await execute('buffer_vector', { distance: 1 })).status).toBe('blocked');
    expect(port.runBufferAnalysis).not.toHaveBeenCalled();
    expect((await execute('list_layers', {})).ok).toBe(true);
  });

  it('blocks busy GIS operations but allows read-only inspection', async () => {
    const { port, setSnapshot } = createGisFixture();
    setSnapshot({ isRunning: true });
    const execute = createGisToolExecutor(port);
    expect((await execute('list_layers', {})).ok).toBe(true);
    expect((await execute('buffer_vector', { distance: 1 })).status).toBe('blocked');
  });

  it('does not authorize an unrelated layer switch during a completed operation', async () => {
    const { port, layer, overlay, setSnapshot } = createGisFixture();
    port.runBufferAnalysis.mockImplementation(async () => {
      setSnapshot({ layer: { ...layer, id: 'other-layer' } });
      return { ok: true, output: overlay };
    });
    const execute = createGisToolExecutor(port);
    expect((await execute('buffer_vector', { distance: 1 })).ok).toBe(true);
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
      expect((await execute(tool, {})).ok).toBe(true);
      expect(port.runTerrainAnalysis).toHaveBeenCalledWith(tool, expect.objectContaining({ zFactor: '1' }));
    }
  });

  it('does not require WASM for the existing JavaScript selection functions', async () => {
    const { port, setSnapshot, overlay } = createGisFixture();
    setSnapshot({ toolsReady: false, vectorOverlay: overlay });
    const execute = createGisToolExecutor(port);
    expect((await execute('select_by_value', { field: 'value', operator: 'equals', value: '5' })).ok).toBe(true);
    expect((await execute('select_by_location', { referenceLayerId: 'vectorOverlay' })).ok).toBe(true);
    expect(port.selectByValue).toHaveBeenCalledWith(expect.objectContaining({ layerId: 'roads' }));
    expect(port.selectByLocation).toHaveBeenCalledWith(expect.objectContaining({ targetLayerId: 'roads' }));
  });

  it('passes explicit input ids to IDW without changing the business algorithm', async () => {
    const { port } = createGisFixture();
    const result = await createGisToolExecutor(port)('idw_interpolation', { cellSize: 1000 });
    expect(result.ok).toBe(true);
    expect(port.runIdwInterpolation).toHaveBeenCalledWith(expect.objectContaining({ layerId: 'roads', field: 'value', cellSize: '1000' }));
  });

  it('propagates runtime disposal rather than reporting a retriable tool failure', async () => {
    const { port } = createGisFixture();
    port.runBufferAnalysis.mockRejectedValueOnce(new DOMException('disposed', 'AbortError'));
    await expect(createGisToolExecutor(port)('buffer_vector', { distance: 1 })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
