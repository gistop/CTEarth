import { useEffect, useRef } from 'react';
import Feature, { type FeatureLike } from 'ol/Feature.js';
import Map from 'ol/Map.js';
import Rotate from 'ol/control/Rotate.js';
import ScaleLine from 'ol/control/ScaleLine.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { createEmpty as createExtent, extend as extendExtent, isEmpty as isEmptyExtent } from 'ol/extent.js';
import Graticule from 'ol/layer/Graticule.js';
import ImageLayer from 'ol/layer/Image.js';
import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import View from 'ol/View.js';
import { fromLonLat, transformExtent } from 'ol/proj.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';
import XYZ from 'ol/source/XYZ.js';
import type Geometry from 'ol/geom/Geometry.js';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style.js';
import type { BasemapId } from '../map/MapCommandContext';
import { defaultUploadedLayerStyle, useGis, type UploadedLayerStyle, type VectorOverlayStyle } from '../../gisStore';
import { useMapGroupRenderState } from '../../mapGroupRenderState';
import { useLayout } from './LayoutPanel';

const layoutPreviewCenter: [number, number] = [10.4515, 51.1657];
const layoutPreviewZoom = 5.3;

type LayoutMapPreviewProps = {
  northArrowTarget: HTMLDivElement | null;
  scaleBarTarget: HTMLDivElement | null;
};

