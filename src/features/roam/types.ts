// 漫游录制模块：公共类型定义。
// 航点（waypoint）即相机关键帧：位置 + 姿态 + 飞到下一航点的时长。

export type RoamWaypoint = {
  id: string;
  /** 经度（度） */
  lon: number;
  /** 纬度（度） */
  lat: number;
  /** 海拔高度（米） */
  height: number;
  /** 朝向（度，0 = 北，顺时针） */
  heading: number;
  /** 俯仰（度，0 = 水平，负值向下） */
  pitch: number;
  /** 从本航点飞往下一航点的时长（秒），最后一个航点仅在循环模式下生效 */
  duration: number;
};

export type RoamLoopMode = 'once' | 'loop' | 'pingpong';

export type RoamRoute = {
  name: string;
  waypoints: RoamWaypoint[];
  /** 渲染帧率（录制与预览共用） */
  fps: number;
  loopMode: RoamLoopMode;
};

/** 辅助视口投影方向：顶 = 俯视平面图，东南西北 = 侧视剖面图 */
export type RoamAuxDirection = 'top' | 'east' | 'south' | 'west' | 'north';

export const AUX_DIRECTIONS: RoamAuxDirection[] = ['top', 'east', 'south', 'west', 'north'];

export const AUX_DIRECTION_LABELS: Record<RoamAuxDirection, string> = {
  top: '顶',
  east: '东',
  south: '南',
  west: '西',
  north: '北',
};

/** 某一时刻的相机姿态（均为度） */
export type RoamPose = {
  lon: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
};

export const DEFAULT_WAYPOINT_DURATION = 3;
export const DEFAULT_FPS = 30;

let waypointSeq = 0;

export function createWaypointId(): string {
  waypointSeq += 1;

  return `wp-${Date.now().toString(36)}-${waypointSeq}`;
}

export function createDefaultRoute(): RoamRoute {
  return { name: '未命名航线', waypoints: [], fps: DEFAULT_FPS, loopMode: 'once' };
}

export function cloneRoute(route: RoamRoute): RoamRoute {
  return {
    ...route,
    waypoints: route.waypoints.map((waypoint) => ({ ...waypoint })),
  };
}
