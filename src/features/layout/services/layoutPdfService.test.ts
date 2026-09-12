import { describe, expect, it } from 'vitest';
import { createRasterPdf } from './layoutPdfService';

describe('raster PDF serialization', () => {
  it('writes millimeter paper dimensions, JPEG bytes and correct xref byte offsets', async () => {
    const image = new Uint8Array([255, 216, 0, 128, 254, 255, 217]);
    const blob = createRasterPdf(image, 3508, 2480, 297, 210);
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = Array.from(bytes, (value) => String.fromCharCode(value)).join('');
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(text).toContain('/Width 3508 /Height 2480');
    expect(text).toContain('/Filter /DCTDecode /Length 7');
    const imageStart = text.indexOf('stream\n', text.indexOf('5 0 obj')) + 7;
    expect(bytes.slice(imageStart, imageStart + image.length)).toEqual(image);
    const xrefOffset = Number(text.match(/startxref\n(\d+)/)?.[1]);
    expect(text.slice(xrefOffset, xrefOffset + 4)).toBe('xref');
    const entries = text.slice(xrefOffset).split('\n').slice(3, 8);
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
    expect(text.endsWith('%%EOF')).toBe(true);
  });

  it('rejects invalid inputs instead of emitting a malformed document', () => {
    expect(() => createRasterPdf(new Uint8Array(), 1, 1, 210, 297)).toThrow();
    expect(() => createRasterPdf(new Uint8Array([1]), 1.5, 1, 210, 297)).toThrow();
    expect(() => createRasterPdf(new Uint8Array([1]), 1, 1, NaN, 297)).toThrow();
  });
});
