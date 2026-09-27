import { useSyncExternalStore } from 'react';
import type { CesiumNamespace, CesiumViewer } from './cesiumRuntime';

/**
 * 三维模型顶点吸附（参考 cesiumtest 项目的 glb 顶点吸附实现）：
 * 从加载的 glb/gltf 中解码全部 POSITION 顶点，光标移动时把顶点投影到屏幕，
 * 测量选点优先吸附到光标附近（默认 20px 内）最近的模型顶点。
 *
 * 坐标链：glTF 节点矩阵（提取时烘焙） → Y_UP_TO_Z_UP 旋转 → Cesium modelMatrix → 世界坐标。
 * Draco/meshopt 压缩或稀疏属性的模型无法解码，自动跳过（不影响测量本身）。
 */

const SNAP_RADIUS_PX = 20; // 屏幕吸附半径（像素）
const SNAP_MAX_VERTICES = 200000; // 参与吸附的最大顶点数（超出按步长抽样）

export type SceneModelSnapModelInfo = {
  matrix: ArrayLike<number> | null; // Cesium.Matrix4（列主序 16 元素，Float64Array）
  visible: boolean;
};

type SnapSource = {
  getModel: () => SceneModelSnapModelInfo | null;
  localPositions: Float64Array | null; // glTF 节点空间顶点（Y-up，已含节点矩阵）
  worldPositions: Float64Array | null; // 世界坐标缓存
  cachedMatrix: Float64Array | null; // 生成 worldPositions 时的 modelMatrix 副本
};

const sources = new Map<string, SnapSource>();

// ================= 吸附开关（模块级 store，各测量面板共享） =================

let snapEnabled = true;
const snapListeners = new Set<() => void>();

export function isSceneModelSnapEnabled() {
  return snapEnabled;
}

export function setSceneModelSnapEnabled(enabled: boolean) {
  if (snapEnabled === enabled) {
    return;
  }

  snapEnabled = enabled;
  snapListeners.forEach((listener) => listener());
}

function subscribeSceneModelSnap(listener: () => void) {
  snapListeners.add(listener);
  return () => {
    snapListeners.delete(listener);
  };
}

export function useSceneModelSnapEnabled() {
  return useSyncExternalStore(subscribeSceneModelSnap, isSceneModelSnapEnabled);
}

// ================= 模型顶点源注册 =================

export function registerSceneModelSnapSource(
  id: string,
  url: string,
  fileName: string,
  getModel: () => SceneModelSnapModelInfo | null,
) {
  sources.set(id, { getModel, localPositions: null, worldPositions: null, cachedMatrix: null });

  void extractModelVertices(url, fileName)
    .then((positions) => {
      const source = sources.get(id);

      if (source && positions) {
        source.localPositions = positions;
        source.worldPositions = null; // 顶点更新后重置世界缓存
      }
    })
    .catch(() => {
      // 顶点提取失败（压缩模型等）：吸附自动不可用
    });
}

export function unregisterSceneModelSnapSource(id: string) {
  sources.delete(id);
}

export function hasSceneModelSnapSources() {
  return sources.size > 0;
}

// ================= 顶点提取（glb/gltf 解析，纯 JS 矩阵运算） =================

async function extractModelVertices(url: string, fileName: string): Promise<Float64Array | null> {
  const gltf = /\.gltf$/i.test(fileName)
    ? await loadGltfJson(url)
    : parseGlbContainer(await (await fetch(url)).arrayBuffer());

  return collectGltfPositions(gltf);
}

/** 解析 GLB 二进制容器：JSON 块 + BIN 块 */
function parseGlbContainer(buffer: ArrayBuffer) {
  const dv = new DataView(buffer);

  if (buffer.byteLength < 12 || dv.getUint32(0, true) !== 0x46546c67) {
    throw new Error('不是有效的 GLB 文件');
  }

  let offset = 12;
  let json: Record<string, unknown> | null = null;
  const bins: ArrayBuffer[] = [];

  while (offset + 8 <= buffer.byteLength) {
    const chunkLength = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const start = offset + 8;

    if (start + chunkLength > buffer.byteLength) {
      break;
    }

    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, chunkLength)));
    } else if (chunkType === 0x004e4942) {
      bins.push(buffer.slice(start, start + chunkLength));
    }

    offset = start + chunkLength;
  }

  if (!json) {
    throw new Error('GLB 缺少 JSON 块');
  }

  return { ...json, bins } as Record<string, unknown>;
}

