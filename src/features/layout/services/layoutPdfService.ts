export function createRasterPdf(imageBytes: Uint8Array, imageWidth: number, imageHeight: number, paperWidthMm: number, paperHeightMm: number) {
  if (![imageWidth, imageHeight, paperWidthMm, paperHeightMm].every(value => Number.isFinite(value) && value > 0) || !Number.isInteger(imageWidth) || !Number.isInteger(imageHeight) || imageBytes.length === 0) throw new Error('PDF 图像或纸张尺寸无效。');
  const pageWidthPt = mmToPdfPoints(paperWidthMm);
  const pageHeightPt = mmToPdfPoints(paperHeightMm);
  const content = `q ${pageWidthPt.toFixed(2)} 0 0 ${pageHeightPt.toFixed(2)} 0 0 cm /Im0 Do Q`;
  const contentBytes = encodeAscii(content);
  const chunks: Uint8Array[] = [];
  const offsets = [0];
  let offset = 0;

  const append = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? encodeAscii(chunk) : chunk;
    chunks.push(bytes);
    offset += bytes.length;
  };

  const appendObject = (objectId: number, body: string, stream?: Uint8Array) => {
    offsets[objectId] = offset;
    append(`${objectId} 0 obj\n${body}`);

    if (stream) {
      append('\nstream\n');
      append(stream);
      append('\nendstream');
    }

    append('\nendobj\n');
  };

  append('%PDF-1.4\n% CTEarth\n');
  appendObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  appendObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  appendObject(
    3,
    [
      '<< /Type /Page',
      '/Parent 2 0 R',
      `/MediaBox [0 0 ${pageWidthPt.toFixed(2)} ${pageHeightPt.toFixed(2)}]`,
      '/Resources << /XObject << /Im0 5 0 R >> >>',
      '/Contents 4 0 R',
      '>>',
    ].join(' '),
  );
  appendObject(4, `<< /Length ${contentBytes.length} >>`, contentBytes);
  appendObject(
    5,
    [
      '<< /Type /XObject',
      '/Subtype /Image',
      `/Width ${imageWidth}`,
      `/Height ${imageHeight}`,
      '/ColorSpace /DeviceRGB',
      '/BitsPerComponent 8',
      '/Filter /DCTDecode',
      `/Length ${imageBytes.length}`,
      '>>',
    ].join(' '),
    imageBytes,
  );

  const xrefOffset = offset;
  append('xref\n0 6\n0000000000 65535 f \n');

  for (let objectId = 1; objectId <= 5; objectId += 1) {
    append(`${offsetNumber(offsets[objectId])} 00000 n \n`);
  }

  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const pdfBytes = new Uint8Array(offset);
  let writeOffset = 0;

  chunks.forEach((chunk) => {
    pdfBytes.set(chunk, writeOffset);
    writeOffset += chunk.length;
  });

  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

function encodeAscii(text: string) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function mmToPdfPoints(mm: number) {
  return (mm / 25.4) * 72;
}

function offsetNumber(value: number) {
  return value.toString().padStart(10, '0');
}