export function LayoutMapPreview({ northArrowTarget, scaleBarTarget }: LayoutMapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const viewRef = useRef<View | null>(null);
  const basemapLayersRef = useRef(new globalThis.Map<string, TileLayer<OSM | XYZ>>());
  const graticuleLayerRef = useRef<Graticule | null>(null);
  const rasterLayerRef = useRef<ImageLayer<ImageStatic> | null>(null);
  const vectorOverlaySourceRef = useRef(new VectorSource<Feature<Geometry>>());
  const vectorOverlayLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const uploadedLayersRef = useRef(new globalThis.Map<string, { source: VectorSource<Feature<Geometry>>; layer: VectorLayer<VectorSource<Feature<Geometry>>> }>());
  const scaleLineControlRef = useRef<ScaleLine | null>(null);
  const northArrowControlRef = useRef<Rotate | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const mapGroupRenderState = useMapGroupRenderState();
  const { mapGraticuleVisible } = useLayout();
  const {
    layerVisibility,
    layers,
    raster,
    rasterLayerVisibility,
    rasterStyle,
    uploadedLayerStyles,
    uploadedLayerVisibility,
    vectorOverlay,
    vectorOverlayStyle,
  } = useGis();

  useEffect(() => {
    const container = containerRef.current;

    if (!container || mapRef.current) {
      return;
    }

    const view = new View({
      center: fromLonLat(layoutPreviewCenter),
      zoom: layoutPreviewZoom,
      minZoom: 2,
      maxZoom: 18,
    });
    const rasterLayer = new ImageLayer<ImageStatic>({
      visible: false,
      opacity: rasterStyle.opacity,
    });
    const graticuleLayer = new Graticule({
      showLabels: true,
      strokeStyle: new Stroke({
        color: 'rgba(255, 120, 0, 0.8)',
        width: 1.25,
        lineDash: [5, 5],
      }),
      visible: mapGraticuleVisible,
      wrapX: false,
    });
    const vectorOverlayLayer = new VectorLayer({
      source: vectorOverlaySourceRef.current,
      style: createLayoutVectorOverlayStyle(vectorOverlayStyle),
      visible: false,
    });
    const map = new Map({
      controls: defaultControls({ attribution: false, rotate: false, zoom: false }),
      layers: [
        graticuleLayer,
        rasterLayer,
        vectorOverlayLayer,
      ],
      target: container,
      view,
    });

    graticuleLayerRef.current = graticuleLayer;
    rasterLayerRef.current = rasterLayer;
    vectorOverlayLayerRef.current = vectorOverlayLayer;
    viewRef.current = view;
    mapRef.current = map;

    resizeObserverRef.current = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        map.updateSize();
      });
    });
    resizeObserverRef.current.observe(container);
    window.requestAnimationFrame(() => {
      map.updateSize();
    });

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (scaleLineControlRef.current) {
        map.removeControl(scaleLineControlRef.current);
        scaleLineControlRef.current = null;
      }
      if (northArrowControlRef.current) {
        map.removeControl(northArrowControlRef.current);
        northArrowControlRef.current = null;
      }
      basemapLayersRef.current.forEach((layer) => {
        map.removeLayer(layer);
      });
      basemapLayersRef.current.clear();
      uploadedLayersRef.current.forEach(({ layer }) => {
        map.removeLayer(layer);
      });
      uploadedLayersRef.current.clear();
      map.setTarget(undefined);
      mapRef.current = null;
      viewRef.current = null;
      graticuleLayerRef.current = null;
      rasterLayerRef.current = null;
      vectorOverlayLayerRef.current = null;
    };
  }, [rasterStyle.opacity, vectorOverlayStyle]);

  useEffect(() => {
    const graticuleLayer = graticuleLayerRef.current;

    if (!graticuleLayer) {
      return;
    }

    graticuleLayer.setVisible(mapGraticuleVisible);
  }, [mapGraticuleVisible]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !scaleBarTarget) {
      return;
    }

    if (scaleLineControlRef.current) {
      map.removeControl(scaleLineControlRef.current);
      scaleLineControlRef.current = null;
    }

    const control = new ScaleLine({
      bar: true,
      minWidth: 120,
      steps: 4,
      target: scaleBarTarget,
      text: true,
      units: 'metric',
    });

    map.addControl(control);
    scaleLineControlRef.current = control;

    return () => {
      map.removeControl(control);
      if (scaleLineControlRef.current === control) {
        scaleLineControlRef.current = null;
      }
    };
  }, [scaleBarTarget]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !northArrowTarget) {
      return;
    }

    if (northArrowControlRef.current) {
      map.removeControl(northArrowControlRef.current);
      northArrowControlRef.current = null;
    }

    const label = document.createElement('span');
    label.className = 'layout-north-arrow-label';
    label.textContent = 'N';

    const control = new Rotate({
      autoHide: false,
      className: 'layout-north-arrow-control',
      label,
      target: northArrowTarget,
    });

    map.addControl(control);
    northArrowControlRef.current = control;

    return () => {
      map.removeControl(control);
      if (northArrowControlRef.current === control) {
        northArrowControlRef.current = null;
      }
    };
  }, [northArrowTarget]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const expectedIds = new Set<string>();

    mapGroupRenderState.entries.forEach((entry) => {
      const basemapId = entry.basemapId;

      if (!basemapId) {
        return;
      }

      layoutBasemapLayerDefinitions[basemapId].forEach((definition) => {
        const layerId = getLayoutBasemapLayerId(entry.id, definition.suffix);
        expectedIds.add(layerId);

        let layer = basemapLayersRef.current.get(layerId);

        if (!layer) {
          layer = createLayoutBasemapLayer(basemapId, definition.suffix);
          map.addLayer(layer);
          basemapLayersRef.current.set(layerId, layer);
        } else {
          layer.setSource(createLayoutBasemapSource(basemapId, definition.suffix));
        }

        layer.setVisible(entry.visible);
        layer.setOpacity(entry.opacity ?? 1);
      });
    });

    basemapLayersRef.current.forEach((layer, layerId) => {
      if (expectedIds.has(layerId)) {
        return;
      }

      map.removeLayer(layer);
      basemapLayersRef.current.delete(layerId);
    });
  }, [mapGroupRenderState.entries]);

  useEffect(() => {
    const rasterLayer = rasterLayerRef.current;

    if (!rasterLayer) {
      return;
    }

    const isRasterVisible = Boolean(raster && (rasterLayerVisibility[raster.id] ?? layerVisibility.raster));

    rasterLayer.setVisible(isRasterVisible);
    rasterLayer.setOpacity(rasterStyle.opacity);

    if (!raster || !isRasterVisible) {
      rasterLayer.setSource(null);
      return;
    }

    rasterLayer.setSource(new ImageStatic({
      imageExtent: layoutRasterExtent(raster.coordinates),
      url: raster.imageUrl,
      projection: 'EPSG:3857',
    }));
  }, [layerVisibility.raster, raster, rasterLayerVisibility, rasterStyle.opacity]);

  useEffect(() => {
    const vectorOverlayLayer = vectorOverlayLayerRef.current;

    if (!vectorOverlayLayer) {
      return;
    }

    vectorOverlaySourceRef.current.clear();
    vectorOverlayLayer.setVisible(Boolean(vectorOverlay && layerVisibility.vectorOverlay));
    vectorOverlayLayer.setStyle(createLayoutVectorOverlayStyle(vectorOverlayStyle));

    if (!vectorOverlay || !layerVisibility.vectorOverlay) {
      return;
    }

    const format = new GeoJSON();
    const features = format.readFeatures(vectorOverlay.geojson as object, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    }) as Feature<Geometry>[];
    vectorOverlaySourceRef.current.addFeatures(features);
  }, [layerVisibility.vectorOverlay, vectorOverlay, vectorOverlayStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const expectedIds = new Set(layers.map((item) => item.id));

    [...uploadedLayersRef.current.keys()].forEach((layerId) => {
      if (!expectedIds.has(layerId)) {
        const entry = uploadedLayersRef.current.get(layerId);
        if (entry) {
          map.removeLayer(entry.layer);
        }
        uploadedLayersRef.current.delete(layerId);
      }
    });

    const format = new GeoJSON();

    layers.forEach((item) => {
      const style = uploadedLayerStyles[item.id] ?? defaultUploadedLayerStyle;
      const existing = uploadedLayersRef.current.get(item.id);
      let entry = existing;

      if (!entry) {
        const source = new VectorSource<Feature<Geometry>>();
        const layer = new VectorLayer({
          source,
          style: createLayoutUploadedLayerStyle(style),
        });

        map.addLayer(layer);
        entry = { source, layer };
        uploadedLayersRef.current.set(item.id, entry);
      } else {
        entry.layer.setStyle(createLayoutUploadedLayerStyle(style));
      }

      entry.source.clear();
      const features = format.readFeatures(item.geojson as object, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      }) as Feature<Geometry>[];
      const selectedFeatureIndexes = new Set(item.selectedFeatureIndexes);

      features.forEach((feature, index) => {
        const properties = isLayoutRecord(feature.getProperties()) ? feature.getProperties() : {};
        feature.setProperties({
          ...properties,
          _featureIndex: index,
          _layerId: item.id,
          _selected: selectedFeatureIndexes.has(index),
          _value: item.selectedField && isPointLikeLayoutFeature(feature)
            ? formatLayoutNumber(Number(properties[item.selectedField]))
            : '',
        });
      });

      entry.source.addFeatures(features);
      entry.layer.setVisible(uploadedLayerVisibility[item.id] ?? true);
    });
  }, [layers, uploadedLayerStyles, uploadedLayerVisibility]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const zIndexByEntryId = new globalThis.Map<string, number>();
    const topZIndex = mapGroupRenderState.entries.length;

    mapGroupRenderState.entries.forEach((entry, index) => {
      zIndexByEntryId.set(entry.id, topZIndex - index);
    });

    let basemapZIndex = 0;

    mapGroupRenderState.entries.forEach((entry) => {
      if (!entry.basemapId) {
        return;
      }

      const entryZIndex = zIndexByEntryId.get(entry.id) ?? 0;
      basemapZIndex = Math.max(basemapZIndex, entryZIndex);

      layoutBasemapLayerDefinitions[entry.basemapId].forEach((definition) => {
        basemapLayersRef.current.get(getLayoutBasemapLayerId(entry.id, definition.suffix))?.setZIndex(entryZIndex);
      });
    });

    graticuleLayerRef.current?.setZIndex(basemapZIndex + 0.5);
    rasterLayerRef.current?.setZIndex(zIndexByEntryId.get(raster ? `raster:${raster.id}` : '') ?? 0);
    vectorOverlayLayerRef.current?.setZIndex(zIndexByEntryId.get('vectorOverlay') ?? 0);

    uploadedLayersRef.current.forEach(({ layer }, layerId) => {
      layer.setZIndex(zIndexByEntryId.get(`uploaded:${layerId}`) ?? topZIndex + 1);
    });
  }, [mapGroupRenderState.entries, raster, vectorOverlay]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const extent = createExtent();
    let hasExtent = false;

    if (raster && (rasterLayerVisibility[raster.id] ?? layerVisibility.raster)) {
      const rasterExtent = layoutRasterExtent(raster.coordinates);
      if (rasterExtent) {
        extendExtent(extent, rasterExtent);
        hasExtent = true;
      }
    }

    if (vectorOverlay && layerVisibility.vectorOverlay) {
      const vectorExtent = vectorOverlaySourceRef.current.getExtent();
      if (vectorExtent) {
        extendExtent(extent, vectorExtent);
        hasExtent = true;
      }
    }

    layers.forEach((item) => {
      if (!(uploadedLayerVisibility[item.id] ?? true)) {
        return;
      }

      const entry = uploadedLayersRef.current.get(item.id);
      if (entry) {
        const uploadedExtent = entry.source.getExtent();
        if (uploadedExtent) {
          extendExtent(extent, uploadedExtent);
          hasExtent = true;
        }
      }
    });

    if (!hasExtent || isEmptyExtent(extent)) {
      view.setCenter(fromLonLat(layoutPreviewCenter));
      view.setZoom(layoutPreviewZoom);
      view.setRotation(0);
      return;
    }

    view.fit(extent, {
      duration: 0,
      maxZoom: 16,
      padding: [14, 14, 14, 14],
    });
    view.setRotation(0);
  }, [layerVisibility.raster, layerVisibility.vectorOverlay, layers, raster, rasterLayerVisibility, uploadedLayerVisibility, vectorOverlay]);

  return <div ref={containerRef} className="layout-map-preview-map" aria-hidden="true" />;
}

