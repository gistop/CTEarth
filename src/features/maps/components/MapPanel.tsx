import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type ExpressionSpecification } from 'maplibre-gl';
import { defaultUploadedLayerStyle, getGeoJsonBounds, getPointBounds, type UploadedLayerStyle } from '../../../gisStore';
import {
  createCesiumLayerAdapter,
  createMapLibreLayerAdapter,
  useLayerStore,
} from '../../layers';
import { useDigitize } from '../../../components/digitize/DigitizeContext';
import type { OpenLayersDigitizeMapHandle } from '../../../components/digitize/OpenLayersDigitizeMap';
import { MapFeatureIdentify } from './map/MapFeatureIdentify';
import { MapFeatureSelection } from './map/MapFeatureSelection';
import { type MapViewMode, useMapCommands } from './map/MapCommandContext';
import { MapMeasurePanel } from './map/MapMeasurePanel';
import { useMapMeasure } from './map/MapMeasureContext';
import { MapSunlightPanel } from './map/MapSunlightPanel';
import { useMapSunlight } from './map/MapSunlightContext';
import { createCesiumImageryProvider, createCesiumTerrainProvider, type CesiumImageryId, type CesiumTerrainId } from './map/cesiumLayerOptions';
import { configureCesiumIonToken, loadCesium, type CesiumNamespace, type CesiumViewer } from './map/cesiumRuntime';
import { useMapIdentify } from './map/MapIdentifyContext';
import { useMapSelection } from './map/MapSelectionContext';
import { useMapViewport } from './map/MapViewportContext';
import { useMapGroupRenderState } from '../../../mapGroupRenderState';
import type { UploadedLayer } from '../../../gisStore';
import { MapViewportFrame } from './MapViewportFrame';
import { combineMapBounds, padMapBounds } from '../services/mapViewportService';
import { logMapTerrainDiagnostics } from '../services/mapTerrainDiagnostics';
import { setMapLibreTerrainMode } from '../services/mapTerrainModeService';

const CHINA_CENTER: [number, number] = [10.4515, 51.1657];
const CHINA_ZOOM = 5.3;

const rasterLayerIds = ['idw-interpolation'];
const vectorOverlayLayerIds = ['buffer-fill', 'buffer-outline'];

const OpenLayersDigitizeMap = lazy(() => (
  import('../../../components/digitize/OpenLayersDigitizeMap').then((module) => ({ default: module.OpenLayersDigitizeMap }))
));

type NominatimSearchResult = {
  boundingbox?: [string, string, string, string];
  lat: string;
  lon: string;
};

function createCesiumViewer(container: HTMLElement, Cesium: CesiumNamespace) {
  const viewer = new Cesium.Viewer(container, {
    animation: false,
    baseLayer: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    shadows: true,
    terrainShadows: Cesium.ShadowMode.ENABLED,
    timeline: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  });

  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
  viewer.scene.shadowMap.enabled = true;
  viewer.scene.postProcessStages.fxaa.enabled = true;
  viewer.resolutionScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
  viewer.shadows = true;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.globe.show = true;
  viewer.scene.backgroundColor = Cesium.Color.SKYBLUE;
  viewer.scene.globe.baseColor = Cesium.Color.LIGHTGREY;
  viewer.screenSpaceEventHandler.setInputAction(() => {
    viewer.camera.zoomIn(getCesiumZoomStep(viewer));
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
  flyCesiumToChina(viewer, Cesium, 1.6);

  return viewer;
}

async function applyCesiumImagery(viewer: CesiumViewer, Cesium: CesiumNamespace, imagery: CesiumImageryId) {
  const provider = await createCesiumImageryProvider(Cesium, imagery);

  if (viewer.isDestroyed()) {
    return;
  }

  viewer.imageryLayers.removeAll(true);
  viewer.imageryLayers.addImageryProvider(provider);
}

async function applyCesiumTerrain(viewer: CesiumViewer, Cesium: CesiumNamespace, terrain: CesiumTerrainId) {
  const provider = await createCesiumTerrainProvider(Cesium, terrain);

  if (viewer.isDestroyed()) {
    return;
  }

  viewer.terrainProvider = provider;
}

function flyCesiumToChina(viewer: CesiumViewer, Cesium: CesiumNamespace, duration = 0.6) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(CHINA_CENTER[0], CHINA_CENTER[1], 8_500_000),
    duration,
  });
}

function flyCesiumToLayer(
  viewer: CesiumViewer,
  Cesium: CesiumNamespace,
  bounds: [number, number, number, number],
) {
  const [west, south, east, north] = bounds;

  if (![west, south, east, north].every(Number.isFinite)) {
    return;
  }

  viewer.camera.flyTo({
    destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
    duration: 0.8,
  });
}

function getCesiumZoomStep(viewer: CesiumViewer) {
  return Math.max(viewer.camera.positionCartographic.height * 0.22, 1_000);
}

function parseLocateQuery(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return null;
  }

  const coordinateMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);

  if (coordinateMatch) {
    const first = Number(coordinateMatch[1]);
    const second = Number(coordinateMatch[2]);

    if (Number.isFinite(first) && Number.isFinite(second)) {
      if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
        return { lon: first, lat: second };
      }

      if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
        return { lon: second, lat: first };
      }
    }
  }

  return null;
}

