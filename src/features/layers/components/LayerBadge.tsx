import type { CSSProperties } from 'react';
import { Image, Layers, Map as MapIcon } from 'lucide-react';
import {
  defaultUploadedLayerStyle,
  type RasterLayerStyle,
  type UploadedLayerStyle,
  type VectorOverlayStyle,
} from '../../../gisStore';
import type { LayerGeometryKind, LayerListItem } from './layerViewTypes';

type LayerBadgeIcon = React.ComponentType<{ size?: number; strokeWidth?: number }>;
type LayerBadgeStyle = CSSProperties & {
  '--layer-symbol-fill'?: string;
  '--layer-symbol-node-fill'?: string;
};

export type LayerBadgeProps = {
  item: LayerListItem;
  rasterStyle: RasterLayerStyle;
  uploadedLayerStyles: Record<string, UploadedLayerStyle>;
  vectorOverlayStyle: VectorOverlayStyle;
};

export function LayerBadge({ item, rasterStyle, uploadedLayerStyles, vectorOverlayStyle }: LayerBadgeProps) {
  const meta = layerBadgeMetaForItem(item, { rasterStyle, uploadedLayerStyles, vectorOverlayStyle });
  const Icon = meta.icon;

  return (
    <span className={`layer-swatch ${meta.className}`} style={meta.style} title={meta.title} aria-hidden="true">
      <Icon size={12} strokeWidth={2} />
    </span>
  );
}

function PointLayerBadgeIcon({ size = 16, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.25" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth + 0.5} />
    </svg>
  );
}

function LineLayerBadgeIcon({ size = 16, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polyline points="5 17 9 7 15 10 19 18" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5" cy="17" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="9" cy="7" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="15" cy="10" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="19" cy="18" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

function PolygonLayerBadgeIcon({ size = 16, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon
        points="5 17 8 6 16 7 20 18"
        fill="var(--layer-symbol-fill, rgb(48 111 172 / 12%))"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <circle cx="5" cy="17" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="8" cy="6" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="16" cy="7" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="20" cy="18" r="3.1" fill="var(--layer-symbol-node-fill, #fff)" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  );
}

function layerBadgeMetaForItem(
  item: LayerListItem,
  styles: Omit<LayerBadgeProps, 'item'>,
): { className: string; style: LayerBadgeStyle; icon: LayerBadgeIcon; title: string } {
  if (item.kind === 'basemap') {
    return {
      className: 'basemap',
      style: {
        background: 'linear-gradient(135deg, rgb(22 119 184 / 0%) 45%, rgb(22 119 184 / 45%) 45% 55%, rgb(22 119 184 / 0%) 55%), linear-gradient(#dbe9d4 0 44%, #c9dfec 44% 100%)',
        color: '#0f5d8e',
        opacity: item.opacity,
      },
      icon: MapIcon,
      title: '底图',
    };
  }

  if (item.kind === 'raster') {
    return {
      className: 'raster',
      style: {
        background: 'linear-gradient(#d64c36, #f8e058, #22a884, #2962a8)',
        color: '#244b7a',
        opacity: styles.rasterStyle.opacity,
      },
      icon: Image,
      title: '栅格',
    };
  }

  if (item.kind === 'vectorOverlay') {
    return layerBadgeMetaForGeometryKind(item.geometryKind, styles.vectorOverlayStyle);
  }

  return layerBadgeMetaForGeometryKind(
    item.geometryKind,
    styles.uploadedLayerStyles[item.layer.id] ?? defaultUploadedLayerStyle,
  );
}

function layerBadgeMetaForGeometryKind(
  geometryKind: LayerGeometryKind,
  style: UploadedLayerStyle | VectorOverlayStyle,
): { className: string; style: LayerBadgeStyle; icon: LayerBadgeIcon; title: string } {
  if (geometryKind === 'point') {
    return {
      className: 'point',
      style: {
        background: 'transparent',
        borderColor: 'transparent',
        color: 'pointStrokeColor' in style ? style.pointStrokeColor : style.lineColor,
        opacity: 'pointOpacity' in style ? style.pointOpacity : 1,
      },
      icon: PointLayerBadgeIcon,
      title: '点图层',
    };
  }

  if (geometryKind === 'line') {
    return {
      className: 'line',
      style: {
        background: 'transparent',
        borderColor: 'transparent',
        color: style.lineColor,
        opacity: 'lineOpacity' in style ? style.lineOpacity : 1,
      },
      icon: LineLayerBadgeIcon,
      title: '线图层',
    };
  }

  if (geometryKind === 'polygon') {
    return {
      className: 'polygon',
      style: {
        background: 'transparent',
        borderColor: 'transparent',
        color: style.lineColor,
        '--layer-symbol-fill': hexToRgba(style.fillColor, Math.min(style.fillOpacity, 0.28)),
      },
      icon: PolygonLayerBadgeIcon,
      title: '面图层',
    };
  }

  if (geometryKind === 'mixed') {
    return {
      className: 'mixed',
      style: { background: '#eef3f7', borderColor: '#8da1b4', color: '#607486' },
      icon: Layers,
      title: '混合几何图层',
    };
  }

  return {
    className: 'empty',
    style: { background: '#f2f5f8', borderColor: '#b0becb', color: '#7f8b97' },
    icon: Layers,
    title: '空图层',
  };
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!normalized) {
    return hex;
  }

  const [, red, green, blue] = normalized;
  return `rgb(${parseInt(red, 16)} ${parseInt(green, 16)} ${parseInt(blue, 16)} / ${opacity})`;
}
