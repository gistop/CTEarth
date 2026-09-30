// 漫游执行器桥：挂载在 MapPanel 内，实现播放/暂停/停止/seek、
// 逐帧录制（WebCodecs → MP4）、环绕航线生成、捕获当前视图、单点飞行。
// 命令通过 RoamContext.registerExecutor 暴露给 Ribbon 与「相机」面板。

import { useEffect, useRef } from 'react';
import type { MapViewMode } from '../maps/components/map/MapCommandContext';
import type { CesiumNamespace, CesiumViewer } from '../maps/components/map/cesiumRuntime';
import { useRoam } from './RoamContext';
import { roamBus } from './roamBus';
import { bearingDeg, buildOrbitWaypoints, frameCount as computeFrameCount, samplePose, totalDuration } from './roamPath';
import { createRoamVideoName, downloadBlob, recordRoamVideo } from './roamRecorder';
import type { RoamPose, RoamRoute } from './types';

type CesiumScene = { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;

type PlaybackEngine = {
  state: 'idle' | 'playing' | 'paused';
  raf: number;
  lastTs: number;
  elapsed: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function RoamSceneBridge({ cesiumScene, mapMode }: { cesiumScene: CesiumScene; mapMode: MapViewMode }) {
  const {
    route,
    replaceRoute,
    appendWaypoint,
    setSelectedWaypointId,
    playbackState,
    setPlaybackState,
    setRecordingState,
    setLastRecording,
    setRecordMessage,
    registerExecutor,
  } = useRoam();

  const routeRef = useRef<RoamRoute>(route);
  const engineRef = useRef<PlaybackEngine>({ state: 'idle', raf: 0, lastTs: 0, elapsed: 0 });
  const recordCancelRef = useRef(false);
  const recordRunningRef = useRef(false);

  const isGlobe = mapMode === 'globe' && cesiumScene !== null;

  routeRef.current = route;

  const stopRaf = () => {
    if (engineRef.current.raf) {
      cancelAnimationFrame(engineRef.current.raf);
      engineRef.current.raf = 0;
    }
  };

  useEffect(() => {
    if (!isGlobe || !cesiumScene) {
      registerExecutor(null);
      stopRaf();
      engineRef.current.state = 'idle';

      return;
    }

    const { Cesium, viewer } = cesiumScene;

    const applyPose = (pose: RoamPose) => {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(pose.lon, pose.lat, pose.height),
        orientation: {
          heading: Cesium.Math.toRadians(pose.heading),
          pitch: Cesium.Math.toRadians(pose.pitch),
          roll: 0,
        },
      });
    };

    const engineLoop = (timestamp: number) => {
      const engine = engineRef.current;

      if (engine.state !== 'playing') {
        return;
      }
      const current = routeRef.current;
      const total = totalDuration(current);

      if (total <= 0) {
        return;
      }
      if (engine.lastTs) {
        engine.elapsed += (timestamp - engine.lastTs) / 1000;
      }
      engine.lastTs = timestamp;

      let progress: number;
      let finished = false;

      if (current.loopMode === 'once') {
        progress = Math.min(engine.elapsed / total, 1);
        finished = engine.elapsed >= total;
      } else if (current.loopMode === 'pingpong') {
        const phase = (engine.elapsed / total) % 2;

        progress = phase <= 1 ? phase : 2 - phase;
      } else {
        progress = (engine.elapsed / total) % 1;
      }

      const pose = samplePose(current, progress);

      if (pose) {
        applyPose(pose);
        roamBus.patch({ playing: true, progress, pose });
      }

      if (finished) {
        engine.state = 'idle';
        setPlaybackState('idle');
        roamBus.patch({ playing: false, progress: 1 });

        return;
      }
      engine.raf = requestAnimationFrame(engineLoop);
    };

    const play = () => {
      if (routeRef.current.waypoints.length < 2) {
        setRecordMessage('航线至少需要两个航点才能播放');

        return;
      }
      setRecordMessage(null);
      viewer.camera.cancelFlight?.();
      const engine = engineRef.current;

      if (engine.state !== 'paused') {
        engine.elapsed = 0;
      }
      engine.state = 'playing';
      engine.lastTs = 0;
      setPlaybackState('playing');
      stopRaf();
      engine.raf = requestAnimationFrame(engineLoop);
    };

    const pause = () => {
      const engine = engineRef.current;

      if (engine.state !== 'playing') {
        return;
      }
      engine.state = 'paused';
      stopRaf();
      setPlaybackState('paused');
      roamBus.patch({ playing: false });
    };

    const stop = () => {
      const engine = engineRef.current;

      engine.state = 'idle';
      engine.elapsed = 0;
      stopRaf();
      setPlaybackState('idle');
      roamBus.patch({ playing: false, progress: 0, pose: null });
    };

    const seek = (progress: number) => {
      const engine = engineRef.current;
      const total = totalDuration(routeRef.current);

      if (total <= 0) {
        return;
      }
      const clamped = Math.max(0, Math.min(1, progress));

      engine.elapsed = clamped * total;
      const pose = samplePose(routeRef.current, clamped);

      if (pose) {
        applyPose(pose);
        roamBus.patch({ progress: clamped, pose });
      }
    };

    const waitTilesLoaded = async () => {
      const deadline = performance.now() + 20_000;

      while (viewer.scene.globe.tilesLoaded === false && performance.now() < deadline && !recordCancelRef.current) {
        await sleep(100);
      }
    };

    const record = async () => {
      if (recordRunningRef.current) {
        return;
      }
      const current = routeRef.current;

      if (current.waypoints.length < 2) {
        setRecordMessage('航线至少需要两个航点才能录制');

        return;
      }
      if (typeof VideoEncoder === 'undefined') {
        setRecordMessage('当前浏览器不支持 WebCodecs，无法录制（请使用新版 Chrome/Edge）');

        return;
      }
      setRecordMessage(null);
      stop();
      recordCancelRef.current = false;
      recordRunningRef.current = true;

      const controller = viewer.scene.screenSpaceCameraController;
      const total = computeFrameCount(current);
      let lastUiSync = 0;

      if (controller) {
        controller.enableInputs = false;
      }
      setRecordingState({ active: true, frame: 0, total });
      roamBus.patch({ recording: true, recordFrame: 0, recordTotal: total });

      try {
        const blob = await recordRoamVideo({
          canvas: viewer.canvas,
          path: {
            begin: () => {
              viewer.camera.cancelFlight?.();
              const pose = samplePose(routeRef.current, 0);

              if (pose) {
                applyPose(pose);
              }
            },
            applyProgress: (progress) => {
              const pose = samplePose(routeRef.current, progress);

              if (pose) {
                applyPose(pose);
              }
            },
            frameCount: total,
            fps: current.fps,
          },
          waitTilesLoaded,
          renderFrame: () => { viewer.scene.render?.(); },
          onProgress: (frame, frameTotal) => {
            roamBus.patch({ recordFrame: frame, recordTotal: frameTotal });
            const now = performance.now();

            if (now - lastUiSync > 150) {
              lastUiSync = now;
              setRecordingState({ active: true, frame, total: frameTotal });
            }
          },
          isCancelled: () => recordCancelRef.current,
        });
        const name = createRoamVideoName();

        downloadBlob(blob, name);
        setLastRecording({ name, sizeBytes: blob.size, url: URL.createObjectURL(blob) });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setRecordMessage('录制已取消');
        } else {
          setRecordMessage(`录制失败：${formatError(error)}`);
        }
      } finally {
        recordRunningRef.current = false;
        if (controller) {
          controller.enableInputs = true;
        }
        setRecordingState({ active: false, frame: 0, total: 0 });
        roamBus.patch({ recording: false, recordFrame: 0, recordTotal: 0 });
      }
    };

    const cancelRecord = () => {
      recordCancelRef.current = true;
    };

    const generateOrbit = () => {
      const camera = viewer.camera;
      const carto = camera.positionCartographic;
      const cameraLon = Cesium.Math.toDegrees(carto.longitude);
      const cameraLat = Cesium.Math.toDegrees(carto.latitude);
      const altitude = Math.max(carto.height, 20);

      // 中心点优先取视线中心与地形交点，失败则用相机正下方
      let centerLon = cameraLon;
      let centerLat = cameraLat;
      let groundHeight = 0;
      let centerCartesian: unknown = null;

      const ray = camera.getPickRay?.({ x: viewer.canvas.clientWidth / 2, y: viewer.canvas.clientHeight / 2 });
      const picked = ray ? viewer.scene.globe.pick?.(ray, viewer.scene) : undefined;

      if (picked) {
        const pickedCarto = Cesium.Cartographic.fromCartesian(picked);

        centerLon = Cesium.Math.toDegrees(pickedCarto.longitude);
        centerLat = Cesium.Math.toDegrees(pickedCarto.latitude);
        groundHeight = pickedCarto.height || 0;
        centerCartesian = picked;
      }

      let radius = Math.max(altitude * 0.6, 100);

      if (centerCartesian && camera.positionWC) {
        const slant = Cesium.Cartesian3.distance(camera.positionWC, centerCartesian);
        const heightDiff = Math.max(altitude - groundHeight, 0);
        const horizontal = Math.sqrt(Math.max(slant * slant - heightDiff * heightDiff, 0));

        if (horizontal > 10) {
          radius = horizontal;
        }
      }
      radius = Math.min(Math.max(radius, 50), 100_000);

      const waypoints = buildOrbitWaypoints({
        centerLon,
        centerLat,
        groundHeight,
        radiusM: radius,
        altitudeM: altitude,
        startBearingDeg: bearingDeg(centerLon, centerLat, cameraLon, cameraLat),
        totalAngleDeg: 360,
        durationS: 20,
        segments: 24,
      });
      const nextRoute: RoamRoute = {
        ...routeRef.current,
        name: `环绕 ${centerLat.toFixed(3)}, ${centerLon.toFixed(3)}`,
        waypoints,
      };

      routeRef.current = nextRoute;
      replaceRoute(nextRoute);
      setSelectedWaypointId(null);

      return true;
    };

    const captureView = () => {
      const camera = viewer.camera;
      const carto = camera.positionCartographic;

      appendWaypoint({
        lon: Cesium.Math.toDegrees(carto.longitude),
        lat: Cesium.Math.toDegrees(carto.latitude),
        height: carto.height,
        heading: typeof camera.heading === 'number' ? Cesium.Math.toDegrees(camera.heading) : 0,
        pitch: typeof camera.pitch === 'number' ? Cesium.Math.toDegrees(camera.pitch) : -30,
        duration: 3,
      });
    };

    const flyToWaypoint = (id: string) => {
      const waypoint = routeRef.current.waypoints.find((item) => item.id === id);

      if (!waypoint) {
        return;
      }
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(waypoint.lon, waypoint.lat, waypoint.height),
        orientation: {
          heading: Cesium.Math.toRadians(waypoint.heading),
          pitch: Cesium.Math.toRadians(waypoint.pitch),
          roll: 0,
        },
        duration: 1.2,
      });
    };

    registerExecutor({ play, pause, stop, seek, record, cancelRecord, generateOrbit, captureView, flyToWaypoint });

    return () => {
      registerExecutor(null);
      stopRaf();
      engineRef.current.state = 'idle';
      recordCancelRef.current = true;
      roamBus.patch({ playing: false, recording: false });
    };
  }, [cesiumScene, isGlobe, registerExecutor, replaceRoute, appendWaypoint, setSelectedWaypointId, setPlaybackState, setRecordingState, setLastRecording, setRecordMessage]);

  // 播放期间禁用地图相机控制器，避免用户输入破坏镜头
  useEffect(() => {
    const controller = cesiumScene?.viewer.scene.screenSpaceCameraController;

    if (!controller) {
      return;
    }
    controller.enableInputs = playbackState !== 'playing';
  }, [cesiumScene, playbackState]);

  return null;
}