/** 解析 .gltf（JSON）文件：仅支持 data URI 内嵌 buffer */
async function loadGltfJson(url: string) {
  const json = JSON.parse(await (await fetch(url)).text()) as Record<string, unknown>;
  const bins: ArrayBuffer[] = [];
  const buffers = (json.buffers as Array<{ uri?: string }> | undefined) ?? [];

  for (let i = 0; i < buffers.length; i += 1) {
    const uri = buffers[i] && buffers[i].uri;

    if (typeof uri === 'string' && uri.startsWith('data:')) {
      bins.push(await (await fetch(uri)).arrayBuffer());
    } else {
      throw new Error('外部 .bin 的 .gltf 不支持，请转成 .glb 再加载');
    }
  }

  return { ...json, bins };
}

type GltfNode = {
  children?: number[];
  matrix?: number[];
  mesh?: number | null;
  rotation?: number[];
  scale?: number[];
  translation?: number[];
};

/** 遍历场景节点（世界矩阵 = 父矩阵 × 本节点矩阵），收集每个 mesh primitive 的 POSITION 顶点 */
function collectGltfPositions(gltf: Record<string, unknown>): Float64Array | null {
  const accessors = (gltf.accessors as Array<Record<string, unknown>> | undefined) ?? [];
  const bufferViews = (gltf.bufferViews as Array<Record<string, unknown>> | undefined) ?? [];
  const meshes = (gltf.meshes as Array<{ primitives?: Array<{ attributes?: { POSITION?: number } }> }> | undefined) ?? [];
  const nodes = (gltf.nodes as GltfNode[] | undefined) ?? [];
  const bins = (gltf.bins as ArrayBuffer[] | undefined) ?? [];

  if (!meshes.length || !accessors.length || !bins.length) {
    return null;
  }

  const items: Array<{ matrix: Float64Array; accessor: number }> = [];

  const traverse = (index: number, parent: Float64Array) => {
    const node = nodes[index];

    if (!node) {
      return;
    }

    const world = multiplyMatrix4(parent, nodeMatrix(node));
    const primitives = node.mesh != null && meshes[node.mesh] ? meshes[node.mesh].primitives ?? [] : [];

    primitives.forEach((primitive) => {
      const accessorIndex = primitive.attributes ? primitive.attributes.POSITION : undefined;

      if (accessorIndex != null) {
        items.push({ matrix: world, accessor: accessorIndex });
      }
    });

    (node.children ?? []).forEach((child) => traverse(child, world));
  };

  const scenes = gltf.scenes as Array<{ nodes?: number[] }> | undefined;
  const roots = ((scenes ?? [])[Number(gltf.scene ?? 0) ?? 0] ?? {}).nodes ?? [];
  roots.forEach((root) => traverse(root, identityMatrix4()));

  let total = 0;
  items.forEach((item) => {
    total += Number((accessors[item.accessor] as { count?: number } | undefined)?.count ?? 0);
  });

  if (!total) {
    return null;
  }

  const step = Math.max(1, Math.ceil(total / SNAP_MAX_VERTICES));
  const out: number[] = [];

  items.forEach((item) => {
    const positions = decodePositionAccessor(accessors[item.accessor], bufferViews, bins);

    if (!positions) {
      return;
    }

    for (let i = 0; i < positions.length; i += 3 * step) {
      const p = multiplyMatrix4ByPoint(item.matrix, positions[i], positions[i + 1], positions[i + 2]);
      out.push(p[0], p[1], p[2]);
    }
  });

  return out.length ? new Float64Array(out) : null;
}