function getNominatimBounds(result: NominatimSearchResult): [number, number, number, number] | null {
  if (!result.boundingbox || result.boundingbox.length !== 4) {
    return null;
  }

  const south = Number(result.boundingbox[0]);
  const north = Number(result.boundingbox[1]);
  const west = Number(result.boundingbox[2]);
  const east = Number(result.boundingbox[3]);

  if (![south, north, west, east].every(Number.isFinite)) {
    return null;
  }

  return [west, south, east, north];
}

function getNominatimPoint(result: NominatimSearchResult) {
  const lon = Number(result.lon);
  const lat = Number(result.lat);

  if (![lon, lat].every(Number.isFinite)) {
    return null;
  }

  return { lon, lat };
}

function createOnlineMapStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'online-map-background',
        type: 'background',
        paint: {
          'background-color': '#d7e8f7',
        },
      },
    ],
  };
}

export function MapPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cesiumContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const digitizeMapRef = useRef<OpenLayersDigitizeMapHandle | null>(null);
  const cesiumRef = useRef<{ Cesium: CesiumNamespace; viewer: CesiumViewer } | null>(null);
  const cesiumSyncRef = useRef<{ imagery: CesiumImageryId; terrain: CesiumTerrainId } | null>(null);
  const cesiumSyncGenerationRef = useRef(0);
  const mapModeRef = useRef<MapViewMode>('planar');
  const digitizeMapVisibleRef = useRef(false);
  const lastAutoFitRasterIdRef = useRef<string | null>(null);
  const { editingActive, status: digitizeStatus } = useDigitize();
  const { mapCommandState, registerMapCommands, updateMapCommandState } = useMapCommands();
  const { isMeasureOpen, mode: measureMode } = useMapMeasure();
  const { isSunlightOpen } = useMapSunlight();
  const { identifyActive } = useMapIdentify();
  const { selectionActive } = useMapSelection();
  const { viewportBounds4326, setViewportBounds4326 } = useMapViewport();
  const mapGroupRenderState = useMapGroupRenderState();
  const {
    layer,
    layers,
    layerZoomRequest,
    rasterZoomRequest,
    layerVisibility,
    uploadedLayerVisibility,
    raster,
    rasterLayerVisibility,
    rasterStyle,
    vectorOverlay,
    vectorOverlayStyle,
    uploadedLayerStyles,
    workspaceDraftLoaded,
  } = useLayerStore();
  const layersRef = useRef(layers);
  const rasterRef = useRef(raster);
  const vectorOverlayRef = useRef(vectorOverlay);
  const mapGroupEntriesRef = useRef(mapGroupRenderState.entries);
  const basemapVisibleRef = useRef(layerVisibility.basemap);
  const mapCommandStateRef = useRef(mapCommandState);
  const hasAppliedStartupViewportRef = useRef(false);
  const [coords, setCoords] = useState(`${CHINA_CENTER[0]}, ${CHINA_CENTER[1]}`);
  const [status, setStatus] = useState('\u6b63\u5728\u521d\u59cb\u5316\u5728\u7ebf\u5730\u56fe');
  const [hasLoadedDigitizeMap, setHasLoadedDigitizeMap] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [cesiumScene, setCesiumScene] = useState<{ Cesium: CesiumNamespace; viewer: CesiumViewer } | null>(null);
  const measureInteractionActive = isMeasureOpen && measureMode === 'distance';
  const featureIdentifyActive = identifyActive && !editingActive && !measureInteractionActive && mapCommandState.mapMode !== 'globe';
  const featureSelectionActive = selectionActive && !featureIdentifyActive && !editingActive && !measureInteractionActive && mapCommandState.mapMode !== 'globe';
  const selectionStatus = selectionActive
    ? mapCommandState.mapMode === 'globe'
      ? '\u9009\u62e9\u5de5\u5177\u6682\u4e0d\u652f\u6301\u4e09\u7ef4\u89c6\u56fe'
      : layers.length === 0
        ? '\u9009\u62e9\u5de5\u5177\uff1a\u8bf7\u5148\u52a0\u8f7d\u77e2\u91cf\u56fe\u5c42'
        : '\u9009\u62e9\u5de5\u5177\uff1a\u5355\u51fb\u8981\u7d20\u9009\u62e9\uff0cCtrl/Command \u5207\u6362\uff0cShift \u6dfb\u52a0'
    : '';

  useEffect(() => {
    mapModeRef.current = mapCommandState.mapMode;
    digitizeMapVisibleRef.current = editingActive && mapCommandState.mapMode !== 'globe';
  }, [editingActive, mapCommandState.mapMode]);

  useEffect(() => {
    mapCommandStateRef.current = mapCommandState;
  }, [mapCommandState]);

  useEffect(() => {
    digitizeMapVisibleRef.current = editingActive && mapCommandState.mapMode !== 'globe';
  }, [editingActive, mapCommandState.mapMode]);

  useEffect(() => {
    mapGroupEntriesRef.current = mapGroupRenderState.entries;
  }, [mapGroupRenderState.entries]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    rasterRef.current = raster;
  }, [raster]);

  useEffect(() => {
    vectorOverlayRef.current = vectorOverlay;
  }, [vectorOverlay]);

  useEffect(() => {
    basemapVisibleRef.current = layerVisibility.basemap;
  }, [layerVisibility.basemap]);

  useEffect(() => {
    if (editingActive) {
      setHasLoadedDigitizeMap(true);
    }
  }, [editingActive]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !workspaceDraftLoaded || hasAppliedStartupViewportRef.current || !map) {
      return;
    }

    hasAppliedStartupViewportRef.current = true;

    const bounds = getStartupDataBounds(layers, raster, vectorOverlay);

    if (!bounds) {
      return;
    }

    if (!fitValidBounds(map, bounds, 0.14, 80, 700)) {
      setStatus('结果图层坐标超出经纬度范围，已跳过自动定位');
    }
  }, [layers, mapReady, raster, vectorOverlay, workspaceDraftLoaded]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let syncBasemapFromState: (() => void) | null = null;
    let markMapReady: (() => void) | null = null;

    const createMap = () => {
      if (mapRef.current) {
        return;
      }

      const { width, height } = container.getBoundingClientRect();

      if (width < 20 || height < 20) {
        setStatus(`\u7b49\u5f85\u5730\u56fe\u5bb9\u5668\u5c3a\u5bf8 ${Math.round(width)} x ${Math.round(height)}`);
        return;
      }

      const map = new maplibregl.Map({
        container,
        center: CHINA_CENTER,
        zoom: CHINA_ZOOM,
        pitch: 0,
        minZoom: 2,
        maxZoom: 18,
        maxPitch: 85,
        attributionControl: false,
        style: createOnlineMapStyle(),
      });
      updateMapCommandState({ basemap: mapCommandState.basemap, dragRotateEnabled: map.dragRotate.isEnabled() });

      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      markMapReady = () => {
        if (!map.isStyleLoaded()) {
          return;
        }

        setMapReady(true);
        setStatus((current) => (current === '\u6b63\u5728\u521d\u59cb\u5316\u5728\u7ebf\u5730\u56fe' ? '' : current));
      };
      syncBasemapFromState = () => {
        if (mapRef.current !== map) {
          return;
        }

        createMapLibreLayerAdapter().sync({
          map,
          entries: mapGroupEntriesRef.current,
          uploadedLayers: layersRef.current,
          rasterId: rasterRef.current?.id ?? null,
          hasVectorOverlay: Boolean(vectorOverlayRef.current),
          basemapVisible: basemapVisibleRef.current,
        });
      };

      map.on('styledata', markMapReady);
      map.on('styledata', syncBasemapFromState);
      map.on('idle', syncBasemapFromState);
      map.on('moveend', () => {
        setViewportBounds4326(mapBoundsToLonLatExtent(map));
      });
      map.on('error', (event) => {
        setStatus(event.error?.message ?? '\u5728\u7ebf\u5730\u56fe\u52a0\u8f7d\u9519\u8bef');
      });
      map.once('load', () => {
        map.resize();
        if (viewportBounds4326 && fitMapLibreToViewportBounds(map, viewportBounds4326)) {
          setViewportBounds4326(mapBoundsToLonLatExtent(map));
        } else {
          map.jumpTo({ center: CHINA_CENTER, zoom: CHINA_ZOOM, pitch: 0, bearing: 0 });
          setViewportBounds4326(mapBoundsToLonLatExtent(map));
        }
        syncBasemapFromState?.();
        setMapReady(true);
        setStatus('');
      });
      map.on('mousemove', (event) => {
        setCoords(`${event.lngLat.lng.toFixed(5)}, ${event.lngLat.lat.toFixed(5)}`);
      });

      markMapReady?.();
      mapRef.current = map;
    };

    createMap();

    const animationFrame = requestAnimationFrame(createMap);
    const resizeObserver = new ResizeObserver(() => {
      createMap();
      mapRef.current?.resize();
    });
    resizeObserver.observe(container);

    return () => {
      const map = mapRef.current;

      if (map && markMapReady) {
        map.off('styledata', markMapReady);
      }
      if (map && syncBasemapFromState) {
        map.off('styledata', syncBasemapFromState);
        map.off('idle', syncBasemapFromState);
        setViewportBounds4326(mapBoundsToLonLatExtent(map));
      }

      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      if (cesiumRef.current && !cesiumRef.current.viewer.isDestroyed()) {
        cesiumRef.current.viewer.destroy();
      }
      cesiumRef.current = null;
      setCesiumScene(null);
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    if (mapCommandState.mapMode === 'globe') {
      setMapLibreTerrainMode(map, false);
      setStatus('');
      return;
    }

    if (mapCommandState.mapMode === 'terrain') {
      const terrainEnabled = setMapLibreTerrainMode(map, true);

      map.easeTo({
        pitch: 60,
        bearing: -18,
        duration: 300,
        essential: true,
      });
      setStatus(terrainEnabled
        ? '\u5730\u5f62\u6a21\u5f0f\uff1a\u5df2\u63a5\u5165 DEM \u9ad8\u7a0b\u74e6\u7247\u670d\u52a1'
        : '\u5730\u5f62\u6a21\u5f0f\uff1aDEM \u9ad8\u7a0b\u74e6\u7247\u6e90\u672a\u5c31\u7eea');
      return;
    }

    setMapLibreTerrainMode(map, false);
    map.easeTo({
      pitch: 0,
      bearing: 0,
      duration: 300,
      essential: true,
    });
    setStatus('');
  }, [mapCommandState.mapMode, mapReady]);

  useEffect(() => {
    if (!layerZoomRequest) {
      return;
    }

    const targetLayer = layers.find((item) => item.id === layerZoomRequest.layerId);

    if (!targetLayer) {
      return;
    }

    const bounds = targetLayer.points.features.length > 0
      ? getPointBounds(targetLayer.points.features)
      : getGeoJsonBounds(targetLayer.geojson);

    if (!bounds) {
      return;
    }

    if (mapCommandState.mapMode === 'globe') {
      const cesium = cesiumRef.current;

      if (cesium) {
        flyCesiumToLayer(cesium.viewer, cesium.Cesium, bounds);
      }

      return;
    }

    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    if (!fitValidBounds(map, bounds, 0.14, 80, 700)) {
      setStatus('\u56fe\u5c42\u5750\u6807\u8d85\u51fa\u7ecf\u7eac\u5ea6\u8303\u56f4\uff0c\u5df2\u8df3\u8fc7\u81ea\u52a8\u5b9a\u4f4d');
    }
  }, [layerZoomRequest, layers, mapCommandState.mapMode, mapReady]);

  useEffect(() => {
    if (!rasterZoomRequest || !raster || rasterZoomRequest.rasterId !== raster.id) {
      return;
    }

    if (mapCommandState.mapMode === 'globe') {
      return;
    }

    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    if (!fitValidLngLatBounds(map, boundsFromCoordinates(raster.coordinates), 80, 700)) {
      setStatus('\u6805\u683c\u5750\u6807\u8d85\u51fa\u7ecf\u7eac\u5ea6\u8303\u56f4\uff0c\u5df2\u8df3\u8fc7\u81ea\u52a8\u5b9a\u4f4d');
    }
  }, [mapCommandState.mapMode, mapReady, raster, rasterZoomRequest]);

  useEffect(() => {
    if (mapCommandState.mapMode !== 'globe') {
      const existing = cesiumRef.current;

        if (existing && !existing.viewer.isDestroyed()) {
          existing.viewer.imageryLayers.removeAll(true);
          existing.viewer.dataSources.removeAll(true);
          existing.viewer.scene.globe.show = false;
          existing.viewer.resize?.();
        }

      setCesiumScene(null);
      setStatus('');
      return;
    }

    let isCancelled = false;
    const container = cesiumContainerRef.current;

    if (!container) {
      return;
    }

    const syncCesium = async () => {
      const syncGeneration = ++cesiumSyncGenerationRef.current;

      try {
        const existing = cesiumRef.current;
        const needsViewer = !existing || existing.viewer.isDestroyed();

        if (needsViewer) {
          setStatus('\u6b63\u5728\u52a0\u8f7d Cesium \u4e09\u7ef4\u89c6\u56fe');
          const Cesium = await loadCesium();

          if (isCancelled) {
            return;
          }

          configureCesiumIonToken(Cesium);
          const viewer = createCesiumViewer(container, Cesium);
          cesiumRef.current = {
            Cesium,
            viewer,
          };
          setCesiumScene(cesiumRef.current);
          cesiumSyncRef.current = null;
        }

        if (syncGeneration !== cesiumSyncGenerationRef.current) {
          return;
        }

        const cesium = cesiumRef.current;

        if (!cesium || cesium.viewer.isDestroyed()) {
          return;
        }

        setCesiumScene(cesium);
        cesium.viewer.scene.globe.show = true;

        const previous = cesiumSyncRef.current;
        const terrainChanged = !previous || previous.terrain !== mapCommandState.cesiumTerrain;
        const isActive = () => !isCancelled && syncGeneration === cesiumSyncGenerationRef.current;

        if (terrainChanged) {
          await applyCesiumTerrain(cesium.viewer, cesium.Cesium, mapCommandState.cesiumTerrain);
        }

        if (!isActive()) {
          return;
        }

        const cesiumLayerAdapter = createCesiumLayerAdapter();
        await cesiumLayerAdapter.sync({
          viewer: cesium.viewer,
          Cesium: cesium.Cesium,
          isActive,
          entries: mapGroupRenderState.entries,
          layerVisibility,
          raster,
          rasterLayerVisibility,
          rasterStyle,
          layers,
          uploadedLayerStyles,
          uploadedLayerVisibility,
          vectorOverlay,
          vectorOverlayStyle,
        });

        if (!isActive()) {
          return;
        }

        cesiumSyncRef.current = {
          imagery: mapCommandState.cesiumImagery,
          terrain: mapCommandState.cesiumTerrain,
        };
        cesium.viewer.resize?.();

        if (needsViewer) {
          setStatus('');
        }
      } catch (error) {
        if (!isCancelled) {
          setStatus(error instanceof Error ? error.message : 'Cesium \u4e09\u7ef4\u89c6\u56fe\u52a0\u8f7d\u5931\u8d25');
        }
      }
    };

    void syncCesium();

    return () => {
      isCancelled = true;
      cesiumSyncGenerationRef.current += 1;
    };
  }, [layerVisibility, layers, mapCommandState.cesiumTerrain, mapCommandState.mapMode, mapGroupRenderState.entries, raster, rasterLayerVisibility, rasterStyle.opacity, uploadedLayerStyles, uploadedLayerVisibility, vectorOverlay, vectorOverlayStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    const expectedLayerIds = new Set(layers.map((item) => item.id));
    removeStaleUploadedLayers(map, expectedLayerIds);

    layers.forEach((item) => {
      const style = uploadedLayerStyles[item.id] ?? defaultUploadedLayerStyle;

      ensureUploadedLayer(map, item.id, style);
      setUploadedLayerData(map, item);
      setUploadedLayerPaint(map, item.id, style);
      setLayersVisibility(map, uploadedLayerIds(item.id), uploadedLayerVisibility[item.id] ?? true);
    });

    createMapLibreLayerAdapter().sync({
      map,
      entries: mapGroupRenderState.entries,
      uploadedLayers: layers,
      rasterId: raster?.id ?? null,
      hasVectorOverlay: Boolean(vectorOverlay),
      basemapVisible: layerVisibility.basemap,
    });
  }, [
    layers,
    mapGroupRenderState.entries,
    mapReady,
    layerVisibility.basemap,
    raster,
    uploadedLayerStyles,
    uploadedLayerVisibility,
    vectorOverlay,
  ]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    if (map.getLayer('idw-interpolation')) {
      map.removeLayer('idw-interpolation');
    }

    if (map.getSource('idw-interpolation')) {
      map.removeSource('idw-interpolation');
    }

    if (!raster) {
      lastAutoFitRasterIdRef.current = null;
      return;
    }

    map.addSource('idw-interpolation', {
      type: 'image',
      url: raster.imageUrl,
      coordinates: raster.coordinates,
    });
    map.addLayer(
      {
        id: 'idw-interpolation',
        type: 'raster',
        source: 'idw-interpolation',
        paint: {
          'raster-opacity': rasterStyle.opacity,
          'raster-fade-duration': 0,
        },
      },
    );
    setLayersVisibility(map, rasterLayerIds, rasterLayerVisibility[raster.id] ?? layerVisibility.raster);
    createMapLibreLayerAdapter().sync({
      map,
      entries: mapGroupRenderState.entries,
      uploadedLayers: layers,
      rasterId: raster?.id ?? null,
      hasVectorOverlay: Boolean(vectorOverlay),
      basemapVisible: layerVisibility.basemap,
    });
    if (lastAutoFitRasterIdRef.current !== raster.id) {
      fitValidLngLatBounds(map, boundsFromCoordinates(raster.coordinates), 80, 700);
      lastAutoFitRasterIdRef.current = raster.id;
    }
  }, [layerVisibility.basemap, layerVisibility.raster, layers, mapGroupRenderState.entries, mapReady, raster, rasterLayerVisibility, vectorOverlay]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !map.getLayer('idw-interpolation')) {
      return;
    }

    map.setPaintProperty('idw-interpolation', 'raster-opacity', rasterStyle.opacity);
  }, [mapReady, rasterStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    if (map.getLayer('buffer-outline')) {
      map.removeLayer('buffer-outline');
    }

    if (map.getLayer('buffer-fill')) {
      map.removeLayer('buffer-fill');
    }

    if (map.getSource('buffer-result')) {
      map.removeSource('buffer-result');
    }

    if (!vectorOverlay) {
      return;
    }

    map.addSource('buffer-result', {
      type: 'geojson',
      data: vectorOverlay.geojson as GeoJSON.FeatureCollection,
    });
    map.addLayer(
      {
        id: 'buffer-fill',
        type: 'fill',
        source: 'buffer-result',
        paint: {
          'fill-color': vectorOverlayStyle.fillColor,
          'fill-opacity': vectorOverlayStyle.fillOpacity,
        },
      },
    );
    map.addLayer(
      {
        id: 'buffer-outline',
        type: 'line',
        source: 'buffer-result',
        paint: {
          'line-color': vectorOverlayStyle.lineColor,
          'line-width': vectorOverlayStyle.lineWidth,
        },
      },
    );
    setLayersVisibility(map, vectorOverlayLayerIds, layerVisibility.vectorOverlay);
    createMapLibreLayerAdapter().sync({
      map,
      entries: mapGroupRenderState.entries,
      uploadedLayers: layers,
      rasterId: raster?.id ?? null,
      hasVectorOverlay: Boolean(vectorOverlay),
      basemapVisible: layerVisibility.basemap,
    });

    const bounds = getGeoJsonBounds(vectorOverlay.geojson);

    if (bounds && !fitValidBounds(map, bounds, 0.12, 80, 700)) {
      setStatus('结果图层坐标超出经纬度范围，已跳过自动定位');
    }
  }, [layerVisibility.basemap, layerVisibility.vectorOverlay, layers, mapGroupRenderState.entries, mapReady, raster, vectorOverlay, vectorOverlayStyle]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    setVectorOverlayPaint(map, vectorOverlayStyle);
  }, [mapReady, vectorOverlayStyle]);

  const zoomIn = useCallback(() => {
    if (mapModeRef.current === 'globe') {
      const viewer = cesiumRef.current?.viewer;

      if (viewer) {
        viewer.camera.zoomIn(getCesiumZoomStep(viewer));
      }

      return;
    }

    if (digitizeMapVisibleRef.current && digitizeMapRef.current) {
      digitizeMapRef.current.zoomIn();
      return;
    }

    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.zoomIn({ duration: 250 });
  }, []);

  const zoomOut = useCallback(() => {
    if (mapModeRef.current === 'globe') {
      const viewer = cesiumRef.current?.viewer;

      if (viewer) {
        viewer.camera.zoomOut(getCesiumZoomStep(viewer));
      }

      return;
    }

    if (digitizeMapVisibleRef.current && digitizeMapRef.current) {
      digitizeMapRef.current.zoomOut();
      return;
    }

    const map = mapRef.current;

    if (!map) {
      return;
    }

    map.zoomOut({ duration: 250 });
  }, []);

  const resetNorth = useCallback(() => {
    if (mapModeRef.current === 'globe') {
      const cesium = cesiumRef.current;

      if (cesium) {
        flyCesiumToChina(cesium.viewer, cesium.Cesium);
      }

      return;
    }

    if (digitizeMapVisibleRef.current && digitizeMapRef.current) {
      digitizeMapRef.current.resetNorth();
      return;
    }

    mapRef.current?.resetNorthPitch();
  }, []);

  const toggleDragRotate = useCallback(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (map.dragRotate.isEnabled()) {
      map.dragRotate.disable();
    } else {
      map.dragRotate.enable();
    }

    updateMapCommandState({ dragRotateEnabled: map.dragRotate.isEnabled() });
  }, [updateMapCommandState]);

  const syncViewport = useCallback(() => {
    const map = mapRef.current;

    if (map) {
      setViewportBounds4326(mapBoundsToLonLatExtent(map));
    }
  }, [setViewportBounds4326]);

  const inspectTerrain = useCallback(() => {
    const currentMapCommandState = mapCommandStateRef.current;

    logMapTerrainDiagnostics({
      map: mapRef.current,
      mapMode: mapModeRef.current,
      displayCrs: currentMapCommandState.displayCrs,
      basemap: currentMapCommandState.basemap,
      basemapSourceKind: currentMapCommandState.basemapSourceKind,
      basemapVisible: basemapVisibleRef.current,
      mapGroupEntries: mapGroupEntriesRef.current,
    });
  }, []);

  const locateByQuery = useCallback(async (query: string) => {
    const trimmed = query.trim();

    if (!trimmed || mapModeRef.current !== 'globe') {
      return false;
    }

    const cesium = cesiumRef.current;
    const viewer = cesium?.viewer;

    if (!cesium || !viewer || viewer.isDestroyed()) {
      return false;
    }

    const coordinate = parseLocateQuery(trimmed);

    if (coordinate) {
      viewer.camera.flyTo({
        destination: cesium.Cesium.Cartesian3.fromDegrees(coordinate.lon, coordinate.lat, 2_400_000),
        duration: 0.8,
      });
      return true;
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('q', trimmed);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return false;
      }

      const results = (await response.json()) as NominatimSearchResult[];
      const result = results[0];

      if (!result) {
        return false;
      }

      const bounds = getNominatimBounds(result);

      if (bounds) {
        flyCesiumToLayer(viewer, cesium.Cesium, bounds);
        return true;
      }

      const point = getNominatimPoint(result);

      if (!point) {
        return false;
      }

      viewer.camera.flyTo({
        destination: cesium.Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 2_400_000),
        duration: 0.8,
      });

      return true;
    } catch {
      return false;
    }
  }, []);

  const locate = useCallback(() => {
    if (mapModeRef.current === 'globe') {
      const cesium = cesiumRef.current;

      if (cesium) {
        flyCesiumToChina(cesium.viewer, cesium.Cesium);
      }

      return;
    }

    if (digitizeMapVisibleRef.current && digitizeMapRef.current) {
      digitizeMapRef.current.locate();
      return;
    }

    mapRef.current?.easeTo({
      center: CHINA_CENTER,
      zoom: CHINA_ZOOM,
      pitch: 0,
      bearing: 0,
      duration: 450,
      essential: true,
    });
  }, []);

  const mapCommands = useMemo(
    () => ({
      locateByQuery,
      zoomIn,
      zoomOut,
      resetNorth,
      syncViewport,
      toggleDragRotate,
      locate,
      inspectTerrain,
    }),
    [inspectTerrain, locate, locateByQuery, resetNorth, syncViewport, toggleDragRotate, zoomIn, zoomOut],
  );

  useEffect(() => registerMapCommands(mapCommands), [mapCommands, registerMapCommands]);

  return (
    <MapViewportFrame
      sunlightOpen={isSunlightOpen && mapCommandState.mapMode === 'globe'}
      status={editingActive ? digitizeStatus : selectionStatus || status}
      readout={coords}
    >
      <div className={`map-canvas${mapCommandState.mapMode === 'globe' ? ' is-hidden' : ''}`} ref={containerRef} />
      <MapFeatureIdentify active={featureIdentifyActive} map={mapRef.current} mapReady={mapReady} />
      <MapFeatureSelection active={featureSelectionActive} map={mapRef.current} mapReady={mapReady} />
      {hasLoadedDigitizeMap ? (
        <Suspense fallback={<div className="openlayers-digitize-map is-visible" />}>
          <OpenLayersDigitizeMap
            ref={digitizeMapRef}
            mapLibreMap={mapRef.current}
            visible={editingActive && mapCommandState.mapMode !== 'globe'}
          />
        </Suspense>
      ) : null}
      <div className={`cesium-canvas${mapCommandState.mapMode === 'globe' ? ' is-visible' : ''}`} ref={cesiumContainerRef} />
      <MapSunlightPanel cesiumScene={cesiumScene} mapMode={mapCommandState.mapMode} />
      <MapMeasurePanel cesiumScene={cesiumScene} map={mapRef.current} mapMode={mapCommandState.mapMode} mapReady={mapReady} />
    </MapViewportFrame>
  );
}

