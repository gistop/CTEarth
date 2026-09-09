import type { CesiumLayerNamespace } from './cesiumLayerOptions';

const CESIUM_BASE_URL = '/cesium/';

export type CesiumViewer = {
  camera: {
    changed?: {
      addEventListener: (callback: () => void) => () => void;
    };
    positionCartographic: { height: number };
    computeViewRectangle?: (ellipsoid?: unknown) => { east: number; north: number; south: number; west: number } | undefined;
    zoomIn: (amount?: number) => void;
    zoomOut: (amount?: number) => void;
    flyTo: (options: { destination: unknown; duration?: number }) => void;
    setView: (options: { destination: unknown; orientation?: Record<string, unknown> }) => void;
    pickEllipsoid?: (windowPosition: unknown, ellipsoid?: unknown) => unknown;
  };
  canvas: HTMLCanvasElement;
  entities: {
    add: (options: Record<string, unknown>) => unknown;
    remove: (entity: unknown) => boolean;
  };
  screenSpaceEventHandler: {
    setInputAction: (callback: (event: { endPosition?: unknown; position?: unknown }) => void, type: unknown) => void;
    removeInputAction?: (type: unknown) => void;
  };
  imageryLayers: {
    removeAll: (destroy?: boolean) => void;
    addImageryProvider: (provider: unknown) => unknown;
  };
  dataSources: {
    add: (dataSource: unknown) => Promise<unknown>;
    removeAll: (destroy?: boolean) => void;
  };
  terrainProvider: unknown;
  scene: {
    backgroundColor: unknown;
    globe: {
      baseColor: unknown;
      depthTestAgainstTerrain?: boolean;
      ellipsoid?: unknown;
      enableLighting: boolean;
      getHeight?: (cartographic: unknown) => number | undefined;
      show: boolean;
      tileLoadProgressEvent?: {
        addEventListener: (callback: (queuedTileCount: number) => void) => () => void;
      };
    };
    pick?: (windowPosition: unknown) => { id?: unknown } | undefined;
    pickPosition?: (windowPosition: unknown) => unknown;
    requestRender?: () => void;
    screenSpaceCameraController?: {
      enableInputs: boolean;
      enableLook: boolean;
      enableRotate: boolean;
      enableTilt: boolean;
      enableTranslate: boolean;
      enableZoom: boolean;
    };
  };
  destroy: () => void;
  isDestroyed: () => boolean;
  resize?: () => void;
};

