import { paperPresets } from '../constants';
import type { LayoutExportFormat, LayoutExportResult, LayoutMapSnapshot, LayoutRect, LayoutState } from '../types';
import { assertExportActive } from './layoutExportController';
import { createRasterPdf } from './layoutPdfService';

export const layoutExportDpi = 300;
export const exportPxPerMm = layoutExportDpi / 25.4;

export function getExportPixelSize(widthMm: number, heightMm: number) {
  const width = Math.round(widthMm * exportPxPerMm);
  const height = Math.round(heightMm * exportPxPerMm);
  if (![width, height].every((value) => Number.isFinite(value) && value > 0) || width * height > 25000000) {
    throw new Error('导出画布尺寸无效或超过像素预算。');
  }
  return { width, height };
}

export function calculateScaleBar(widthMm: number, groundMetersPerMm: number) {
  const available = widthMm * 0.84 * groundMetersPerMm;
  if (!(available > 0) || !Number.isFinite(available)) throw new Error('无法计算当前地图比例尺。');
  const magnitude = 10 ** Math.floor(Math.log10(available));
  const distance = (available / magnitude >= 5 ? 5 : available / magnitude >= 2 ? 2 : 1) * magnitude;
  return { widthMm: distance / groundMetersPerMm, label: distance >= 1000 ? `${Number((distance / 1000).toPrecision(6))} km` : `${Number(distance.toPrecision(6))} m` };
}

export async function exportLayout(
  state: LayoutState,
  format: LayoutExportFormat,
  map: LayoutMapSnapshot | null,
  signal?: AbortSignal,
): Promise<LayoutExportResult> {
  if (format !== 'pdf' && format !== 'png') throw new Error('不支持的布局导出格式。');
  assertExportActive(signal);
  await document.fonts?.ready?.catch(() => undefined);
  assertExportActive(signal);
  const paper = paperPresets[state.paperId];
  const size = getExportPixelSize(paper.widthMm, paper.heightMm);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建导出画布。');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const warnings: string[] = [];

  for (const id of state.enabledElements) {
    const rect = state.rects[id];
    context.save();
    context.translate(rect.x * exportPxPerMm, rect.y * exportPxPerMm);
    const width = rect.width * exportPxPerMm;
    const height = rect.height * exportPxPerMm;
    if (id === 'map-frame') {
      if (!map) throw new Error('地图快照尚未准备好，未导出不完整的地图。');
      context.drawImage(map.canvas, 0, 0, width, height);
    } else if (id === 'title') {
      context.fillStyle = '#1f2f3d';
      context.font = `700 ${Math.max(24, height * 0.52)}px 'Segoe UI', 'Microsoft YaHei', sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('地图标题', width / 2, height / 2, width);
    } else if (id === 'north-arrow') {
      drawNorthArrow(context, width, height, map?.rotation ?? state.mapView?.rotation ?? 0);
    } else if (id === 'scale-bar') {
      if (map) drawScaleBar(context, rect, map.groundMetersPerMm);
      else warnings.push('未启用地图框，未输出无法校验的比例尺。');
    }
    context.restore();
  }

  assertExportActive(signal);
  let blob: Blob;
  if (format === 'png') {
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((output) => output ? resolve(output) : reject(new Error('无法生成 PNG 文件。')), 'image/png');
    });
  } else {
    const encoded = canvas.toDataURL('image/jpeg', 0.96).split(',')[1];
    if (!encoded) throw new Error('无法编码 PDF 地图图像。');
    const binary = atob(encoded);
    const image = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    blob = createRasterPdf(image, canvas.width, canvas.height, paper.widthMm, paper.heightMm);
  }
  assertExportActive(signal);
  return { blob, fileName: `${state.paperId}-${layoutExportDpi}dpi.${format}`, warnings };
}

function drawNorthArrow(context: CanvasRenderingContext2D, width: number, height: number, rotation: number) {
  context.translate(width / 2, height / 2);
  context.rotate(rotation);
  context.translate(-width / 2, -height / 2);
  context.fillStyle = '#1e2d39';
  context.beginPath();
  context.moveTo(width / 2, height * 0.08);
  context.lineTo(width * 0.78, height * 0.72);
  context.lineTo(width / 2, height * 0.54);
  context.lineTo(width * 0.22, height * 0.72);
  context.closePath();
  context.fill();
  context.font = `700 ${Math.max(14, height * 0.22)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.fillText('N', width / 2, height);
}

function drawScaleBar(context: CanvasRenderingContext2D, rect: LayoutRect, groundMetersPerMm: number) {
  const scale = calculateScaleBar(rect.width, groundMetersPerMm);
  const width = rect.width * exportPxPerMm;
  const height = rect.height * exportPxPerMm;
  const barWidth = scale.widthMm * exportPxPerMm;
  const barLeft = (width - barWidth) / 2;
  const barTop = height * 0.48;
  const barHeight = Math.max(8, height * 0.22);
  context.strokeStyle = '#1e2d39';
  context.lineWidth = Math.max(2, height * 0.06);
  for (let index = 0; index < 4; index += 1) {
    context.fillStyle = index % 2 === 0 ? '#1e2d39' : '#ffffff';
    context.fillRect(barLeft + index * barWidth / 4, barTop, barWidth / 4, barHeight);
    context.strokeRect(barLeft + index * barWidth / 4, barTop, barWidth / 4, barHeight);
  }
  context.fillStyle = '#1f2f3d';
  context.font = `${Math.max(10, height * 0.22)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText('0', barLeft, barTop + barHeight + height * 0.08);
  context.fillText(scale.label, barLeft + barWidth, barTop + barHeight + height * 0.08);
}