function uploadedSourceId(layerId: string) {
  return `uploaded-source-${layerId}`;
}

function uploadedLayerIds(layerId: string) {
  return [
    `uploaded-layer-${layerId}-fill`,
    `uploaded-layer-${layerId}-line`,
    `uploaded-layer-${layerId}-circle`,
    `uploaded-layer-${layerId}-label`,
  ];
}

function ensureUploadedLayer(map: maplibregl.Map, layerId: string, style: UploadedLayerStyle) {
  const sourceId = uploadedSourceId(layerId);
  const [fillId, lineId, circleId, labelId] = uploadedLayerIds(layerId);

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });
  }

  if (!map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: 'fill',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      paint: {
        'fill-color': selectedColorExpression('#f97316', style.fillColor),
        'fill-opacity': selectedNumberExpression(Math.max(style.fillOpacity, 0.42), style.fillOpacity),
      },
    });
  }

  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: 'line',
      source: sourceId,
      filter: [
        'any',
        ['==', ['geometry-type'], 'LineString'],
        ['==', ['geometry-type'], 'MultiLineString'],
        ['==', ['geometry-type'], 'Polygon'],
        ['==', ['geometry-type'], 'MultiPolygon'],
      ],
      paint: {
        'line-color': selectedColorExpression('#f97316', style.lineColor),
        'line-width': selectedNumberExpression(Math.max(style.lineWidth + 1.5, 3), style.lineWidth),
        'line-opacity': style.lineOpacity,
      },
    });
  }

  if (!map.getLayer(circleId)) {
    map.addLayer({
      id: circleId,
      type: 'circle',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
      paint: {
        'circle-radius': selectedNumberExpression(style.pointRadius + 3, style.pointRadius),
        'circle-color': selectedColorExpression('#f97316', style.pointColor),
        'circle-opacity': style.pointOpacity,
        'circle-stroke-color': selectedColorExpression('#ffffff', style.pointStrokeColor),
        'circle-stroke-width': selectedNumberExpression(Math.max(style.pointStrokeWidth + 1, 2.5), style.pointStrokeWidth),
      },
    });
  }

  if (!map.getLayer(labelId)) {
    map.addLayer({
      id: labelId,
      type: 'symbol',
      source: sourceId,
      filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
      layout: {
        'text-field': ['to-string', ['get', '_value']],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#17202a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
    });
  }
}

