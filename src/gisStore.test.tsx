// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTool } from 'geolibre-wasm/tools';
import { CogBuilder } from 'geolibre-wasm';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { collectRasterAoiPixels } from './features/digitize/services/rasterAoiPixels';
import type { RunToolOptions } from 'geolibre-wasm/tools';
import { GisProvider, useGis, type BufferParameters, type GeoJsonFeatureCollection, type TerrainToolId } from './gisStore';
import { readWorkspaceDraft, writeWorkspaceDraft, type WorkspaceDraft } from './workspaceDraftStore';
import { useGisAiPort } from './features/ai/adapters/gisRuntimeAdapter';
import { createGisToolExecutor } from './features/ai/tools/gisToolExecutor';
import { LayerPanel } from './features/layers/components/LayerPanel';
import { MapCommandProvider } from './features/maps/components/map/MapCommandContext';
import { MapBasemapSelectionProvider } from './features/maps/components/map/MapBasemapSelectionContext';
import { AnalysisToolPanel } from './features/toolbox/toolsets/general/components/AnalysisToolPanel';

vi.mock('geolibre-wasm', () => ({
  default: vi.fn(async () => undefined),
  GeoTiffReader: class {
    width = 2;
    height = 2;
    epsg = 4326;
    read_band_f64() { return new Float64Array([1, 2, 3, 4]); }
    geo_transform() { return new Float64Array([120, 0.5, 0, 31, 0, -0.5]); }
  },
  CogBuilder: class {
    set_compression() {}
    set_geo_transform() {}
    set_epsg() {}
    write_f64() { return new Uint8Array([1, 2]); }
    free() {}
  },
}));
vi.mock('geolibre-wasm/tools', () => ({ initTools: vi.fn(async () => undefined), runTool: vi.fn() }));
vi.mock('@ngageoint/geopackage', () => ({}));
vi.mock('shpjs', () => ({ default: vi.fn() }));
vi.mock('./workspaceDraftStore', () => ({
  readWorkspaceDraft: vi.fn(), writeWorkspaceDraft: vi.fn(async () => undefined), deleteWorkspaceDraft: vi.fn(async () => undefined),
}));
vi.mock('./mapGroupDraftStore', () => ({
  readMapGroupDraft: vi.fn(async () => null), writeMapGroupDraft: vi.fn(async () => undefined), deleteMapGroupDraft: vi.fn(async () => undefined),
}));
vi.mock('./features/attributes', () => ({ useAttributeTableActions: () => ({}) }));

const polygon: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { value: 7 }, geometry: {
    type: 'Polygon', coordinates: [[[120, 30], [121, 30], [121, 31], [120, 31], [120, 30]]],
  } }],
};
const bufferParams: BufferParameters = {
  outputName: 'result.geojson', distance: '0.01', quadrantSegments: '8', capStyle: 'round', joinStyle: 'round', dissolve: false,
};

