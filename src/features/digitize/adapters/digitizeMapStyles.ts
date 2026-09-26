import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style.js';
import type Feature from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import type { UploadedLayerStyle, VectorOverlayStyle } from '../../../gisStore';

export type DigitizeFeatureStyle = { uploadedStyle?: UploadedLayerStyle; bufferStyle?: VectorOverlayStyle; selected?: boolean };

export function createReferenceStyle(metadata: DigitizeFeatureStyle, defaultStyle: UploadedLayerStyle, feature?: Feature<Geometry>) {
  const bufferStyle = metadata.bufferStyle;
  const uploadedStyle = metadata.uploadedStyle;
  const selected = Boolean(metadata.selected);
  const fillColor = bufferStyle
    ? hexToRgba(bufferStyle.fillColor, bufferStyle.fillOpacity)
    : hexToRgba(uploadedStyle?.fillColor ?? defaultStyle.fillColor, uploadedStyle?.fillOpacity ?? defaultStyle.fillOpacity);
  const strokeColor = selected
    ? '#f97316'
    : bufferStyle?.lineColor ?? uploadedStyle?.lineColor ?? defaultStyle.lineColor;
  const text = resolveStyleLabelText(uploadedStyle, feature);

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
    ...(text ? { text: createLabelTextStyle(text) } : {}),
  });
}

export function createEditableStyle(text = '') {
  return new Style({
    fill: new Fill({ color: 'rgba(15, 118, 110, 0.22)' }),
    stroke: new Stroke({ color: '#0f766e', width: 3 }),
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: '#d6a21f' }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
    ...(text ? { text: createLabelTextStyle(text) } : {}),
  });
}

/** 按图层样式的标注配置与要素属性解析标注文字；未开启或值无效时返回空串 */
export function resolveStyleLabelText(uploadedStyle: UploadedLayerStyle | undefined, feature?: { get(key: string): unknown }) {
  const field = uploadedStyle?.labelField ?? '';
  if (!uploadedStyle?.labelEnabled || !field || !feature) {
    return '';
  }

  const value = feature.get(field);
  if (value === null || value === undefined || typeof value === 'object') {
    return '';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  return String(value);
}

export function createLabelTextStyle(text: string, offsetY = 0) {
  return new Text({
    font: '12px "Segoe UI", "Microsoft YaHei", sans-serif',
    fill: new Fill({ color: '#1f2933' }),
    stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.92)', width: 3 }),
    overflow: true,
    offsetY,
    text,
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

/**
 * AOI 命中像元的轮廓：蓝绿细线、只描边不填充。
 * 线宽按屏幕像素给（矢量样式），所以放大到像元级别时仍然是细线，且像元内容不被色块遮挡。
 */
export function createRasterAoiOutlineStyle() {
  return new Style({
    stroke: new Stroke({ color: '#0d9488', width: 1.5 }),
  });
}

/** 命中像元的数值标注：深色小字 + 白色描边，保证压在栅格影像上也读得清 */
const rasterPixelValueStyles = new Map<string, Style>();

export function createRasterPixelValueStyle(text: string) {
  const cached = rasterPixelValueStyles.get(text);

  if (cached) {
    return cached;
  }

  if (rasterPixelValueStyles.size > 1000) {
    rasterPixelValueStyles.clear();
  }

  const style = new Style({
    text: new Text({
      font: '11px "Segoe UI", "Microsoft YaHei", sans-serif',
      fill: new Fill({ color: '#1f2933' }),
      stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.92)', width: 3 }),
      overflow: true,
      text,
    }),
  });

  rasterPixelValueStyles.set(text, style);
  return style;
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

