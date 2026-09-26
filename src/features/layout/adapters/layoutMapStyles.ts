import type { FeatureLike } from 'ol/Feature.js';
import { transformExtent } from 'ol/proj.js';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style.js';
import type { UploadedLayerStyle, VectorOverlayStyle } from '../../../gisStore';
import { createLabelTextStyle, resolveStyleLabelText } from '../../digitize/adapters/digitizeMapStyles';

export function createLayoutUploadedLayerStyle(style: UploadedLayerStyle, scale = 1) {
  return (feature: FeatureLike) => {
    const geometryType = feature.getGeometry()?.getType();
    const isPoint = geometryType === 'Point' || geometryType === 'MultiPoint';
    const isLine = geometryType === 'LineString' || geometryType === 'MultiLineString';
    const isPolygon = geometryType === 'Polygon' || geometryType === 'MultiPolygon';
    const selected = Boolean(feature.get('_selected'));
    const value = String(feature.get('_value') ?? '');
    const labelText = resolveStyleLabelText(style, feature);
    const selectedColor = '#f97316';
    const fillColor = selected ? selectedColor : style.fillColor;
    const lineColor = selected ? selectedColor : style.lineColor;
    const pointColor = selected ? selectedColor : style.pointColor;
    const pointStrokeColor = selected ? '#ffffff' : style.pointStrokeColor;

    const styles: Style[] = [];

    if (isPolygon) {
      styles.push(new Style({
        fill: new Fill({ color: hexToRgba(fillColor, selected ? Math.max(style.fillOpacity, 0.42) : style.fillOpacity) }),
        stroke: new Stroke({ color: lineColor, width: selected ? Math.max(style.lineWidth + 1.5, 3) : style.lineWidth }),
      }));
    }

    if (isLine) {
      styles.push(new Style({
        stroke: new Stroke({ color: lineColor, width: selected ? Math.max(style.lineWidth + 1.5, 3) : style.lineWidth }),
      }));
    }

    if (isPoint) {
      styles.push(new Style({
        image: new CircleStyle({
          radius: selected ? style.pointRadius + 3 : style.pointRadius,
          fill: new Fill({ color: hexToRgba(pointColor, style.pointOpacity) }),
          stroke: new Stroke({ color: pointStrokeColor, width: selected ? Math.max(style.pointStrokeWidth + 1, 2.5) : style.pointStrokeWidth }),
        }),
      }));
    }

    // 与主地图一致：开启字段标注后线/面要素也显示文字；点要素在无标注时回退到数值
    const text = labelText || (isPoint ? value : '');
    if (text) {
      styles.push(new Style({ text: createLabelTextStyle(text, isPoint ? 15 : 0) }));
    }

    return scaleStyles(styles, scale);
  };
}

export function createLayoutVectorOverlayStyle(style: VectorOverlayStyle, scale = 1) {
  return (feature: FeatureLike) => {
    const geometryType = feature.getGeometry()?.getType();
    const isPolygon = geometryType === 'Polygon' || geometryType === 'MultiPolygon';
    const isLine = geometryType === 'LineString' || geometryType === 'MultiLineString';
    const styles: Style[] = [];

    if (isPolygon) {
      styles.push(new Style({
        fill: new Fill({ color: hexToRgba(style.fillColor, style.fillOpacity) }),
        stroke: new Stroke({ color: style.lineColor, width: style.lineWidth }),
      }));
    } else if (isLine) {
      styles.push(new Style({
        stroke: new Stroke({ color: style.lineColor, width: style.lineWidth }),
      }));
    }

    return scaleStyles(styles, scale);
  };
}

function scaleStyles(styles: Style[], scale: number) {
  if (scale === 1) return styles;
  styles.forEach((style) => {
    const stroke = style.getStroke();
    if (stroke) stroke.setWidth((stroke.getWidth() ?? 1) * scale);
    style.getImage()?.setScale(scale);
    const text = style.getText();
    if (text) {
      text.setScale(scale);
      text.setOffsetX(text.getOffsetX() * scale);
      text.setOffsetY(text.getOffsetY() * scale);
    }
  });
  return styles;
}

export function layoutRasterExtent(coordinates: [[number, number], [number, number], [number, number], [number, number]]) {
  const extent: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  coordinates.forEach(([lon, lat]) => {
    extent[0] = Math.min(extent[0], lon);
    extent[1] = Math.min(extent[1], lat);
    extent[2] = Math.max(extent[2], lon);
    extent[3] = Math.max(extent[3], lat);
  });

  return transformExtent(extent, 'EPSG:4326', 'EPSG:3857') as [number, number, number, number];
}

export function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const parsed = Number.parseInt(value, 16);
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function formatLayoutNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);
}

export function isPointLikeLayoutFeature(feature: FeatureLike) {
  const type = feature.getGeometry()?.getType();
  return type === 'Point' || type === 'MultiPoint';
}