const layoutBasemapLayerDefinitions: Record<BasemapId, { suffix: string; createSource: () => OSM | XYZ }[]> = {
  osm: [{
    suffix: 'osm',
    createSource: () => new OSM({ attributions: 'OpenStreetMap contributors', crossOrigin: 'anonymous' }),
  }],
  tianditu: [
    {
      suffix: 'tianditu-vec',
      createSource: () => new XYZ({
        urls: createLayoutTiandituTiles('vec'),
        crossOrigin: 'anonymous',
        attributions: '天地图',
      }),
    },
    {
      suffix: 'tianditu-cva',
      createSource: () => new XYZ({
        urls: createLayoutTiandituTiles('cva'),
        crossOrigin: 'anonymous',
        attributions: '天地图',
      }),
    },
  ],
  esri: [{
    suffix: 'esri',
    createSource: () => new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      crossOrigin: 'anonymous',
      attributions: 'Tiles Esri',
    }),
  }],
};

function createLayoutBasemapLayer(basemapId: BasemapId, suffix: string) {
  return new TileLayer({
    source: createLayoutBasemapSource(basemapId, suffix),
    visible: false,
  });
}

function createLayoutBasemapSource(basemapId: BasemapId, suffix: string) {
  const definition = layoutBasemapLayerDefinitions[basemapId].find((item) => item.suffix === suffix);

  return definition?.createSource() ?? new OSM({ attributions: 'OpenStreetMap contributors', crossOrigin: 'anonymous' });
}

