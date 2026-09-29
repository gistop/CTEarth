import type { CesiumNamespace, CesiumViewer } from '../maps/components/map/cesiumRuntime';

// ================= 地球内部圈层剖面（教学演示） =================
// 原理（移植自 cesiumtest 的 earth-cutaway.js）：用三个 clipping plane 裁掉
// +X/+Y/+Z 八分体，再在三个切面上按真实半径绘制六个圈层的四分之一环面。
// 保留地球外部纹理，同时用底面和两个立面封住切口，避免看到黑色背景。
// 依赖 Cesium 1.120+ 的 globe.clippingPlanes 支持。

const KM = 1000;
const EQ_RADIUS_KM = 6378.137; // WGS84 赤道半径：赤道切面的基准半径

export type EarthLayerInfo = {
  name: string;
  range: string;
  note: string;
  color: string;
  r0: number;
  r1: number;
};

// 半径单位为 km，取自赤道切面，相邻层内外环首尾相接，保证切面上没有缝隙。
// 内核内半径取 50 而非 0：r = 0 会让顶点落在原点，Cesium 无法把地心投影到 2D。
// 配色按地温梯度由外向内升温：褐（冷）→ 暗红 → 橙红 → 亮橙 → 橙黄 → 白黄（最热）。
export const EARTH_LAYERS: EarthLayerInfo[] = [
  {
    name: '地壳 Crust',
    range: '0 ~ 35 km',
    note: '大陆 30~50 km，海洋 5~10 km；底界为莫霍面（Moho）',
    color: '#6d4a32',
    r0: EQ_RADIUS_KM - 35,
    r1: EQ_RADIUS_KM,
  },
  {
    name: '软流层 Asthenosphere',
    range: '约 35 ~ 250 km',
    note: '上地幔上部，岩浆来源，板块在此滑动',
    color: '#b8371a',
    r0: EQ_RADIUS_KM - 250,
    r1: EQ_RADIUS_KM - 35,
  },
  {
    name: '上地幔 Mantle（上）',
    range: '250 ~ 660 km',
    note: '岩石圈地幔 + 过渡带',
    color: '#d4551f',
    r0: 5711,
    r1: EQ_RADIUS_KM - 250,
  },
  {
    name: '下地幔 Mantle（下）',
    range: '660 ~ 2900 km',
    note: '固态高压岩石；底界为古登堡面（2900 km）',
    color: '#ef8425',
    r0: 3471,
    r1: 5711,
  },
  {
    name: '外核 Outer Core',
    range: '2900 ~ 5150 km',
    note: '液态铁镍，流动产生地球磁场',
    color: '#ffc043',
    r0: 1221,
    r1: 3471,
  },
  {
    name: '内核 Inner Core',
    range: '5150 ~ 6371 km（地心）',
    note: '固态铁镍，极高温高压',
    color: '#fff6cf',
    r0: 50,
    r1: 1221,
  },
];

const STEPS = 240; // 圆周分段

// 三个切面各自的亮度模拟固定方向光，让互相垂直的平面在交线处视觉可分：
// 赤道面最亮，两个立面依次变暗。
const FACE_SHADE = { xy: 1.0, yz: 0.78, xz: 0.58 };

type CutawayFace = keyof typeof FACE_SHADE;

function buildLayerCutawayGeometry(Cesium: CesiumNamespace, layer: EarthLayerInfo, face: CutawayFace) {
  const r0 = layer.r0 * KM;
  const r1 = layer.r1 * KM;
  const segments = Math.ceil(STEPS / 4);
  const positions: number[] = [];
  const indices: number[] = [];
  const baseVertex = 0;

  for (let j = 0; j <= segments; j += 1) {
    const angle = (j / segments) * Math.PI / 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const radii = [r0, r1];

    for (const radius of radii) {
      if (face === 'xy') {
        positions.push(radius * c, radius * s, 0);
      } else if (face === 'yz') {
        positions.push(0, radius * c, radius * s);
      } else {
        positions.push(radius * c, 0, radius * s);
      }
    }
  }

  for (let j = 0; j < segments; j += 1) {
    const a = baseVertex + j * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    // 双面绕组：剖面需要从内部也可见。
    indices.push(a, c, b, b, c, d, c, a, d, d, a, b);
  }

  return new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(positions),
      }),
    },
    indices: new Uint16Array(indices),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: new Cesium.BoundingSphere(
      new Cesium.Cartesian3(0, 0, 0),
      EQ_RADIUS_KM * KM,
    ),
  });
}

function buildSectionPrimitive(Cesium: CesiumNamespace, viewer: CesiumViewer) {
  const instances: unknown[] = [];

  EARTH_LAYERS.forEach((layer) => {
    (Object.keys(FACE_SHADE) as CutawayFace[]).forEach((face) => {
      const shaded = Cesium.Color.multiplyByScalar(
        Cesium.Color.fromCssColorString(layer.color),
        FACE_SHADE[face],
        new Cesium.Color(),
      );

      instances.push(new Cesium.GeometryInstance({
        geometry: buildLayerCutawayGeometry(Cesium, layer, face),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(shaded),
        },
      }));
    });
  });

  return viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({
        flat: true,
        closed: false,
        translucent: false,
      }),
      asynchronous: false,
    }),
  );
}

export type EarthLayersSession = {
  disable: () => void;
};

export function enableEarthLayersCutaway(Cesium: CesiumNamespace, viewer: CesiumViewer): EarthLayersSession {
  const globe = viewer.scene.globe;
  const previousClippingPlanes = globe.clippingPlanes;

  if (!Cesium.ClippingPlaneCollection || !Cesium.ClippingPlane) {
    throw new Error('当前 Cesium 运行时不支持平面裁剪，需要 1.120 及以上版本');
  }

  // 三个平面只裁掉 +X/+Y/+Z 八分体，下方三个四分之一环面在视觉上封住切口。
  globe.clippingPlanes = new Cesium.ClippingPlaneCollection({
    planes: [
      new Cesium.ClippingPlane(new Cesium.Cartesian3(-1, 0, 0), 0),
      new Cesium.ClippingPlane(new Cesium.Cartesian3(0, -1, 0), 0),
      new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, -1), 0),
    ],
    unionClippingRegions: false,
    edgeWidth: 1.0,
    edgeColor: Cesium.Color.fromAlpha(Cesium.Color.WHITE, 0.4),
  });

  const primitive = buildSectionPrimitive(Cesium, viewer);

  // 相机正对被切掉的八分体，使水平与垂直切面同时可见。
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(45, 35, 9500000),
    orientation: {
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0,
    },
    duration: 2.5,
  });

  return {
    disable: () => {
      globe.clippingPlanes = previousClippingPlanes;

      if (primitive !== undefined) {
        try {
          viewer.scene.primitives.remove(primitive);
        } catch {
          // viewer 可能已销毁（如切换地图模式），忽略。
        }
      }
    },
  };
}