function createDraft(): WorkspaceDraft {
  return {
    version: 2, savedAt: '', activeLayerId: 'points', activeRasterId: 'dem',
    vectorLayers: [
      { id: 'points', fileName: 'points.geojson', selectedField: 'value', selectedFeatureIndexes: [], geojson: {
        type: 'FeatureCollection', features: [
          { type: 'Feature', properties: { value: 5 }, geometry: { type: 'Point', coordinates: [120.5, 30.5] } },
          { type: 'Feature', properties: { value: 8 }, geometry: { type: 'Point', coordinates: [120.6, 30.6] } },
        ],
      } },
      { id: 'mask', fileName: 'mask.geojson', selectedField: '', selectedFeatureIndexes: [], geojson: polygon },
    ],
    rasterLayers: [{ id: 'dem', name: 'dem.tif', toolInput: { inputName: 'dem.tif', files: { 'dem.tif': new Uint8Array([1]) } } }],
    uploadedLayerStyles: {}, uploadedLayerVisibility: { points: true, mask: true },
    rasterLayerVisibility: { dem: true }, rasterStyle: { opacity: 0.82 },
    layerVisibility: { basemap: true, raster: true, vectorOverlay: true },
    layerOrder: ['uploaded:points', 'uploaded:mask', 'raster:dem', 'basemap'],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readWorkspaceDraft).mockResolvedValue(createDraft());
  vi.mocked(runTool).mockImplementation(async (_tool, options) => {
    const outputName = options?.args?.find(arg => arg.startsWith('--output='))?.split('/').at(-1) ?? 'result.geojson';
    return { exitCode: 0, stdout: [], files: {
      [outputName]: outputName.endsWith('.tif') ? new Uint8Array([1, 2]) : new TextEncoder().encode(JSON.stringify(polygon)),
    } };
  });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,result');
  vi.stubGlobal('Worker', class {
    listeners = new Map<string, (event: unknown) => void>();
    addEventListener(type: string, listener: (event: unknown) => void) { this.listeners.set(type, listener); }
    terminate() {}
    postMessage({ id, tool, options }: { id: number; tool: string; options: RunToolOptions }) {
      void runTool(tool, options).then(
        result => this.listeners.get('message')?.({ data: { id, ok: true, result } }),
        error => this.listeners.get('message')?.({ data: { id, ok: false, message: String(error) } }),
      );
    }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function createHarness(showLayers = false) {
  const hook = renderHook(() => ({ gis: useGis(), ...useGisAiPort() }), {
    wrapper: ({ children }) => <GisProvider>
      {children}
      {showLayers && <MapCommandProvider><MapBasemapSelectionProvider>
        <LayerPanel /><AnalysisToolPanel tool='buffer' onBack={() => undefined} />
      </MapBasemapSelectionProvider></MapCommandProvider>}
    </GisProvider>,
  });
  await waitFor(() => expect(hook.result.current.gis.workspaceDraftLoaded).toBe(true));
  return hook;
}

describe('generated layer lifecycle', () => {
  it('exports and displays the same AOI cells as the preview on repeated raster edits', async () => {
    const { result } = await createHarness();
    const original = result.current.gis.raster!;
    const north = fromLonLat([120, 31])[1];
    const south = fromLonLat([120, 30])[1];
    const latitude = toLonLat([0, north - 0.75 * (north - south)])[1];
    const aoi = {
      type: 'Polygon' as const,
      coordinates: [[[120, latitude - 0.0001], [121, latitude - 0.0001], [121, latitude + 0.0001], [120, latitude + 0.0001], [120, latitude - 0.0001]]] as [number, number][][],
    };
    expect(Array.from(collectRasterAoiPixels(aoi, original).sourceIndexes)).toEqual([2, 3]);
    const write = vi.spyOn(CogBuilder.prototype, 'write_f64');

    await act(async () => {
      await result.current.gis.editRasterByAoi({ polygon: aoi, value: '500', outputName: 'aligned.tif' });
    });
    const edited = result.current.gis.raster!;
    expect(edited.id).not.toBe(original.id);
    expect(edited.pixels).toEqual(new Float64Array([1, 2, 500, 500]));
    expect(write).toHaveBeenLastCalledWith(edited.pixels);
    expect(edited.coordinates).toEqual(original.coordinates);
    expect(edited.geoTransform).toEqual(original.geoTransform);
    expect(edited.displayReprojected).toBe(original.displayReprojected);
    expect(edited.max).toBe(500);
    expect(Array.from(collectRasterAoiPixels(aoi, edited).values)).toEqual([500, 500]);
    expect(original.pixels).toEqual(new Float64Array([1, 2, 3, 4]));
    expect(edited.toolInput.files['aligned.tif']).toEqual(new Uint8Array([1, 2]));

    await act(async () => {
      await result.current.gis.editRasterByAoi({ polygon: aoi, value: '600' });
    });
    expect(result.current.gis.raster!.pixels).toEqual(new Float64Array([1, 2, 600, 600]));
    expect(write).toHaveBeenLastCalledWith(new Float64Array([1, 2, 600, 600]));
  });

  it('appends repeated buffer outputs with independent identity, metadata and display state', async () => {
    const { result } = await createHarness();
    const originalLayers = result.current.gis.layers;
    const originalRaster = result.current.gis.raster;
    await act(async () => { await result.current.gis.runBufferAnalysis(bufferParams); });
    const first = result.current.gis.layer!;
    expect(first.id).not.toBe('points');
    expect(first.fileName).toBe('result.geojson');
    expect(first.fields).toEqual(['value']);
    expect(first.selectedFeatureIndexes).toEqual([]);
    expect(JSON.parse(new TextDecoder().decode(first.toolInput.files[first.toolInput.inputName]))).toEqual(polygon);
    act(() => {
      result.current.gis.setUploadedLayerVisibility(first.id, false);
      result.current.gis.setUploadedLayerStyle(first.id, { fillColor: '#123456' });
      result.current.gis.setLayerVisibility('raster', false);
      result.current.gis.setActiveLayer('points');
    });
    await act(async () => { await result.current.gis.runBufferAnalysis(bufferParams); });
    const second = result.current.gis.layer!;
    expect(second.id).not.toBe(first.id);
    expect(second.fileName).toBe(first.fileName);
    expect(result.current.gis.layers).toEqual([...originalLayers, first, second]);
    expect(result.current.gis.layerOrder.slice(0, 2)).toEqual([`uploaded:${second.id}`, `uploaded:${first.id}`]);
    expect(result.current.gis.uploadedLayerVisibility).toMatchObject({ [first.id]: false, [second.id]: true });
    expect(result.current.gis.uploadedLayerStyles[first.id].fillColor).toBe('#123456');
    expect(result.current.gis.uploadedLayerStyles[second.id].fillColor).not.toBe('#123456');
    expect(result.current.gis.raster).toBe(originalRaster);
    expect(result.current.gis.layerVisibility.raster).toBe(false);
    expect(result.current.gis.vectorOverlay).toBeNull();
  });

  it.each(['intersect', 'union', 'erase'] as const)('appends repeated %s outputs and accepts generated layers as inputs', async tool => {
    const { result } = await createHarness();
    await act(async () => { await result.current.gis.runBufferAnalysis(bufferParams); });
    const buffered = result.current.gis.layer!;
    const params = { inputLayerId: buffered.id, overlayLayerId: 'mask', outputName: bufferParams.outputName, snapTolerance: '' };
    await act(async () => { await result.current.gis.runOverlayAnalysis(tool, params); });
    const first = result.current.gis.layer!;
    await act(async () => { await result.current.gis.runOverlayAnalysis(tool, params); });
    const second = result.current.gis.layer!;
    expect(result.current.gis.layers).toHaveLength(5);
    expect(new Set([buffered.id, first.id, second.id]).size).toBe(3);
    expect(result.current.gis.layers).toContain(buffered);
    expect(result.current.gis.layers).toContain(first);
    expect(result.current.gis.layerOrder.slice(0, 3)).toEqual([`uploaded:${second.id}`, `uploaded:${first.id}`, `uploaded:${buffered.id}`]);
    act(() => { result.current.gis.deleteUploadedLayer(first.id); });
    expect(result.current.gis.layers).not.toContain(first);
    expect(result.current.gis.layer).toBe(second);
  });

  it.each(['buffer', 'intersect', 'union', 'erase'] as const)('preserves all existing layers when %s fails', async tool => {
    const { result } = await createHarness();
    await act(async () => { await result.current.gis.runBufferAnalysis(bufferParams); });
    const before = result.current.gis;
    vi.mocked(runTool).mockResolvedValueOnce({ exitCode: 1, stdout: ['analysis failed'], files: {} });
    await act(async () => {
      if (tool === 'buffer') await result.current.gis.runBufferAnalysis(bufferParams);
      else await result.current.gis.runOverlayAnalysis(tool, { inputLayerId: before.layer!.id, overlayLayerId: 'mask', outputName: 'result.geojson', snapTolerance: '' });
    });
    expect(result.current.gis.layers).toBe(before.layers);
    expect(result.current.gis.rasters).toBe(before.rasters);
    expect(result.current.gis.layerOrder).toBe(before.layerOrder);
    expect(result.current.gis.layer).toBe(before.layer);
    expect(result.current.gis.message).toContain('analysis failed');
  });

  it('supports valid empty overlay results as independent deletable layers', async () => {
    const { result } = await createHarness();
    await act(async () => { await result.current.gis.runBufferAnalysis(bufferParams); });
    const inputLayerId = result.current.gis.layer!.id;
    vi.mocked(runTool).mockResolvedValueOnce({ exitCode: 0, stdout: [], files: {
      'empty.geojson': new TextEncoder().encode(JSON.stringify({ type: 'FeatureCollection', features: [] })),
    } });
    await act(async () => { await result.current.gis.runOverlayAnalysis('erase', { inputLayerId, overlayLayerId: 'mask', outputName: 'empty.geojson', snapTolerance: '' }); });
    const empty = result.current.gis.layer!;
    expect(empty.geojson.features).toEqual([]);
    expect(result.current.gis.layers).toHaveLength(4);
    act(() => { result.current.gis.deleteUploadedLayer(empty.id); });
    expect(result.current.gis.layers).toHaveLength(3);
  });

  it('cleans up only the deleted output and ignores stale deletion targets', async () => {
    const { result } = await createHarness();
    await act(async () => { await result.current.gis.runBufferAnalysis(bufferParams); });
    const generated = result.current.gis.layer!;
    act(() => { result.current.gis.deleteUploadedLayer(generated.id); });
    expect(result.current.gis.layers).toHaveLength(2);
    expect(result.current.gis.layerOrder).not.toContain(`uploaded:${generated.id}`);
    expect(result.current.gis.uploadedLayerStyles).not.toHaveProperty(generated.id);
    expect(result.current.gis.uploadedLayerVisibility).not.toHaveProperty(generated.id);
    const before = result.current.gis;
    act(() => {
      result.current.gis.deleteUploadedLayer(generated.id);
      result.current.gis.deleteRasterLayer('already-deleted');
    });
    expect(result.current.gis.layers).toBe(before.layers);
    expect(result.current.gis.rasters).toBe(before.rasters);
  });

  it('keeps generated layers and rasters when creating a blank vector layer', async () => {
    const { result } = await createHarness();
    await act(async () => { await result.current.gis.runBufferAnalysis(bufferParams); });
    const before = result.current.gis;
    act(() => { result.current.gis.createBlankGeoJsonLayer({ geometryType: 'Polygon', fileName: 'blank' }); });
    expect(result.current.gis.layers.slice(0, -1)).toEqual(before.layers);
    expect(result.current.gis.layer).toMatchObject({ geometryType: 'Polygon', fileName: 'blank.geojson' });
    expect(result.current.gis.rasters).toBe(before.rasters);
    expect(result.current.gis.activeRasterId).toBe(before.activeRasterId);
  });

  it.each(['idw', 'slope', 'aspect', 'hillshade', 'extractByMask', 'rasterEdit'] as const)('adds rather than replaces repeated %s raster outputs', async tool => {
    const { result } = await createHarness();
    const originals = result.current.gis.rasters;
    const run = async () => {
      const gis = result.current.gis;
      if (tool === 'idw') {
        await gis.runIdwInterpolation({ layerId: 'points', field: 'value', outputName: 'result.tif', cellSize: '0.01', weight: '2', radius: '0', minPoints: '0' });
      } else if (tool === 'extractByMask') {
        await gis.runExtractByMask({ maskLayerId: 'mask', outputName: 'result.tif', maintainDimensions: true });
      } else if (tool === 'rasterEdit') {
        await gis.editRasterByAoi({ polygon: { type: 'Polygon', coordinates: [[[120, 30], [121, 30], [121, 31], [120, 31], [120, 30]]] }, value: '9', outputName: 'result.tif' });
      } else {
        await gis.runTerrainAnalysis(tool as TerrainToolId, { outputName: 'result.tif', zFactor: '1', altitude: '45', azimuth: '315', units: 'degrees' });
      }
    };
    await act(run);
    const first = result.current.gis.raster!;
    act(() => { result.current.gis.setRasterLayerVisibility(first.id, false); });
    await act(run);
    const second = result.current.gis.raster!;
    expect(result.current.gis.rasters).toEqual([second, first, ...originals]);
    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe(second.name);
    expect(result.current.gis.rasterLayerVisibility).toMatchObject({ [first.id]: false, [second.id]: true });
    act(() => { result.current.gis.deleteRasterLayer(first.id); });
    expect(result.current.gis.rasters).toEqual([second, ...originals]);
    expect(result.current.gis.layerOrder).not.toContain(`raster:${first.id}`);
    expect(result.current.gis.rasterLayerVisibility).not.toHaveProperty(first.id);
    expect(result.current.gis.raster).toBe(second);
  });

  it('applies the selected mask after IDW interpolation', async () => {
    const { result } = await createHarness();

    await act(async () => {
      await result.current.gis.runIdwInterpolation({
        layerId: 'points',
        field: 'value',
        outputName: 'masked-idw.tif',
        cellSize: '0.01',
        weight: '2',
        radius: '0',
        minPoints: '0',
        maskLayerId: 'mask',
      });
    });

    const calls = vi.mocked(runTool).mock.calls;
    const idwCall = calls.find(([tool]) => tool === 'idw_interpolation');
    const maskCall = calls.find(([tool]) => tool === 'clip_raster_to_polygon');

    expect(idwCall?.[1]?.args).toContain('--output=/work/masked-idw-unmasked.tif');
    expect(maskCall?.[1]?.args).toEqual(expect.arrayContaining([
      '--input=/work/masked-idw-unmasked.tif',
      '--polygons=/work/mask.geojson',
      '--output=/work/masked-idw.tif',
      '--maintain_dimensions=false',
    ]));
    expect(result.current.gis.raster?.name).toBe('masked-idw.tif');
  });
  it('persists, restores and subsequently deletes each generated layer independently', async () => {
    const firstMount = await createHarness();
    vi.useFakeTimers();
    await act(async () => { await firstMount.result.current.gis.runBufferAnalysis(bufferParams); });
    const first = firstMount.result.current.gis.layer!;
    await act(async () => { await firstMount.result.current.gis.runBufferAnalysis(bufferParams); });
    const second = firstMount.result.current.gis.layer!;
    act(() => { firstMount.result.current.gis.setUploadedLayerVisibility(first.id, false); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    const draft = vi.mocked(writeWorkspaceDraft).mock.calls.at(-1)![0];
    expect(draft.vectorLayers.map(layer => layer.id)).toEqual(['points', 'mask', first.id, second.id]);
    firstMount.unmount();
    vi.useRealTimers();
    vi.mocked(readWorkspaceDraft).mockResolvedValue(draft);
    const restored = await createHarness();
    expect(restored.result.current.gis.layers.map(layer => layer.id)).toEqual(draft.vectorLayers.map(layer => layer.id));
    expect(restored.result.current.gis.layer!.id).toBe(second.id);
    expect(restored.result.current.gis.uploadedLayerVisibility[first.id]).toBe(false);
    vi.useFakeTimers();
    act(() => { restored.result.current.gis.deleteUploadedLayer(first.id); });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(vi.mocked(writeWorkspaceDraft).mock.calls.at(-1)![0].vectorLayers.map(layer => layer.id)).toEqual(['points', 'mask', second.id]);
  });

  it('adds outputs across real AI and toolbox paths and enables confirmed deletion in the layer tree', async () => {
    const { result } = await createHarness(true);
    const execute = createGisToolExecutor(result.current.port);
    let aiPending: ReturnType<typeof execute>;
    act(() => { aiPending = execute('buffer_vector', { distance: 0.01, outputName: 'ai-buffer.geojson' }); });
    await waitFor(() => expect(result.current.gis.layers).toHaveLength(3));
    const aiResult = await aiPending!;
    const first = result.current.gis.layer!;
    expect(aiResult).toMatchObject({ status: 'success', data: { resultLayer: { id: first.id, kind: 'vector' } } });
    expect(first.id).not.toBe('vectorOverlay');
    await screen.findByRole('treeitem', { name: 'ai-buffer' });
    fireEvent.click(screen.getByRole('button', { name: '运行' }));
    await waitFor(() => expect(result.current.gis.layers).toHaveLength(4));
    const second = result.current.gis.layer!;
    expect(result.current.gis.layers).toContain(first);
    fireEvent.click(screen.getByRole('treeitem', { name: 'ai-buffer' }));
    const deleteButton = screen.getByRole('button', { name: '删除选中图层或地图' }) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(false);
    fireEvent.click(deleteButton);
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除图层' })).getByRole('button', { name: '取消' }));
    expect(result.current.gis.layers).toContain(first);
    fireEvent.click(deleteButton);
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除图层' })).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(result.current.gis.layers).toHaveLength(3));
    expect(result.current.gis.layers).toContain(second);
    expect(result.current.gis.layers).not.toContain(first);
    expect(screen.queryByRole('treeitem', { name: 'ai-buffer' })).toBeNull();
  });

  it('allows subsequent AI operations on its own output without accepting unrelated layer switches', async () => {
    const { result } = await createHarness();
    const execute = createGisToolExecutor(result.current.port);
    for (const count of [3, 4]) {
      let pending: ReturnType<typeof execute>;
      act(() => { pending = execute('buffer_vector', { distance: 0.01 }); });
      await waitFor(() => expect(result.current.gis.layers).toHaveLength(count));
      expect((await pending!).status).toBe('success');
    }
    const listed = await execute('list_layers', {});
    expect(listed.data).toMatchObject({ layers: result.current.gis.layers.map(layer => ({ id: layer.id })) });
    act(() => { result.current.gis.setActiveLayer('points'); });
    expect(await execute('buffer_vector', { distance: 0.01 })).toMatchObject({ status: 'blocked', error: { code: 'GIS_STATE_CHANGED' } });
    expect(result.current.gis.layers).toHaveLength(4);
  });
});

describe('raster calculator', () => {
  it('adds rather than replaces repeated raster-calculator outputs', async () => {
    const { result } = await createHarness();
    const originals = result.current.gis.rasters;
    const run = async () => {
      await result.current.gis.runRasterCalculator({ expression: '"dem.tif" * 2 + 1', outputName: 'calc.tif' });
    };
    await act(run);
    const first = result.current.gis.raster!;
    act(() => { result.current.gis.setRasterLayerVisibility(first.id, false); });
    await act(run);
    const second = result.current.gis.raster!;
    expect(result.current.gis.rasters).toEqual([second, first, ...originals]);
    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe('calc.tif');
    expect(second.name).toBe(first.name);
    expect(result.current.gis.rasterLayerVisibility).toMatchObject({ [first.id]: false, [second.id]: true });
    expect(result.current.gis.message).toContain('栅格计算完成');
    act(() => { result.current.gis.deleteRasterLayer(first.id); });
    expect(result.current.gis.rasters).toEqual([second, ...originals]);
    expect(result.current.gis.layerOrder).not.toContain(`raster:${first.id}`);
  });

  it('rejects invalid expressions without changing raster state', async () => {
    const { result } = await createHarness();
    const before = result.current.gis;
    await act(async () => {
      await result.current.gis.runRasterCalculator({ expression: '"missing.tif" + 1', outputName: 'calc.tif' });
    });
    expect(result.current.gis.rasters).toBe(before.rasters);
    expect(result.current.gis.isRunning).toBe(false);
    expect(result.current.gis.message).toContain('"missing.tif"');
  });

  it('executes raster_calculator through the AI boundary, chains on its own output and guards unrelated raster changes', async () => {
    const { result } = await createHarness();
    const execute = createGisToolExecutor(result.current.port);
    let pending: ReturnType<typeof execute>;
    act(() => { pending = execute('raster_calculator', { expression: '"dem.tif" * 2' }); });
    await waitFor(() => expect(result.current.gis.rasters).toHaveLength(2));
    const firstResult = await pending!;
    const first = result.current.gis.raster!;
    expect(firstResult).toMatchObject({ status: 'success', data: { resultRaster: { id: first.id, kind: 'raster' }, expression: '"dem.tif" * 2' } });
    expect(first.name).toBe('agent-raster-calculator.tif');

    let chained: ReturnType<typeof execute>;
    act(() => { chained = execute('raster_calculator', { expression: '"agent-raster-calculator.tif" + "dem.tif"', outputName: 'chain.tif' }); });
    await waitFor(() => expect(result.current.gis.rasters).toHaveLength(3));
    expect((await chained!).status).toBe('success');

    act(() => { result.current.gis.deleteRasterLayer(result.current.gis.raster!.id); });
    expect(await execute('raster_calculator', { expression: '"dem.tif" + 1' })).toMatchObject({ status: 'blocked', error: { code: 'GIS_STATE_CHANGED' } });
    expect(result.current.gis.rasters).toHaveLength(2);
  });

  it('renders the toolbox form, disables invalid runs and executes valid expressions', async () => {
    let snapshot: ReturnType<typeof useGis> | null = null;
    function Probe() {
      snapshot = useGis();
      return null;
    }
    render(
      <GisProvider>
        <AnalysisToolPanel tool='rasterCalculator' onBack={() => undefined} />
        <Probe />
      </GisProvider>,
    );
    await waitFor(() => expect(snapshot?.workspaceDraftLoaded).toBe(true));
    const expression = screen.getByRole('textbox', { name: /地图代数表达式/ });
    const runButton = () => screen.getByRole('button', { name: '运行' }) as HTMLButtonElement;
    expect(runButton().disabled).toBe(true);

    fireEvent.change(expression, { target: { value: '"missing.tif" + 1' } });
    expect(runButton().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('"missing.tif"');

    fireEvent.change(expression, { target: { value: '"dem.tif" * 2 + 1' } });
    expect(runButton().disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(runButton());
    await waitFor(() => expect(snapshot!.rasters).toHaveLength(2));
    expect(snapshot!.message).toContain('栅格计算完成');
  });
});

describe('raster reclassify', () => {
  it('adds rather than replaces repeated raster-reclassify outputs', async () => {
    const { result } = await createHarness();
    const originals = result.current.gis.rasters;
    const run = async () => {
      await result.current.gis.runRasterReclassify({
        rasterId: 'dem', method: 'jenks', classCount: '2', customBreaks: '', outputName: 'reclass.tif',
      });
    };
    await act(run);
    const first = result.current.gis.raster!;
    act(() => { result.current.gis.setRasterLayerVisibility(first.id, false); });
    await act(run);
    const second = result.current.gis.raster!;
    expect(result.current.gis.rasters).toEqual([second, first, ...originals]);
    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe('reclass.tif');
    expect(result.current.gis.rasterLayerVisibility).toMatchObject({ [first.id]: false, [second.id]: true });
    expect(result.current.gis.message).toContain('重分类完成');
    act(() => { result.current.gis.deleteRasterLayer(first.id); });
    expect(result.current.gis.rasters).toEqual([second, ...originals]);
  });

  it('rejects invalid reclassify parameters without changing raster state', async () => {
    const { result } = await createHarness();
    const before = result.current.gis;
    await act(async () => {
      await result.current.gis.runRasterReclassify({
        rasterId: 'dem', method: 'custom', classCount: '3', customBreaks: '9, 3', outputName: 'reclass.tif',
      });
    });
    expect(result.current.gis.rasters).toBe(before.rasters);
    expect(result.current.gis.isRunning).toBe(false);
    expect(result.current.gis.message).toContain('严格递增');
  });

  it('executes raster_reclassify through the AI boundary, chains on its own output and guards unrelated raster changes', async () => {
    const { result } = await createHarness();
    const execute = createGisToolExecutor(result.current.port);
    let pending: ReturnType<typeof execute>;
    act(() => { pending = execute('raster_reclassify', { method: 'jenks', classCount: 2 }); });
    await waitFor(() => expect(result.current.gis.rasters).toHaveLength(2));
    const firstResult = await pending!;
    const first = result.current.gis.raster!;
    expect(firstResult).toMatchObject({
      status: 'success',
      data: { resultRaster: { id: first.id, kind: 'raster' }, method: 'jenks', classCount: 2, breaks: [2] },
    });
    expect(first.name).toBe('agent-raster-reclassify.tif');

    let chained: ReturnType<typeof execute>;
    act(() => { chained = execute('raster_reclassify', { method: 'quantile', classCount: 2, rasterName: 'agent-raster-reclassify.tif' }); });
    await waitFor(() => expect(result.current.gis.rasters).toHaveLength(3));
    expect((await chained!).status).toBe('success');

    act(() => { result.current.gis.deleteRasterLayer(result.current.gis.raster!.id); });
    expect(await execute('raster_reclassify', { method: 'jenks', classCount: 2 })).toMatchObject({
      status: 'blocked',
      error: { code: 'GIS_STATE_CHANGED' },
    });
    expect(result.current.gis.rasters).toHaveLength(2);
  });

  it('renders the reclassify form with a class preview and validates custom breaks', async () => {
    let snapshot: ReturnType<typeof useGis> | null = null;
    function Probe() {
      snapshot = useGis();
      return null;
    }
    render(
      <GisProvider>
        <AnalysisToolPanel tool='rasterReclassify' onBack={() => undefined} />
        <Probe />
      </GisProvider>,
    );
    await waitFor(() => expect(snapshot?.workspaceDraftLoaded).toBe(true));
    const runButton = () => screen.getByRole('button', { name: '运行' }) as HTMLButtonElement;

    await waitFor(() => expect(runButton().disabled).toBe(false));
    expect(screen.getByLabelText('分类预览').textContent).toContain('~');

    fireEvent.change(screen.getByRole('combobox', { name: /重分类方法/ }), { target: { value: 'custom' } });
    const breaksInput = screen.getByRole('textbox', { name: /间断点/ });
    expect(runButton().disabled).toBe(true);
    fireEvent.change(breaksInput, { target: { value: '9, 3' } });
    expect(runButton().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('严格递增');

    fireEvent.change(breaksInput, { target: { value: '2, 3' } });
    expect(runButton().disabled).toBe(false);
    fireEvent.click(runButton());
    await waitFor(() => expect(snapshot!.rasters).toHaveLength(2));
    expect(snapshot!.message).toContain('重分类完成');
  });
});

describe('raster resample', () => {
  it('adds rather than replaces repeated raster-resample outputs', async () => {
    const { result } = await createHarness();
    const originals = result.current.gis.rasters;
    const run = async () => {
      await result.current.gis.runRasterResample({ rasterId: 'dem', method: 'bilinear', cellSize: '1', outputName: 'resampled.tif' });
    };
    await act(run);
    const first = result.current.gis.raster!;
    act(() => { result.current.gis.setRasterLayerVisibility(first.id, false); });
    await act(run);
    const second = result.current.gis.raster!;
    expect(result.current.gis.rasters).toEqual([second, first, ...originals]);
    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe('resampled.tif');
    expect(result.current.gis.rasterLayerVisibility).toMatchObject({ [first.id]: false, [second.id]: true });
    expect(result.current.gis.message).toContain('重采样完成');
    act(() => { result.current.gis.deleteRasterLayer(first.id); });
    expect(result.current.gis.rasters).toEqual([second, ...originals]);
  });

  it('keeps the current resolution when the cell size is omitted and rejects invalid sizes', async () => {
    const { result } = await createHarness();
    const before = result.current.gis;
    await act(async () => {
      await result.current.gis.runRasterResample({ rasterId: 'dem', method: 'nearest', cellSize: '', outputName: 'same.tif' });
    });
    expect(result.current.gis.rasters).toHaveLength(before.rasters.length + 1);
    const same = result.current.gis.raster!;
    expect(same.width).toBe(before.raster!.width);
    expect(same.height).toBe(before.raster!.height);
    const afterFirst = result.current.gis.rasters;

    await act(async () => {
      await result.current.gis.runRasterResample({ rasterId: 'dem', method: 'nearest', cellSize: '0', outputName: 'bad.tif' });
    });
    expect(result.current.gis.rasters).toBe(afterFirst);
    expect(result.current.gis.isRunning).toBe(false);
    expect(result.current.gis.message).toContain('大于 0');
  });

  it('executes raster_resample through the AI boundary, chains on its own output and guards unrelated raster changes', async () => {
    const { result } = await createHarness();
    const execute = createGisToolExecutor(result.current.port);
    let pending: ReturnType<typeof execute>;
    act(() => { pending = execute('raster_resample', { method: 'majority', cellSize: 1 }); });
    await waitFor(() => expect(result.current.gis.rasters).toHaveLength(2));
    const firstResult = await pending!;
    const first = result.current.gis.raster!;
    expect(firstResult).toMatchObject({
      status: 'success',
      data: { resultRaster: { id: first.id, kind: 'raster' }, method: 'majority', outputCellSize: 1 },
    });
    expect(first.name).toBe('agent-raster-resample.tif');

    let chained: ReturnType<typeof execute>;
    act(() => { chained = execute('raster_resample', { method: 'nearest', rasterName: 'agent-raster-resample.tif' }); });
    await waitFor(() => expect(result.current.gis.rasters).toHaveLength(3));
    expect((await chained!).status).toBe('success');

    act(() => { result.current.gis.deleteRasterLayer(result.current.gis.raster!.id); });
    expect(await execute('raster_resample', { method: 'nearest' })).toMatchObject({
      status: 'blocked',
      error: { code: 'GIS_STATE_CHANGED' },
    });
    expect(result.current.gis.rasters).toHaveLength(2);
  });

  it('renders the resample form, previews the output grid and validates the cell size', async () => {
    let snapshot: ReturnType<typeof useGis> | null = null;
    function Probe() {
      snapshot = useGis();
      return null;
    }
    render(
      <GisProvider>
        <AnalysisToolPanel tool='rasterResample' onBack={() => undefined} />
        <Probe />
      </GisProvider>,
    );
    await waitFor(() => expect(snapshot?.workspaceDraftLoaded).toBe(true));
    const runButton = () => screen.getByRole('button', { name: '运行' }) as HTMLButtonElement;

    await waitFor(() => expect(runButton().disabled).toBe(false));
    expect(screen.getByText(/2 x 2 像元/)).toBeTruthy();

    const cellSizeInput = screen.getByRole('spinbutton', { name: /输出像元大小/ });
    fireEvent.change(cellSizeInput, { target: { value: '0' } });
    expect(runButton().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('大于 0');

    fireEvent.change(cellSizeInput, { target: { value: '1' } });
    expect(runButton().disabled).toBe(false);
    fireEvent.click(runButton());
    await waitFor(() => expect(snapshot!.rasters).toHaveLength(2));
    expect(snapshot!.message).toContain('重采样完成');
  });
});

describe('raster swipe', () => {
  it('targets the selected raster, follows selection changes and clears when it is deleted', async () => {
    const { result } = await createHarness();
    expect(result.current.gis.raster?.id).toBe('dem');

    act(() => { result.current.gis.toggleRasterSwipe(); });
    expect(result.current.gis.swipeRasterId).toBe('dem');

    // 新栅格成为活动（选中）图层后，卷帘目标自动跟随。
    await act(async () => {
      await result.current.gis.runRasterCalculator({ expression: '"dem.tif" * 2', outputName: 'calc.tif' });
    });
    const calc = result.current.gis.raster!;
    expect(calc.id).not.toBe('dem');
    await waitFor(() => expect(result.current.gis.swipeRasterId).toBe(calc.id));

    act(() => { result.current.gis.setActiveRaster('dem'); });
    expect(result.current.gis.swipeRasterId).toBe('dem');

    act(() => { result.current.gis.toggleRasterSwipe(); });
    expect(result.current.gis.swipeRasterId).toBeNull();

    act(() => { result.current.gis.toggleRasterSwipe('dem'); });
    expect(result.current.gis.swipeRasterId).toBe('dem');
    act(() => { result.current.gis.deleteRasterLayer('dem'); });
    await waitFor(() => expect(result.current.gis.swipeRasterId).toBeNull());

    act(() => { result.current.gis.disableRasterSwipe(); });
    expect(result.current.gis.swipeRasterId).toBeNull();
  });
});

describe('raster styles', () => {
  it('applies opacity per raster without affecting other rasters', async () => {
    const { result } = await createHarness();
    await act(async () => {
      await result.current.gis.runRasterCalculator({ expression: '"dem.tif" * 2', outputName: 'calc.tif' });
    });
    const calc = result.current.gis.raster!;

    expect(result.current.gis.rasterStyles.dem).toEqual({ opacity: 0.82 });
    expect(result.current.gis.rasterStyles[calc.id]).toEqual({ opacity: 0.82 });

    act(() => { result.current.gis.setRasterStyle(calc.id, { opacity: 0.3 }); });
    expect(result.current.gis.rasterStyles[calc.id]).toEqual({ opacity: 0.3 });
    expect(result.current.gis.rasterStyles.dem).toEqual({ opacity: 0.82 });

    act(() => { result.current.gis.setRasterStyle(calc.id, { opacity: 0.55 }); });
    expect(result.current.gis.rasterStyles[calc.id]).toEqual({ opacity: 0.55 });
    expect(result.current.gis.rasterStyles.dem).toEqual({ opacity: 0.82 });

    act(() => { result.current.gis.deleteRasterLayer(calc.id); });
    expect(result.current.gis.rasterStyles[calc.id]).toBeUndefined();
    expect(result.current.gis.rasterStyles.dem).toEqual({ opacity: 0.82 });
  });
});

describe('create blank layer', () => {
  it('opens the dialog from the layer panel, supports geometry selection and creates the layer', async () => {
    const { result } = await createHarness(true);
    const before = result.current.gis.layers.length;

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建空白 GeoJSON 图层…' }));
    expect(screen.getByRole('dialog', { name: '新建空白图层' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('图层名称'), { target: { value: 'roads.geojson' } });
    fireEvent.click(screen.getByRole('radio', { name: '线' }));
    fireEvent.click(screen.getByRole('button', { name: '新建' }));

    await waitFor(() => expect(result.current.gis.layers).toHaveLength(before + 1));
    const created = result.current.gis.layers.at(-1)!;
    expect(created.fileName).toBe('roads.geojson');
    expect(created.geometryType).toBe('LineString');
    expect(result.current.gis.layer!.id).toBe(created.id);
    expect(screen.queryByRole('dialog', { name: '新建空白图层' })).toBeNull();
  });

  it('cancels the dialog without creating anything', async () => {
    const { result } = await createHarness(true);
    const before = result.current.gis.layers;

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建空白 GeoJSON 图层…' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(result.current.gis.layers).toBe(before);
    expect(screen.queryByRole('dialog', { name: '新建空白图层' })).toBeNull();
  });

  it('creates a blank layer through the AI boundary', async () => {
    const { result } = await createHarness();
    const execute = createGisToolExecutor(result.current.port);
    const aiResult = await execute('create_layer', { geometryType: 'Point', fileName: 'wells.geojson' });
    expect(aiResult).toMatchObject({ status: 'success', data: { resultLayer: { name: 'wells.geojson', kind: 'vector' } } });
    await waitFor(() => expect(result.current.gis.layers.at(-1)!.fileName).toBe('wells.geojson'));
    const created = result.current.gis.layers.at(-1)!;
    expect(created.geometryType).toBe('Point');
    await waitFor(() => expect(result.current.gis.layer!.id).toBe(created.id));
  });
});

describe('create map group', () => {
  it('opens a dialog with the next default name, validates duplicates and creates the map', async () => {
    await createHarness(true);
    const promptSpy = vi.spyOn(window, 'prompt');
    const alertSpy = vi.spyOn(window, 'alert');

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建项目…' }));
    expect(screen.getByRole('dialog', { name: '新建项目' })).toBeTruthy();
    expect(promptSpy).not.toHaveBeenCalled();

    const nameInput = screen.getByLabelText('项目名称') as HTMLInputElement;
    expect(nameInput.value).toBe('项目 2');

    fireEvent.change(nameInput, { target: { value: '项目' } });
    expect(screen.getByRole('alert').textContent).toContain('项目名称不能重复');
    expect((screen.getByRole('button', { name: '新建' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: '   ' } });
    expect(screen.getByRole('alert').textContent).toContain('不能为空');

    fireEvent.change(nameInput, { target: { value: '规划图' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '新建' }));

    expect(await screen.findByRole('treeitem', { name: '规划图' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: '项目' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '新建项目' })).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('cancels the dialog without creating a map or touching GIS data', async () => {
    const { result } = await createHarness(true);
    const before = result.current.gis.rasters;

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建项目…' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('dialog', { name: '新建项目' })).toBeNull();
    expect(screen.queryByRole('treeitem', { name: '项目 2' })).toBeNull();
    expect(result.current.gis.rasters).toBe(before);
  });
});

describe('delete selected map', () => {
  it('deletes the current map after confirmation, migrates its layers and keeps the last map undeletable', async () => {
    const { result } = await createHarness(true);
    const layerCountBefore = result.current.gis.layers.length;
    await screen.findByRole('treeitem', { name: 'points' });

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '新建项目…' }));
    fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: '规划图' } });
    fireEvent.click(screen.getByRole('button', { name: '新建' }));
    expect(await screen.findByRole('treeitem', { name: '规划图' })).toBeTruthy();

    const deleteButton = screen.getByRole('button', { name: '删除选中图层或地图' }) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(false);
    fireEvent.click(deleteButton);

    const dialog = screen.getByRole('dialog', { name: '删除地图' });
    expect(dialog.textContent).toContain('地图');
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.getByRole('treeitem', { name: '项目' })).toBeTruthy();

    fireEvent.click(deleteButton);
    fireEvent.click(within(screen.getByRole('dialog', { name: '删除地图' })).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(screen.queryByRole('treeitem', { name: '项目' })).toBeNull());
    expect(screen.getByRole('treeitem', { name: '规划图' })).toBeTruthy();
    expect(await screen.findByRole('treeitem', { name: 'points' })).toBeTruthy();
    expect(result.current.gis.layers).toHaveLength(layerCountBefore);
    expect(deleteButton.disabled).toBe(true);
  });
});