/** 解码 POSITION accessor：支持 FLOAT 与量化 USHORT/UINT/UBYTE/SHORT（min/max 反量化） */
function decodePositionAccessor(
  accessor: Record<string, unknown> | undefined,
  bufferViews: Array<Record<string, unknown>>,
  bins: ArrayBuffer[],
): Float64Array | null {
  if (!accessor || accessor.type !== 'VEC3' || accessor.sparse || accessor.bufferView == null) {
    return null;
  }

  const bufferView = bufferViews[Number(accessor.bufferView)];

  if (!bufferView || !bins[Number(bufferView.buffer)]) {
    return null;
  }

  const compType = Number(accessor.componentType);
  const compSize = ({ 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1 } as Record<number, number>)[compType];
  const count = Number(accessor.count ?? 0);

  if (!compSize || !count) {
    return null;
  }

  const bin = bins[Number(bufferView.buffer)];
  const dv = new DataView(bin);
  const base = Number(bufferView.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
  const stride = Number(bufferView.byteStride ?? 0) || compSize * 3;

  if (base + count * stride > bin.byteLength) {
    return null;
  }

  const normMax = ({ 5125: 4294967295, 5123: 65535, 5122: 32767, 5121: 255 } as Record<number, number>)[compType];
  const min = accessor.min as number[] | undefined;
  const max = accessor.max as number[] | undefined;
  const useMinMax = compType !== 5126 && Array.isArray(min) && Array.isArray(max);
  const out = new Float64Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      const o = base + i * stride + c * compSize;
      let v: number;

      if (compType === 5126) {
        v = dv.getFloat32(o, true);
      } else if (compType === 5125) {
        v = dv.getUint32(o, true) / normMax;
      } else if (compType === 5123) {
        v = dv.getUint16(o, true) / normMax;
      } else if (compType === 5122) {
        v = dv.getInt16(o, true) / normMax;
      } else {
        v = dv.getUint8(o) / normMax;
      }

      if (useMinMax) {
        v = min![c] + v * (max![c] - min![c]);
      }

      out[i * 3 + c] = v;
    }
  }

  return out;
}

// ================= 列主序 4x4 矩阵工具（纯 JS） =================

function identityMatrix4() {
  const m = new Float64Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

function multiplyMatrix4(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  const out = new Float64Array(16);

  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }

  return out;
}

function multiplyMatrix4ByPoint(m: Float64Array | number[], x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function nodeMatrix(node: GltfNode): Float64Array {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return Float64Array.from(node.matrix);
  }

  const t = node.translation ?? [0, 0, 0];
  const q = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  return composeTRS(t, q, s);
}

/** 由平移/四元数(xyzw)/缩放组合列主序矩阵，等价 Cesium.Matrix4.fromTranslationQuaternionRotationScale */
function composeTRS(t: number[], q: number[], s: number[]): Float64Array {
  const [qx, qy, qz, qw] = q;
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const yy = qy * y2;
  const zz = qz * z2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yz = qy * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  const m = new Float64Array(16);
  m[0] = (1 - (yy + zz)) * s[0];
  m[1] = (xy + wz) * s[0];
  m[2] = (xz - wy) * s[0];
  m[3] = 0;
  m[4] = (xy - wz) * s[1];
  m[5] = (1 - (xx + zz)) * s[1];
  m[6] = (yz + wx) * s[1];
  m[7] = 0;
  m[8] = (xz + wy) * s[2];
  m[9] = (yz - wx) * s[2];
  m[10] = (1 - (xx + yy)) * s[2];
  m[11] = 0;
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  m[15] = 1;
  return m;
}

// ================= 顶点吸附取点 =================

export type SnappedVertex = { x: number; y: number; z: number };

/** 模型局部顶点 → 世界坐标；modelMatrix 变化（缩放/微调/贴地校正）时自动重算 */
function getWorldPositions(source: SnapSource): Float64Array | null {
  if (!source.localPositions) {
    return null;
  }

  const model = source.getModel();

  if (!model || !model.visible || !model.matrix || model.matrix.length < 16) {
    return null;
  }

  const m = model.matrix;

  if (source.worldPositions && source.cachedMatrix && matricesEqual(source.cachedMatrix, m)) {
    return source.worldPositions;
  }

  const src = source.localPositions;
  const world = new Float64Array(src.length);

  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1];
    const z = src[i + 2];

    // glTF 是 Y-up，Cesium 渲染 glb 时内部先做 Y_UP_TO_Z_UP 旋转（不包含在 modelMatrix 中）：
    // (x, y, z) → (x, -z, y)，再用 modelMatrix 变换到世界坐标
    const px = x;
    const py = -z;
    const pz = y;

    world[i] = m[0] * px + m[4] * py + m[8] * pz + m[12];
    world[i + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13];
    world[i + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14];
  }

  source.worldPositions = world;
  source.cachedMatrix = Float64Array.from(Array.from(m as ArrayLike<number>).slice(0, 16));

  return world;
}

function matricesEqual(cached: Float64Array, current: ArrayLike<number>) {
  if (cached.length !== 16 || current.length < 16) {
    return false;
  }

  for (let i = 0; i < 16; i += 1) {
    if (cached[i] !== current[i]) {
      return false;
    }
  }

  return true;
}