function setUploadedLayerPaint(map: maplibregl.Map, layerId: string, style: UploadedLayerStyle) {
  const [fillId, lineId, circleId] = uploadedLayerIds(layerId);

  if (map.getLayer(fillId)) {
    map.setPaintProperty(fillId, 'fill-color', selectedColorExpression('#f97316', style.fillColor));
    map.setPaintProperty(fillId, 'fill-opacity', selectedNumberExpression(Math.max(style.fillOpacity, 0.42), style.fillOpacity));
  }

  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, 'line-color', selectedColorExpression('#f97316', style.lineColor));
    map.setPaintProperty(lineId, 'line-width', selectedNumberExpression(Math.max(style.lineWidth + 1.5, 3), style.lineWidth));
    map.setPaintProperty(lineId, 'line-opacity', style.lineOpacity);
  }

  if (map.getLayer(circleId)) {
    map.setPaintProperty(circleId, 'circle-radius', selectedNumberExpression(style.pointRadius + 3, style.pointRadius));
    map.setPaintProperty(circleId, 'circle-color', selectedColorExpression('#f97316', style.pointColor));
    map.setPaintProperty(circleId, 'circle-opacity', style.pointOpacity);
    map.setPaintProperty(circleId, 'circle-stroke-color', selectedColorExpression('#ffffff', style.pointStrokeColor));
    map.setPaintProperty(circleId, 'circle-stroke-width', selectedNumberExpression(Math.max(style.pointStrokeWidth + 1, 2.5), style.pointStrokeWidth));
  }
}