function getLayoutBasemapLayerId(renderId: string, suffix: string) {
  return `layout-basemap-${sanitizeLayoutLayerId(renderId)}-${suffix}`;
}

function createLayoutTiandituTiles(layer: 'vec' | 'cva') {
  return Array.from(
    { length: 8 },
    (_, index) => (
      `https://t${index}.tianditu.gov.cn/${layer}_w/wmts?` +
      `SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
      `&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}` +
      `&tk=fa7482bbcd44e52cb5fb76cde5e7c83e`
    ),
  );
}

function sanitizeLayoutLayerId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function createLayoutUploadedLayerStyle(style: UploadedLayerStyle) {
  return (feature: FeatureLike) => {
    const geometryType = feature.getGeometry()?.getType();
    const isPoint = geometryType === 'Point' || geometryType === 'MultiPoint';
    const isLine = geometryType === 'LineString' || geometryType === 'MultiLineString';
    const isPolygon = geometryType === 'Polygon' || geometryType === 'MultiPolygon';
    const selected = Boolean(feature.get('_selected'));
    const value = String(feature.get('_value') ?? '');
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

      if (value) {
        styles.push(new Style({
          text: new Text({
            text: value,
            font: '12px sans-serif',
            offsetY: 15,
            fill: new Fill({ color: '#17202a' }),
            stroke: new Stroke({ color: '#ffffff', width: 2 }),
          }),
        }));
      }
    }

    return styles;
  };
}

function createLayoutVectorOverlayStyle(style: VectorOverlayStyle) {
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

    return styles;
  };
}

function layoutRasterExtent(coordinates: [[number, number], [number, number], [number, number], [number, number]]) {
  const extent: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  coordinates.forEach(([lon, lat]) => {
    extent[0] = Math.min(extent[0], lon);
    extent[1] = Math.min(extent[1], lat);
    extent[2] = Math.max(extent[2], lon);
    extent[3] = Math.max(extent[3], lat);
  });

  return transformExtent(extent, 'EPSG:4326', 'EPSG:3857') as [number, number, number, number];
}

function hexToRgba(hex: string, alpha: number) {
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

function formatLayoutNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);
}

function isLayoutRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPointLikeLayoutFeature(feature: FeatureLike) {
  const type = feature.getGeometry()?.getType();
  return type === 'Point' || type === 'MultiPoint';
}

