import type { CesiumLayerNamespace } from './cesiumLayerOptions';

const CESIUM_BASE_URL = '/cesium/';

export type CesiumSceneModel = {
  show: boolean;
  modelMatrix: unknown;
  boundingSphere?: { center: { x: number; y: number; z: number }; radius: number } | undefined;
  activeAnimations?: { addAll: (options: { loop?: unknown }) => unknown } | undefined;
};

export type CesiumViewer = {
  camera: {
    changed?: {
      addEventListener: (callback: () => void) => () => void;
    };
    positionCartographic: { longitude: number; latitude: number; height: number };
    flyToBoundingSphere: (boundingSphere: unknown, options?: Record<string, unknown>) => void;
    computeViewRectangle?: (ellipsoid?: unknown) => { east: number; north: number; south: number; west: number } | undefined;
    zoomIn: (amount?: number) => void;
    zoomOut: (amount?: number) => void;
    flyTo: (options: { destination: unknown; duration?: number }) => void;
    setView: (options: { destination: unknown; orientation?: Record<string, unknown> }) => void;
    pickEllipsoid?: (windowPosition: unknown, ellipsoid?: unknown) => unknown;
    getPickRay?: (windowPosition: unknown) => unknown;
    viewMatrix?: ArrayLike<number>;
    positionWC?: { x: number; y: number; z: number };
    directionWC?: { x: number; y: number; z: number };
    frustum?: { projectionMatrix?: ArrayLike<number> };
  };
  canvas: HTMLCanvasElement;
  clock: {
    currentTime: unknown;
    multiplier: number;
    shouldAnimate: boolean;
  };
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
  resolutionScale: number;
  shadows: boolean;
  scene: {
    backgroundColor: unknown;
    globe: {
      baseColor: unknown;
      depthTestAgainstTerrain?: boolean;
      ellipsoid?: unknown;
      enableLighting: boolean;
      getHeight?: (cartographic: unknown) => number | undefined;
      pick?: (ray: unknown, scene: unknown) => unknown | undefined;
      shadows?: unknown;
      show: boolean;
      tileLoadProgressEvent?: {
        addEventListener: (callback: (queuedTileCount: number) => void) => () => void;
      };
    };
    pick?: (windowPosition: unknown) => { id?: unknown } | undefined;
    pickPosition?: (windowPosition: unknown) => unknown;
    primitives: {
      add: (primitive: unknown) => unknown;
      remove: (primitive: unknown) => boolean;
    };
    postRender: {
      addEventListener: (callback: () => void) => () => void;
    };
    postProcessStages: {
      fxaa: {
        enabled: boolean;
      };
    };
    requestRender?: () => void;
    shadowMap: {
      enabled: boolean;
    };
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
  Model: {
    fromGltfAsync: (options: { url: string; cesium?: CesiumNamespace }) => Promise<CesiumSceneModel>;
  };
  AnimationLoop: {
    REPEAT: unknown;
  };
  BoundingSphere: new (center: unknown, radius: number) => unknown;
  HeadingPitchRange: new (heading: number, pitch: number, range: number) => unknown;
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
    divideByScalar: (cartesian: unknown, scalar: number, result: unknown) => unknown;
    dot: (left: unknown, right: unknown) => number;
    fromDegrees: (longitude: number, latitude: number, height: number) => unknown;
    fromRadians: (longitude: number, latitude: number, height: number) => unknown;
    lerp: (start: unknown, end: unknown, t: number, result: unknown) => unknown;
    magnitude: (cartesian: unknown) => number;
    midpoint: (left: unknown, right: unknown, result: unknown) => unknown;
    multiplyByScalar: (cartesian: unknown, scalar: number, result: unknown) => unknown;
    normalize: (cartesian: unknown, result: unknown) => unknown;
    subtract: (left: unknown, right: unknown, result: unknown) => unknown;
  };
  Cartesian2: new (x: number, y: number) => unknown;
  Matrix4: {
    new (): unknown;
    IDENTITY: unknown;
    fromTranslation: (translation: unknown, result: unknown) => unknown;
    fromUniformScale: (scale: number, result: unknown) => unknown;
    getTranslation: (matrix: unknown, result: unknown) => unknown;
    multiplyTransformation: (left: unknown, right: unknown, result: unknown) => unknown;
    inverse: (matrix: unknown, result: unknown) => unknown;
    multiplyByPoint: (matrix: unknown, cartesian: unknown, result: unknown) => unknown;
  };
  PolygonHierarchy: new (positions: unknown[]) => unknown;
  PolylineDashMaterialProperty: new (options: Record<string, unknown>) => unknown;
  PolylineGlowMaterialProperty: new (options: Record<string, unknown>) => unknown;
  ArcType: {
    GEODESIC: unknown;
    NONE: unknown;
  };
  CallbackProperty: new (callback: () => unknown, isConstant: boolean) => unknown;
  ColorMaterialProperty: new (colorOrProperty: unknown) => unknown;
  LabelStyle: {
    FILL_AND_OUTLINE: unknown;
  };
  sampleTerrainMostDetailed: (
    terrainProvider: unknown,
    positions: unknown[],
    options?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  Transforms: {
    eastNorthUpToFixedFrame: (origin: unknown) => unknown;
  };
  Cartographic: {
    new (longitude?: number, latitude?: number, height?: number): { longitude: number; latitude: number; height: number };
    clone: (cartographic: unknown) => unknown;
    fromCartesian: (cartesian: unknown) => { longitude: number; latitude: number; height: number };
    fromDegrees: (longitude: number, latitude: number, height?: number) => unknown;
  };
  Color: {
    LIGHTGREY: unknown;
    SKYBLUE: unknown;
    WHITE: unknown;
    fromAlpha: (color: unknown, alpha: number) => unknown;
    fromCssColorString: (color: string) => unknown;
  };
  LabelGraphics: new (options: Record<string, unknown>) => unknown;
  VerticalOrigin: {
    BOTTOM: unknown;
    CENTER?: unknown;
    TOP?: unknown;
  };
  HeightReference: {
    CLAMP_TO_GROUND: unknown;
    NONE?: unknown;
    RELATIVE_TO_GROUND?: unknown;
  };
  Ion?: {
    defaultAccessToken: string;
  };
  JulianDate: {
    fromDate: (date: Date) => unknown;
    now: () => unknown;
  };
  Math: {
    toDegrees: (radians: number) => number;
    toRadians: (degrees: number) => number;
  };
  SceneMode: {
    SCENE2D: unknown;
  };
  ShadowMode: {
    ENABLED: unknown;
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