function selectedColorExpression(selectedColor: string, normalColor: string): ExpressionSpecification {
  return ['case', ['boolean', ['get', '_selected'], false], selectedColor, normalColor];
}

function selectedNumberExpression(selectedValue: number, normalValue: number): ExpressionSpecification {
  return ['case', ['boolean', ['get', '_selected'], false], selectedValue, normalValue];
}

function setVectorOverlayPaint(
  map: maplibregl.Map,
  style: { fillColor: string; fillOpacity: number; lineColor: string; lineWidth: number },
) {
  if (map.getLayer('buffer-fill')) {
    map.setPaintProperty('buffer-fill', 'fill-color', style.fillColor);
    map.setPaintProperty('buffer-fill', 'fill-opacity', style.fillOpacity);
  }

  if (map.getLayer('buffer-outline')) {
    map.setPaintProperty('buffer-outline', 'line-color', style.lineColor);
    map.setPaintProperty('buffer-outline', 'line-width', style.lineWidth);
  }
}

function setUploadedLayerData(map: maplibregl.Map, layer: { id: string; geojson: { features: unknown[] }; selectedField: string; selectedFeatureIndexes: number[] }) {
  const source = map.getSource(uploadedSourceId(layer.id)) as maplibregl.GeoJSONSource | undefined;
  const selectedFeatureIndexes = new Set(layer.selectedFeatureIndexes);

  source?.setData({
    type: 'FeatureCollection',
    features: layer.geojson.features.map((feature, index) => enrichFeature(feature, layer, index, selectedFeatureIndexes)),
  } as GeoJSON.FeatureCollection);
}