/** 把全部模型顶点投影到屏幕，找光标 SNAP_RADIUS_PX 像素内最近的顶点 */
export function pickSnappedModelVertex(viewer: CesiumViewer, windowPosition: unknown): SnappedVertex | null {
  if (!sources.size || viewer.isDestroyed()) {
    return null;
  }

  const wp = windowPosition as { x?: number; y?: number } | null | undefined;

  if (!wp || !Number.isFinite(wp.x) || !Number.isFinite(wp.y)) {
    return null;
  }

  const camera = viewer.camera;
  const projection = camera.frustum?.projectionMatrix;
  const view = camera.viewMatrix;
  const camPos = camera.positionWC;
  const camDir = camera.directionWC;

  if (!projection || !view || !camPos || !camDir) {
    return null;
  }

  const mvp = multiplyMatrix4(projection, view);
  const width = viewer.canvas.clientWidth;
  const height = viewer.canvas.clientHeight;
  const limit2 = SNAP_RADIUS_PX * SNAP_RADIUS_PX;

  let bestD2 = limit2;
  let best: SnappedVertex | null = null;

  sources.forEach((source) => {
    const world = getWorldPositions(source);

    if (!world) {
      return;
    }

    for (let i = 0; i < world.length; i += 3) {
      const x = world[i];
      const y = world[i + 1];
      const z = world[i + 2];

      const vx = x - camPos.x;
      const vy = y - camPos.y;
      const vz = z - camPos.z;

      if (vx * camDir.x + vy * camDir.y + vz * camDir.z <= 0) {
        continue; // 相机背后的顶点跳过
      }

      const clipX = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
      const clipY = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
      const clipW = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];

      if (clipW <= 0) {
        continue;
      }

      const sx = ((clipX / clipW + 1) * 0.5) * width;
      const sy = ((1 - clipY / clipW) * 0.5) * height;
      const dx = sx - wp.x!;
      const dy = sy - wp.y!;
      const d2 = dx * dx + dy * dy;

      if (d2 < bestD2) {
        bestD2 = d2;
        best = { x, y, z };
      }
    }
  });

  return best;
}

// ================= 悬停吸附标记（跟随光标显示最近可吸附顶点） =================

type SnapScene = {
  viewer: CesiumViewer;
  handler: { destroy: () => void };
  markerEntity: { show?: boolean } & Record<string, unknown>;
  markerPosition: SnappedVertex | null;
};

let snapScene: SnapScene | null = null;

/** 在三维场景上启用顶点吸附悬停标记；返回分离函数（离开三维模式时调用） */
export function attachSceneModelSnapScene(Cesium: CesiumNamespace, viewer: CesiumViewer): () => void {
  if (snapScene && snapScene.viewer === viewer) {
    return () => undefined;
  }

  detachSceneModelSnapScene();

  const scene: SnapScene = {
    viewer,
    handler: null as unknown as SnapScene['handler'],
    markerEntity: null as unknown as SnapScene['markerEntity'],
    markerPosition: null,
  };

  scene.markerEntity = viewer.entities.add({
    position: new Cesium.CallbackProperty(() => scene.markerPosition, false),
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString('#7dff5a'),
      outlineColor: Cesium.Color.fromCssColorString('#101820'),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }) as SnapScene['markerEntity'];
  scene.markerEntity.show = false;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction((event: { endPosition?: unknown }) => {
    if (viewer.isDestroyed()) {
      return;
    }

    if (!isSceneModelSnapEnabled()) {
      setSnapMarkerVisible(scene, false);
      return;
    }

    const snapped = pickSnappedModelVertex(viewer, event.endPosition);
    scene.markerPosition = snapped;
    setSnapMarkerVisible(scene, Boolean(snapped));
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  scene.handler = handler;

  snapScene = scene;

  return () => {
    if (snapScene === scene) {
      detachSceneModelSnapScene();
    }
  };
}

function setSnapMarkerVisible(scene: SnapScene, visible: boolean) {
  scene.markerEntity.show = visible;
}

function detachSceneModelSnapScene() {
  if (!snapScene) {
    return;
  }

  const { viewer, handler, markerEntity } = snapScene;

  try {
    handler.destroy();
  } catch {
    // viewer 已销毁时忽略
  }

  if (!viewer.isDestroyed()) {
    viewer.entities.remove(markerEntity as never);
  }

  snapScene = null;
}
