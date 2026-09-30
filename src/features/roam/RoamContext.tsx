// 漫游录制 React 上下文：航线数据、UI 状态（录制开关/拾取模式/辅助视口方向），
// 以及由三维场景桥（RoamSceneBridge）注册的执行器（播放/录制/环绕生成等）。
// Ribbon、dock「相机」面板、地图桥三处共享同一份数据。

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createDefaultRoute,
  createWaypointId,
  DEFAULT_WAYPOINT_DURATION,
  type RoamAuxDirection,
  type RoamLoopMode,
  type RoamRoute,
  type RoamWaypoint,
} from './types';

export type RoamPlaybackState = 'idle' | 'playing' | 'paused';

export type RoamRecordingState = {
  active: boolean;
  frame: number;
  total: number;
};

export type RoamLastRecording = {
  name: string;
  sizeBytes: number;
  url: string;
};

/** 由 RoamSceneBridge 实现：所有需要 Cesium viewer 的命令都走这里 */
export type RoamExecutor = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (progress: number) => void;
  record: () => void;
  cancelRecord: () => void;
  /** 以当前视角为中心生成环绕航线（覆盖当前航线），返回是否成功 */
  generateOrbit: () => boolean;
  /** 把当前相机姿态追加为航点 */
  captureView: () => void;
  flyToWaypoint: (id: string) => void;
};

type RoamContextValue = {
  route: RoamRoute;
  replaceRoute: (route: RoamRoute) => void;
  updateWaypoint: (id: string, patch: Partial<Omit<RoamWaypoint, 'id'>>) => void;
  appendWaypoint: (waypoint: Omit<RoamWaypoint, 'id'>) => string;
  removeWaypoint: (id: string) => void;
  moveWaypoint: (id: string, direction: -1 | 1) => void;
  clearWaypoints: () => void;
  setFps: (fps: number) => void;
  setLoopMode: (mode: RoamLoopMode) => void;
  selectedWaypointId: string | null;
  setSelectedWaypointId: (id: string | null) => void;
  /** Ribbon「录制」toggle：开启后播放动作将变为录制 */
  recordArmed: boolean;
  toggleRecordArmed: () => void;
  pickModeActive: boolean;
  setPickModeActive: (active: boolean) => void;
  auxDirection: RoamAuxDirection;
  setAuxDirection: (direction: RoamAuxDirection) => void;
  playbackState: RoamPlaybackState;
  setPlaybackState: (state: RoamPlaybackState) => void;
  /** 低频录制状态镜像（控制 UI 可用性；逐帧进度走 roamBus） */
  recordingState: RoamRecordingState;
  setRecordingState: (state: RoamRecordingState) => void;
  lastRecording: RoamLastRecording | null;
  setLastRecording: (recording: RoamLastRecording | null) => void;
  recordMessage: string | null;
  setRecordMessage: (message: string | null) => void;
  sceneReady: boolean;
  executor: RoamExecutor | null;
  registerExecutor: (executor: RoamExecutor | null) => void;
};

const RoamContext = createContext<RoamContextValue | null>(null);

export function RoamProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<RoamRoute>(createDefaultRoute);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [recordArmed, setRecordArmed] = useState(false);
  const [pickModeActive, setPickModeActive] = useState(false);
  const [auxDirection, setAuxDirection] = useState<RoamAuxDirection>('top');
  const [playbackState, setPlaybackState] = useState<RoamPlaybackState>('idle');
  const [recordingState, setRecordingState] = useState<RoamRecordingState>({ active: false, frame: 0, total: 0 });
  const [lastRecording, setLastRecording] = useState<RoamLastRecording | null>(null);
  const [recordMessage, setRecordMessage] = useState<string | null>(null);
  const [executor, setExecutor] = useState<RoamExecutor | null>(null);

  const registerExecutor = useCallback((next: RoamExecutor | null) => {
    setExecutor(next);
  }, []);

  const replaceRoute = useCallback((next: RoamRoute) => {
    setRoute((current) => ({ ...next, fps: next.fps || current.fps }));
  }, []);

  const updateWaypoint = useCallback((id: string, patch: Partial<Omit<RoamWaypoint, 'id'>>) => {
    setRoute((current) => ({
      ...current,
      waypoints: current.waypoints.map((waypoint) => (waypoint.id === id ? { ...waypoint, ...patch } : waypoint)),
    }));
  }, []);

  const appendWaypoint = useCallback((waypoint: Omit<RoamWaypoint, 'id'>): string => {
    const id = createWaypointId();

    setRoute((current) => ({
      ...current,
      waypoints: [...current.waypoints, { ...waypoint, id, duration: waypoint.duration ?? DEFAULT_WAYPOINT_DURATION }],
    }));

    return id;
  }, []);

  const removeWaypoint = useCallback((id: string) => {
    setRoute((current) => ({
      ...current,
      waypoints: current.waypoints.filter((waypoint) => waypoint.id !== id),
    }));
    setSelectedWaypointId((current) => (current === id ? null : current));
  }, []);

  const moveWaypoint = useCallback((id: string, direction: -1 | 1) => {
    setRoute((current) => {
      const index = current.waypoints.findIndex((waypoint) => waypoint.id === id);

      if (index < 0) {
        return current;
      }
      const target = index + direction;

      if (target < 0 || target >= current.waypoints.length) {
        return current;
      }
      const waypoints = current.waypoints.slice();
      const [moved] = waypoints.splice(index, 1);

      waypoints.splice(target, 0, moved);

      return { ...current, waypoints };
    });
  }, []);

  const clearWaypoints = useCallback(() => {
    setRoute((current) => ({ ...current, waypoints: [] }));
    setSelectedWaypointId(null);
  }, []);

  const setFps = useCallback((fps: number) => {
    setRoute((current) => ({ ...current, fps }));
  }, []);

  const setLoopMode = useCallback((mode: RoamLoopMode) => {
    setRoute((current) => ({ ...current, loopMode: mode }));
  }, []);

  const toggleRecordArmed = useCallback(() => {
    setRecordArmed((armed) => !armed);
  }, []);

  const value = useMemo<RoamContextValue>(() => ({
    route,
    replaceRoute,
    updateWaypoint,
    appendWaypoint,
    removeWaypoint,
    moveWaypoint,
    clearWaypoints,
    setFps,
    setLoopMode,
    selectedWaypointId,
    setSelectedWaypointId,
    recordArmed,
    toggleRecordArmed,
    pickModeActive,
    setPickModeActive,
    auxDirection,
    setAuxDirection,
    playbackState,
    setPlaybackState,
    recordingState,
    setRecordingState,
    lastRecording,
    setLastRecording,
    recordMessage,
    setRecordMessage,
    sceneReady: executor !== null,
    executor,
    registerExecutor,
  }), [
    route,
    replaceRoute,
    updateWaypoint,
    appendWaypoint,
    removeWaypoint,
    moveWaypoint,
    clearWaypoints,
    setFps,
    setLoopMode,
    selectedWaypointId,
    recordArmed,
    toggleRecordArmed,
    pickModeActive,
    auxDirection,
    playbackState,
    recordingState,
    lastRecording,
    recordMessage,
    executor,
    registerExecutor,
  ]);

  return <RoamContext.Provider value={value}>{children}</RoamContext.Provider>;
}

export function useRoam(): RoamContextValue {
  const value = useContext(RoamContext);

  if (!value) {
    throw new Error('useRoam 必须在 RoamProvider 内使用');
  }

  return value;
}