function removeStaleUploadedLayers(map: maplibregl.Map, expectedLayerIds: Set<string>) {
  const style = map.getStyle();
  const staleLayerIds = style.layers
    .map((item) => item.id)
    .filter((id) => {
      if (!id.startsWith('uploaded-layer-')) {
        return false;
      }

      const uploadedId = uploadedIdFromLayerId(id);
      return uploadedId ? !expectedLayerIds.has(uploadedId) : false;
    });

  staleLayerIds.forEach((id) => {
    if (map.getLayer(id)) {
      map.removeLayer(id);
    }
  });

  Object.keys(style.sources)
    .filter((id) => id.startsWith('uploaded-source-') && !expectedLayerIds.has(id.slice('uploaded-source-'.length)))
    .forEach((id) => {
      if (map.getSource(id)) {
        map.removeSource(id);
      }
    });
}

function uploadedIdFromLayerId(layerId: string) {
  const match = /^uploaded-layer-(.+)-(fill|line|circle|label)$/.exec(layerId);
  return match?.[1] ?? null;
}

function setLayersVisibility(map: maplibregl.Map, layerIds: string[], visible: boolean) {
  layerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
  });
}

function getStartupDataBounds(
  layers: UploadedLayer[],
  raster: { coordinates: [[number, number], [number, number], [number, number], [number, number]] } | null,
  vectorOverlay: { geojson: { features: unknown[] } } | null,
) {
  let bounds: [number, number, number, number] | null = null;

  layers.forEach((layer) => {
    bounds = combineMapBounds(bounds, getUploadedLayerBounds(layer));
  });

  if (raster) {
    bounds = combineMapBounds(bounds, flattenBounds(boundsFromCoordinates(raster.coordinates)));
  }

  if (vectorOverlay) {
    bounds = combineMapBounds(bounds, getGeoJsonBounds(vectorOverlay.geojson));
  }

  return bounds;
}

