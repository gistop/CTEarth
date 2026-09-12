// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLayoutState } from './layoutDocumentService';
import { calculateScaleBar, exportLayout, exportPxPerMm, getExportPixelSize } from './layoutExportService';

const context = {
  fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
  fillRect: vi.fn(), strokeRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(),
  drawImage: vi.fn(), fillText: vi.fn(), rotate: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
  lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })));
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,/9j/2Q==');
});
afterEach(() => vi.restoreAllMocks());

describe('layout export service', () => {
  it('uses 300 DPI while bounding total pixel allocations', () => {
    expect(getExportPixelSize(297, 210)).toEqual({ width: 3508, height: 2480 });
    expect(getExportPixelSize(420, 297)).toEqual({ width: 4961, height: 3508 });
    expect(() => getExportPixelSize(10000, 10000)).toThrow('像素预算');
    expect(() => getExportPixelSize(0, 210)).toThrow();
    expect(() => getExportPixelSize(NaN, 210)).toThrow();
  });

  it('calculates geographically meaningful scale labels instead of a fixed value', () => {
    expect(calculateScaleBar(52, 100)).toEqual({ widthMm: 20, label: '2 km' });
    expect(calculateScaleBar(52, 1)).toEqual({ widthMm: 20, label: '20 m' });
    expect(calculateScaleBar(52, 0.001)).toEqual({ widthMm: 20, label: '0.02 m' });
    expect(() => calculateScaleBar(52, 0)).toThrow();
  });

  it('renders in document order using physical dimensions and map rotation', async () => {
    const state = createDefaultLayoutState();
    state.enabledElements = ['title', 'map-frame', 'north-arrow', 'scale-bar'];
    const map = { canvas: document.createElement('canvas'), rotation: Math.PI / 4, groundMetersPerMm: 100 };
    const result = await exportLayout(state, 'png', map);
    expect(result.blob.type).toBe('image/png');
    expect(result.fileName).toBe('a4-landscape-300dpi.png');
    expect(result.warnings).toEqual([]);
    expect(context.fillText.mock.invocationCallOrder[0]).toBeLessThan(context.drawImage.mock.invocationCallOrder[0]);
    expect(context.drawImage).toHaveBeenCalledWith(map.canvas, 0, 0, 188 * exportPxPerMm, 126 * exportPxPerMm);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 4);
    expect(context.fillText).toHaveBeenCalledWith('2 km', expect.any(Number), expect.any(Number));
  });

  it('emits raster PDFs and does not initiate a download', async () => {
    const state = createDefaultLayoutState();
    state.enabledElements = ['title'];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const result = await exportLayout(state, 'pdf', null);
    expect(result.blob.type).toBe('application/pdf');
    expect(result.blob.size).toBeGreaterThan(500);
    expect(result.fileName).toBe('a4-landscape-300dpi.pdf');
    expect(click).not.toHaveBeenCalled();
  });

  it('refuses to export a visible map frame without a snapshot', async () => {
    await expect(exportLayout(createDefaultLayoutState(), 'png', null)).rejects.toThrow('地图快照');
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  });

  it('warns and omits an unverifiable scale bar when the map is disabled', async () => {
    const state = createDefaultLayoutState();
    state.enabledElements = ['scale-bar'];
    const result = await exportLayout(state, 'png', null);
    expect(result.warnings).toEqual([expect.stringContaining('未启用地图框')]);
    expect(context.strokeRect).not.toHaveBeenCalled();
  });

  it('reports encoding failure and rejects cancellation before and after encoding', async () => {
    const state = createDefaultLayoutState();
    state.enabledElements = ['title'];
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => callback(null));
    await expect(exportLayout(state, 'png', null)).rejects.toThrow('无法生成 PNG');
    await expect(exportLayout(state, 'png', null, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
    const controller = new AbortController();
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => { controller.abort(); callback(new Blob(['png'])); });
    await expect(exportLayout(state, 'png', null, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
