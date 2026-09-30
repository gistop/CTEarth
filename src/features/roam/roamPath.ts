// 漫游路径：航点插值采样、环绕模板生成、轨迹统计。
// 与 cesiumtest/record.js 的路径接口（applyProgress / FRAME_COUNT）兼容的适配器也在此构造。

import {
  DEFAULT_WAYPOINT_DURATION,
  type RoamPose,
  type RoamRoute,
  type RoamWaypoint,
} from './types';

const EARTH_RADIUS_M = 6371008.8;

export function normalizeAngleDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

/** 最短角度差（-180..180） */
export function angleDeltaDeg(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** 两点大圆距离（米） */
export function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 从起点按方位角前进 distance 米的目标点（球面公式） */
export function destinationPoint(
  lon: number,
  lat: number,
  bearingDeg: number,
  distanceM: number,
): { lon: number; lat: number } {
  const toRad = Math.PI / 180;
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = bearingDeg * toRad;
  const phi1 = lat * toRad;
  const lambda1 = lon * toRad;
  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.min(1, Math.max(-1, sinPhi2)));
  const lambda2 = lambda1 + Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * sinPhi2,
  );

  return { lon: lambda2 / toRad, lat: phi2 / toRad };
}

/** from → to 的初始方位角（度） */
export function bearingDeg(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const toRad = Math.PI / 180;
  const phi1 = fromLat * toRad;
  const phi2 = toLat * toRad;
  const dLambda = (toLon - fromLon) * toRad;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  return normalizeAngleDeg(Math.atan2(y, x) / toRad);
}

// ---------------------------------------------------------------------------
// 插值采样
// ---------------------------------------------------------------------------

type SegmentInfo = { startIndex: number; endTime: number };

function buildSegments(waypoints: RoamWaypoint[]): { segments: SegmentInfo[]; total: number } {
  const segments: SegmentInfo[] = [];
  let time = 0;

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const duration = Math.max(0.1, waypoints[index].duration || DEFAULT_WAYPOINT_DURATION);
    time += duration;
    segments.push({ startIndex: index, endTime: time });
  }

  return { segments, total: time };
}

/** Catmull-Rom 一维插值（端点钳制） */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;

  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 按 progress ∈ [0,1] 采样相机姿态。
 * 位置（经纬度/高度）用 Catmull-Rom 平滑插值，姿态角用最短路径线性插值。
 */
export function samplePose(route: RoamRoute, progress: number): RoamPose | null {
  const { waypoints } = route;

  if (waypoints.length === 0) {
    return null;
  }

  if (waypoints.length === 1) {
    const waypoint = waypoints[0];

    return {
      lon: waypoint.lon,
      lat: waypoint.lat,
      height: waypoint.height,
      heading: waypoint.heading,
      pitch: waypoint.pitch,
    };
  }

  const { segments, total } = buildSegments(waypoints);
  const time = clamp(progress, 0, 1) * total;
  let segment = segments[segments.length - 1];

  for (const candidate of segments) {
    if (time <= candidate.endTime || candidate === segments[segments.length - 1]) {
      segment = candidate;
      break;
    }
  }

  const previous = segments[segments.indexOf(segment) - 1];
  const segmentStart = previous ? previous.endTime : 0;
  const rawLocal = segment.endTime > segmentStart ? (time - segmentStart) / (segment.endTime - segmentStart) : 1;
  const local = clamp(rawLocal, 0, 1);
  // smoothstep 缓入缓出，避免折线航点处的姿态突变
  const eased = local * local * (3 - 2 * local);
  const i = segment.startIndex;
  const at = (offset: number) => waypoints[clamp(i + offset, 0, waypoints.length - 1)];
  const a = at(-1);
  const b = at(0);
  const c = at(1);
  const d = at(2);

  return {
    lon: catmullRom(a.lon, b.lon, c.lon, d.lon, eased),
    lat: catmullRom(a.lat, b.lat, c.lat, d.lat, eased),
    height: Math.max(0, catmullRom(a.height, b.height, c.height, d.height, eased)),
    heading: normalizeAngleDeg(b.heading + angleDeltaDeg(b.heading, c.heading) * eased),
    pitch: b.pitch + (c.pitch - b.pitch) * eased,
  };
}

/** 航线总时长（秒） */
export function totalDuration(route: RoamRoute): number {
  return buildSegments(route.waypoints).total;
}

/** 录制总帧数（至少 2 帧） */
export function frameCount(route: RoamRoute): number {
  return Math.max(2, Math.round(totalDuration(route) * route.fps));
}

/** pingpong 往返映射：0..2 → 0..1..0 */
export function pingpongProgress(t: number): number {
  const cycled = t % 2;

  return cycled <= 1 ? cycled : 2 - cycled;
}

// ---------------------------------------------------------------------------
// 轨迹统计（辅助视口用）
// ---------------------------------------------------------------------------