function getUploadedLayerBounds(layer: UploadedLayer) {
  return layer.points.features.length > 0
    ? getPointBounds(layer.points.features)
    : getGeoJsonBounds(layer.geojson);
}

function flattenBounds(bounds: [[number, number], [number, number]]) {
  return [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]] as [number, number, number, number];
}

function fitValidBounds(
  map: maplibregl.Map,
  bounds: [number, number, number, number],
  ratio: number,
  padding: number,
  duration: number,
) {
  const paddedBounds = padMapBounds(bounds, ratio);

  return paddedBounds
    ? fitValidLngLatBounds(map, [[paddedBounds[0], paddedBounds[1]], [paddedBounds[2], paddedBounds[3]]], padding, duration)
    : false;
}

function fitValidLngLatBounds(
  map: maplibregl.Map,
  bounds: [[number, number], [number, number]],
  padding: number,
  duration: number,
) {
  if (!isValidLngLatBounds(bounds)) {
    return false;
  }

  try {
    map.fitBounds(bounds, { padding, duration });
    return true;
  } catch {
    return false;
  }
}

function isValidLngLatBounds(bounds: [[number, number], [number, number]]) {
  const [[west, south], [east, north]] = bounds;

  return [west, south, east, north].every(Number.isFinite)
    && south >= -90
    && south <= 90
    && north >= -90
    && north <= 90
    && south <= north;
}

