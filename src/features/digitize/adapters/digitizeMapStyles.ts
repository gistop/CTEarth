import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style.js';
import type { UploadedLayerStyle, VectorOverlayStyle } from '../../../gisStore';

export type DigitizeFeatureStyle = { uploadedStyle?: UploadedLayerStyle; bufferStyle?: VectorOverlayStyle; selected?: boolean };

export function createReferenceStyle(metadata: DigitizeFeatureStyle, defaultStyle: UploadedLayerStyle) {
  const bufferStyle = metadata.bufferStyle;
  const uploadedStyle = metadata.uploadedStyle;
  const selected = Boolean(metadata.selected);
  const fillColor = bufferStyle
    ? hexToRgba(bufferStyle.fillColor, bufferStyle.fillOpacity)
    : hexToRgba(uploadedStyle?.fillColor ?? defaultStyle.fillColor, uploadedStyle?.fillOpacity ?? defaultStyle.fillOpacity);
  const strokeColor = selected
    ? '#f97316'
    : bufferStyle?.lineColor ?? uploadedStyle?.lineColor ?? defaultStyle.lineColor;

  return new Style({
    fill: new Fill({ color: fillColor }),
    stroke: new Stroke({
      color: strokeColor,
      width: selected ? 3.5 : bufferStyle?.lineWidth ?? uploadedStyle?.lineWidth ?? defaultStyle.lineWidth,
    }),
    image: new CircleStyle({
      radius: selected ? 8 : uploadedStyle?.pointRadius ?? defaultStyle.pointRadius,
      fill: new Fill({ color: selected ? '#f97316' : uploadedStyle?.pointColor ?? defaultStyle.pointColor }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
  });
}

export function createEditableStyle() {
  return new Style({
    fill: new Fill({ color: 'rgba(15, 118, 110, 0.22)' }),
    stroke: new Stroke({ color: '#0f766e', width: 3 }),
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: '#d6a21f' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
  });
}

export function createRasterAoiStyle() {
  return new Style({
    fill: new Fill({ color: 'rgba(214, 162, 31, 0.18)' }),
    stroke: new Stroke({
      color: '#d6a21f',
      lineDash: [8, 5],
      width: 3,
    }),
  });
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace('#', '');
  const bigint = Number.parseInt(normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized, 16);

  if (!Number.isFinite(bigint)) {
    return `rgba(47, 109, 165, ${opacity})`;
  }

  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