export type CesiumNamespace = CesiumLayerNamespace & {
  Viewer: new (container: HTMLElement, options: Record<string, unknown>) => CesiumViewer;
  ImageryLayer: new (provider: unknown) => unknown;
  SingleTileImageryProvider: new (options: Record<string, unknown>) => unknown;
  GeoJsonDataSource: {
    load: (data: unknown, options?: Record<string, unknown>) => Promise<unknown>;
  };
  WebMapTileServiceImageryProvider: new (options: Record<string, unknown>) => unknown;
  Rectangle: {
    fromDegrees: (west: number, south: number, east: number, north: number) => unknown;
  };
  Cartesian3: {
    new (x?: number, y?: number, z?: number): unknown;
    UNIT_X: unknown;
    UNIT_Y: unknown;
    UNIT_Z: unknown;
    add: (left: unknown, right: unknown, result: unknown) => unknown;
    clone: (cartesian: unknown) => unknown;
    cross: (left: unknown, right: unknown, result: unknown) => unknown;
    distance: (left: unknown, right: unknown) => number;
    dot: (left: unknown, right: unknown) => number;
    fromDegrees: (longitude: number, latitude: number, height: number) => unknown;
    fromRadians: (longitude: number, latitude: number, height: number) => unknown;
    magnitude: (cartesian: unknown) => number;
    midpoint: (left: unknown, right: unknown, result: unknown) => unknown;
    multiplyByScalar: (cartesian: unknown, scalar: number, result: unknown) => unknown;
    normalize: (cartesian: unknown, result: unknown) => unknown;
    subtract: (left: unknown, right: unknown, result: unknown) => unknown;
  };
  Cartesian2: new (x: number, y: number) => unknown;
  Matrix4: {
    new (): unknown;
    inverse: (matrix: unknown, result: unknown) => unknown;
    multiplyByPoint: (matrix: unknown, cartesian: unknown, result: unknown) => unknown;
  };
  PolygonHierarchy: new (positions: unknown[]) => unknown;
  PolylineDashMaterialProperty: new (options: Record<string, unknown>) => unknown;
  PolylineGlowMaterialProperty: new (options: Record<string, unknown>) => unknown;
  CallbackProperty: new (callback: () => unknown, isConstant: boolean) => unknown;
  Transforms: {
    eastNorthUpToFixedFrame: (origin: unknown) => unknown;
  };
  Cartographic: {
    new (longitude?: number, latitude?: number, height?: number): unknown;
    fromCartesian: (cartesian: unknown) => { longitude: number; latitude: number; height: number };
    fromDegrees: (longitude: number, latitude: number, height?: number) => unknown;
  };
  Color: {
    LIGHTGREY: unknown;
    SKYBLUE: unknown;
    fromAlpha: (color: unknown, alpha: number) => unknown;
    fromCssColorString: (color: string) => unknown;
  };
  Ion?: {
    defaultAccessToken: string;
  };
  JulianDate: {
    now: () => unknown;
  };
  Math: {
    toDegrees: (radians: number) => number;
    toRadians: (degrees: number) => number;
  };
  SceneMode: {
    SCENE2D: unknown;
  };
  ScreenSpaceEventHandler: new (canvas: HTMLCanvasElement) => {
    destroy: () => void;
    setInputAction: (callback: (event: { endPosition?: unknown; position?: unknown }) => void, type: unknown) => void;
  };
  ScreenSpaceEventType: {
    LEFT_CLICK: unknown;
    LEFT_DOUBLE_CLICK: unknown;
    LEFT_DOWN: unknown;
    LEFT_UP: unknown;
    MOUSE_MOVE: unknown;
    RIGHT_CLICK: unknown;
  };
};

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    Cesium?: CesiumNamespace;
  }
}

let cesiumLoadPromise: Promise<CesiumNamespace> | null = null;

export function loadCesium() {
  if (window.Cesium) {
    return Promise.resolve(window.Cesium);
  }

  if (cesiumLoadPromise) {
    return cesiumLoadPromise;
  }

  window.CESIUM_BASE_URL = CESIUM_BASE_URL;

  cesiumLoadPromise = new Promise<CesiumNamespace>((resolve, reject) => {
    const existingStyle = document.getElementById('cesium-widgets-css');

    if (!existingStyle) {
      const link = document.createElement('link');
      link.id = 'cesium-widgets-css';
      link.rel = 'stylesheet';
      link.href = `${CESIUM_BASE_URL}Widgets/widgets.css`;
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById('cesium-runtime') as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.Cesium) {
          resolve(window.Cesium);
        } else {
          reject(new Error('Cesium runtime loaded without window.Cesium'));
        }
      }, { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Cesium runtime failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'cesium-runtime';
    script.src = `${CESIUM_BASE_URL}Cesium.js`;
    script.async = true;
    script.onload = () => {
      if (window.Cesium) {
        resolve(window.Cesium);
      } else {
        reject(new Error('Cesium runtime loaded without window.Cesium'));
      }
    };
    script.onerror = () => reject(new Error('Cesium runtime failed to load'));
    document.body.appendChild(script);
  });

  return cesiumLoadPromise;
}

export function configureCesiumIonToken(Cesium: CesiumNamespace) {
  const token = (import.meta.env.VITE_CESIUM_ION_TOKEN ?? '').trim();

  if (token && Cesium.Ion) {
    Cesium.Ion.defaultAccessToken = token;
  }
}