function boundsFromCoordinates(
  coordinates: [[number, number], [number, number], [number, number], [number, number]],
): [[number, number], [number, number]] {
  const bounds = coordinates.reduce(
    (current, [lon, lat]) => [
      Math.min(current[0], lon),
      Math.min(current[1], lat),
      Math.max(current[2], lon),
      Math.max(current[3], lat),
    ] as [number, number, number, number],
    [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number],
  );

  return [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[3]],
  ];
}

function mapBoundsToLonLatExtent(map: maplibregl.Map): [number, number, number, number] {
  const bounds = map.getBounds();

  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ];
}

function fitMapLibreToViewportBounds(map: maplibregl.Map, bounds: [number, number, number, number]) {
  const fitBounds: [[number, number], [number, number]] = [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[3]],
  ];

  if (!isValidLngLatBounds(fitBounds)) {
    return false;
  }

  try {
    map.fitBounds(fitBounds, {
      duration: 0,
      padding: 48,
    });
    map.jumpTo({ pitch: 0, bearing: 0 });
    return true;
  } catch {
    return false;
  }
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);
}

function enrichFeature(feature: unknown, layer: { id: string; selectedField: string }, index: number, selectedFeatureIndexes: Set<number>) {
  if (!isRecord(feature)) {
    return feature;
  }

  const properties = isRecord(feature.properties) ? feature.properties : {};

  return {
    ...feature,
    properties: {
      ...properties,
      _featureIndex: index,
      _layerId: layer.id,
      _selected: selectedFeatureIndexes.has(index),
      _value: layer.selectedField && isPointLikeFeature(feature)
        ? formatNumber(Number(properties[layer.selectedField]))
        : '',
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPointLikeFeature(value: Record<string, unknown>) {
  return isRecord(value.geometry) && value.geometry.type === 'Point';
}