export type RoamTrackPoint = {
  lon: number;
  lat: number;
  height: number;
  /** 东向偏移（米，相对首航点） */
  east: number;
  /** 北向偏移（米，相对首航点） */
  north: number;
  /** 沿轨迹累计距离（米） */
  cumulative: number;
};

export function buildTrack(route: RoamRoute): RoamTrackPoint[] {
  const points: RoamTrackPoint[] = [];
  const origin = route.waypoints[0];

  if (!origin) {
    return points;
  }

  const originCosLat = Math.cos(origin.lat * Math.PI / 180);
  const metersPerDegLat = Math.PI * EARTH_RADIUS_M / 180;
  let cumulative = 0;

  route.waypoints.forEach((waypoint, index) => {
    if (index > 0) {
      cumulative += haversineM(route.waypoints[index - 1].lon, route.waypoints[index - 1].lat, waypoint.lon, waypoint.lat);
    }
    points.push({
      lon: waypoint.lon,
      lat: waypoint.lat,
      height: waypoint.height,
      east: (waypoint.lon - origin.lon) * metersPerDegLat * originCosLat,
      north: (waypoint.lat - origin.lat) * metersPerDegLat,
      cumulative,
    });
  });

  return points;
}

// ---------------------------------------------------------------------------
// 环绕模板
// ---------------------------------------------------------------------------

export type OrbitParams = {
  centerLon: number;
  centerLat: number;
  /** 中心点地面海拔（米） */
  groundHeight: number;
  /** 环绕半径（米） */
  radiusM: number;
  /** 相机海拔（米） */
  altitudeM: number;
  /** 起始方位（度，从中心看向相机） */
  startBearingDeg: number;
  /** 总环绕角度（度，正值顺时针） */
  totalAngleDeg: number;
  /** 总时长（秒） */
  durationS: number;
  /** 段数（航点数 = 段数 + 1） */
  segments: number;
};

export function buildOrbitWaypoints(params: OrbitParams): RoamWaypoint[] {
  const segments = Math.max(4, Math.round(params.segments));
  const duration = Math.max(0.5, params.durationS) / segments;
  const waypoints: RoamWaypoint[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const bearing = params.startBearingDeg + params.totalAngleDeg * index / segments;
    const position = destinationPoint(params.centerLon, params.centerLat, bearing, params.radiusM);
    const backBearing = bearingDeg(position.lon, position.lat, params.centerLon, params.centerLat);
    const pitch = -clamp(
      Math.atan2(params.altitudeM - params.groundHeight, params.radiusM) * 180 / Math.PI,
      -89,
      -2,
    );

    waypoints.push({
      id: `orbit-${index}-${Math.random().toString(36).slice(2, 8)}`,
      lon: position.lon,
      lat: position.lat,
      height: params.altitudeM,
      heading: backBearing,
      pitch,
      duration,
    });
  }

  return waypoints;
}

// ---------------------------------------------------------------------------
// 导入 / 导出
// ---------------------------------------------------------------------------

export function serializeRoute(route: RoamRoute): string {
  return JSON.stringify(
    {
      type: 'ctearth-roam-route',
      version: 1,
      name: route.name,
      fps: route.fps,
      loopMode: route.loopMode,
      waypoints: route.waypoints.map((waypoint) => ({
        lon: waypoint.lon,
        lat: waypoint.lat,
        height: waypoint.height,
        heading: waypoint.heading,
        pitch: waypoint.pitch,
        duration: waypoint.duration,
      })),
    },
    null,
    2,
  );
}

export function parseRoute(text: string): RoamRoute {
  const parsed: unknown = JSON.parse(text);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('不是有效的航线文件');
  }

  const record = parsed as Record<string, unknown>;

  if (record.type !== 'ctearth-roam-route' || !Array.isArray(record.waypoints)) {
    throw new Error('不是有效的 CTEarth 航线文件');
  }

  const waypoints: RoamWaypoint[] = record.waypoints.map((item, index) => {
    const raw = item as Record<string, unknown>;
    const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

    return {
      id: `import-${index}-${Math.random().toString(36).slice(2, 8)}`,
      lon: num(raw.lon, 0),
      lat: num(raw.lat, 0),
      height: num(raw.height, 100),
      heading: num(raw.heading, 0),
      pitch: num(raw.pitch, -30),
      duration: Math.max(0.1, num(raw.duration, DEFAULT_WAYPOINT_DURATION)),
    };
  });

  if (waypoints.length === 0) {
    throw new Error('航线文件中没有航点');
  }

  return {
    name: typeof record.name === 'string' ? record.name : '导入的航线',
    waypoints,
    fps: clamp(typeof record.fps === 'number' ? record.fps : 30, 1, 60),
    loopMode: record.loopMode === 'loop' || record.loopMode === 'pingpong' ? record.loopMode : 'once',
  };
}
