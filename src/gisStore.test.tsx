// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTool } from 'geolibre-wasm/tools';
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
    const deleteButton = screen.getByRole('button', { name: '删除选中图层' }) as HTMLButtonElement;
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
