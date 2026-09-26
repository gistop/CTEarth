import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Eraser, RefreshCw, Waves, X } from 'lucide-react';
import type { MapViewMode } from './MapCommandContext';
import type { CesiumNamespace, CesiumViewer } from './cesiumRuntime';
import { useTerrainAnalysis } from './TerrainAnalysisContext';
import {
  buildFloodSampleGrid,
  computeFloodRegionFromView,
  createFloodEntities,
  createProfileDrawingEntities,
  createProfileResultEntities,
  drawProfileChart,
  floodRegionAreaSquareMeters,
  formatProfileStats,
  pickTerrainPoint,
  type FloodRegion,
  type ProfilePoint,
  type ProfileResult,
} from './terrainAnalysisCesium';

type TerrainAnalysisPanelProps = {
  cesiumScene: { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
  mapMode: MapViewMode;
};

const PROFILE_SAMPLE_COUNT = 150;

function preventContextMenu(event: Event) {
  event.preventDefault();
}

export function TerrainAnalysisPanel({ cesiumScene, mapMode }: TerrainAnalysisPanelProps) {
  const { activeTool, closeTerrainTool, profileResult, setProfileResult } = useTerrainAnalysis();
  const [profilePoints, setProfilePoints] = useState<ProfilePoint[]>([]);
  const [profileStatus, setProfileStatus] = useState('');
  const [profileSampling, setProfileSampling] = useState(false);
  const profilePointsRef = useRef<ProfilePoint[]>([]);
  const profilePreviewRef = useRef<ProfilePoint | null>(null);
  const profileRequestIdRef = useRef(0);
  const finishProfileRef = useRef<() => void>(() => undefined);

  const [floodRegion, setFloodRegion] = useState<FloodRegion | null>(null);
  const [floodLimits, setFloodLimits] = useState({ max: 100, min: 0 });
  const [floodLevel, setFloodLevel] = useState(0);
  const [floodOpacity, setFloodOpacity] = useState(0.55);
  const [floodAutoRise, setFloodAutoRise] = useState(false);
  const [floodSpeed, setFloodSpeed] = useState(60);
  const [floodSamples, setFloodSamples] = useState<{ cellArea: number; heights: number[] } | null>(null);
  const [floodSampling, setFloodSampling] = useState(false);
  const [floodSampleRevision, setFloodSampleRevision] = useState(0);
  const floodLevelRef = useRef(0);
  const floodOpacityRef = useRef(floodOpacity);
  const floodSpeedRef = useRef(floodSpeed);
  const floodLimitsRef = useRef(floodLimits);
  const floodRequestIdRef = useRef(0);

  useEffect(() => {
    profilePointsRef.current = profilePoints;
  }, [profilePoints]);

  useEffect(() => {
    floodLevelRef.current = floodLevel;
  }, [floodLevel]);

  useEffect(() => {
    floodOpacityRef.current = floodOpacity;
  }, [floodOpacity]);

  useEffect(() => {
    floodSpeedRef.current = floodSpeed;
  }, [floodSpeed]);

  useEffect(() => {
    floodLimitsRef.current = floodLimits;
  }, [floodLimits]);

  const clearProfile = useCallback(() => {
    profilePreviewRef.current = null;
    profilePointsRef.current = [];
    setProfilePoints([]);
    setProfileResult(null);
    setProfileSampling(false);
    setProfileStatus('依次点击地图选择剖面点（至少 2 个），右键或双击结束');
  }, []);

  useEffect(() => {
    if (activeTool !== 'profile') {
      return;
    }

    clearProfile();
  }, [activeTool, clearProfile]);

  useEffect(() => {
    if (activeTool !== 'flood') {
      setFloodRegion(null);
      setFloodSamples(null);
      setFloodAutoRise(false);
    }
  }, [activeTool]);

  const isProfileDrawing = activeTool === 'profile' && !profileResult;

  const finishProfile = useCallback(() => {
    if (!cesiumScene || !isProfileDrawing || profileSampling) {
      return;
    }

    const points = profilePointsRef.current;

    if (points.length < 2) {
      setProfileStatus('至少需要 2 个点，请继续点击地图选择');
      return;
    }

    const requestId = ++profileRequestIdRef.current;
    const { Cesium, viewer } = cesiumScene;

    setProfileSampling(true);
    setProfileStatus('正在采样高程，请稍候…');

    const segments = points.length - 1;
    const cartographics: unknown[] = [];

    for (let i = 0; i < PROFILE_SAMPLE_COUNT; i += 1) {
      const t = (i / (PROFILE_SAMPLE_COUNT - 1)) * segments;
      const index = Math.min(segments - 1, Math.floor(t));
      const fraction = t - index;
      const from = points[index];
      const to = points[index + 1];
      const lon = from.lon + (to.lon - from.lon) * fraction;
      const lat = from.lat + (to.lat - from.lat) * fraction;
      cartographics.push(Cesium.Cartographic.fromDegrees(lon, lat));
    }

    Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics)
      .then((sampled) => {
        if (requestId !== profileRequestIdRef.current || viewer.isDestroyed()) {
          return;
        }

        const samples = sampled.map((item) => {
          const cartographic = item as { height?: number; latitude: number; longitude: number };

          return {
            height: cartographic.height ?? 0,
            lat: Cesium.Math.toDegrees(cartographic.latitude),
            lon: Cesium.Math.toDegrees(cartographic.longitude),
          };
        });
        const distances: number[] = [0];

        for (let i = 1; i < samples.length; i += 1) {
          const previous = samples[i - 1];
          const current = samples[i];
          const from = Cesium.Cartesian3.fromRadians(
            Cesium.Math.toRadians(previous.lon),
            Cesium.Math.toRadians(previous.lat),
            0,
          );
          const to = Cesium.Cartesian3.fromRadians(
            Cesium.Math.toRadians(current.lon),
            Cesium.Math.toRadians(current.lat),
            0,
          );
          distances.push(distances[i - 1] + Number(Cesium.Cartesian3.distance(from, to) || 0));
        }

        profilePreviewRef.current = null;
        setProfileResult({ distances, samples });
        setProfileStatus('剖面绘制完成，可清除后重新绘制');
      })
      .catch(() => {
        if (requestId === profileRequestIdRef.current) {
          setProfileStatus('高程采样失败，请重试');
        }
      })
      .finally(() => {
        if (requestId === profileRequestIdRef.current) {
          setProfileSampling(false);
        }
      });
  }, [cesiumScene, isProfileDrawing, profileSampling]);

  useEffect(() => {
    finishProfileRef.current = finishProfile;
  }, [finishProfile]);

  useEffect(() => {
    if (!cesiumScene || !isProfileDrawing || mapMode !== 'globe') {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    const previousCursor = viewer.canvas.style.cursor;

    viewer.canvas.style.cursor = 'crosshair';
    viewer.canvas.addEventListener('contextmenu', preventContextMenu);

    handler.setInputAction((event) => {
      const point = pickTerrainPoint(Cesium, viewer, event.position);

      if (!point) {
        return;
      }

      setProfilePoints((current) => [...current, point]);
      setProfileStatus(`已选 ${profilePointsRef.current.length + 1} 个点，右键或双击结束采样`);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((event) => {
      const point = pickTerrainPoint(Cesium, viewer, event.endPosition);

      if (point) {
        profilePreviewRef.current = point;
        viewer.scene.requestRender?.();
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      finishProfileRef.current();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    handler.setInputAction(() => {
      finishProfileRef.current();
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();

      if (profilePointsRef.current.length === 0) {
        closeTerrainTool();
      } else {
        finishProfileRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      handler.destroy();
      window.removeEventListener('keydown', handleKeyDown);
      viewer.canvas.removeEventListener('contextmenu', preventContextMenu);
      viewer.canvas.style.cursor = previousCursor;
    };
  }, [cesiumScene, closeTerrainTool, isProfileDrawing, mapMode]);

  useEffect(() => {
    if (!cesiumScene || activeTool !== 'profile' || mapMode !== 'globe') {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const entities = isProfileDrawing
      ? createProfileDrawingEntities(Cesium, viewer, profilePointsRef, profilePreviewRef)
      : createProfileResultEntities(Cesium, viewer, profileResult as ProfileResult);

    return () => {
      entities.forEach((entity) => {
        viewer.entities.remove(entity);
      });
      viewer.scene.requestRender?.();
    };
  }, [cesiumScene, activeTool, isProfileDrawing, mapMode, profilePoints, profileResult]);

  useEffect(() => {
    if (!cesiumScene || activeTool !== 'flood' || mapMode !== 'globe' || floodRegion) {
      return;
    }

    const region = computeFloodRegionFromView(cesiumScene.Cesium, cesiumScene.viewer);

    if (region) {
      setFloodRegion(region);
    }
  }, [cesiumScene, activeTool, mapMode, floodRegion]);

  useEffect(() => {
    if (!cesiumScene || activeTool !== 'flood' || mapMode !== 'globe' || !floodRegion) {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const requestId = ++floodRequestIdRef.current;
    const cellArea = floodRegionAreaSquareMeters(Cesium, floodRegion) / (33 * 33);

    setFloodSampling(true);
    Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, buildFloodSampleGrid(Cesium, floodRegion))
      .then((sampled) => {
        if (requestId !== floodRequestIdRef.current || viewer.isDestroyed()) {
          return;
        }

        const heights = sampled.map((item) => (item as { height?: number }).height ?? 0);
        let min = Infinity;
        let max = -Infinity;

        for (const height of heights) {
          min = Math.min(min, height);
          max = Math.max(max, height);
        }

        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          min = 0;
          max = 50;
        }

        const span = Math.max(Math.ceil(max) - Math.floor(min), 50);
        const limits = { max: Math.floor(min) + span, min: Math.floor(min) };
        setFloodLimits(limits);
        setFloodSamples({ cellArea, heights });
        setFloodLevel((level) => (
          level >= limits.min && level <= limits.max ? level : Math.round(limits.min + span * 0.35)
        ));
      })
      .catch(() => {
        if (requestId === floodRequestIdRef.current) {
          setFloodSamples(null);
        }
      })
      .finally(() => {
        if (requestId === floodRequestIdRef.current) {
          setFloodSampling(false);
        }
      });

    return () => {
      floodRequestIdRef.current += 1;
    };
  }, [cesiumScene, activeTool, mapMode, floodRegion, floodSampleRevision]);

  useEffect(() => {
    if (!cesiumScene || activeTool !== 'flood' || mapMode !== 'globe' || !floodRegion) {
      return;
    }

    const entities = createFloodEntities(
      cesiumScene.Cesium,
      cesiumScene.viewer,
      floodRegion,
      floodLevelRef,
      floodOpacityRef,
    );

    return () => {
      entities.forEach((entity) => {
        cesiumScene.viewer.entities.remove(entity);
      });
      cesiumScene.viewer.scene.requestRender?.();
    };
  }, [cesiumScene, activeTool, mapMode, floodRegion]);

  useEffect(() => {
    if (!cesiumScene || activeTool !== 'flood' || !floodAutoRise) {
      return;
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setFloodLevel((level) => {
        const next = level + floodSpeedRef.current * dt;

        return next > floodLimitsRef.current.max ? floodLimitsRef.current.min : next;
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [cesiumScene, activeTool, floodAutoRise]);

  const floodStatus = useMemo(() => {
    const base = `水位 ${Math.round(floodLevel)} m`;

    if (floodSampling) {
      return '正在采样地形，估算淹没面积…';
    }

    if (!floodSamples) {
      return base;
    }

    const count = floodSamples.heights.filter((height) => height <= floodLevel).length;
    const area = count * floodSamples.cellArea / 1e6;

    return `${base} · 淹没面积约 ${Number.isFinite(area) ? area.toFixed(1) : '-'} km²`;
  }, [floodLevel, floodSamples, floodSampling]);

  if (mapMode !== 'globe' || !cesiumScene || !activeTool) {
    return null;
  }

  if (activeTool === 'flood') {
    const levelStep = Math.max(1, Math.round((floodLimits.max - floodLimits.min) / 200));

    return (
      <aside className="map-terrain-panel" aria-label="淹没分析">
        <header className="map-terrain-panel-header">
          <div>
            <Waves size={15} strokeWidth={1.8} />
            <span>淹没分析</span>
          </div>
          <button type="button" title="关闭" aria-label="关闭" onClick={closeTerrainTool}>
            <X size={14} strokeWidth={1.8} />
          </button>
        </header>
        <div className="map-terrain-panel-body">
          <div className="map-terrain-row">
            <span className="map-terrain-label">区域</span>
            <span className="map-terrain-region">
              {floodRegion
                ? `${floodRegion.west.toFixed(2)}~${floodRegion.east.toFixed(2)}°E, ${floodRegion.south.toFixed(2)}~${floodRegion.north.toFixed(2)}°N`
                : '正在获取当前视野…'}
            </span>
            <button
              className="map-terrain-action"
              type="button"
              disabled={!floodRegion}
              onClick={() => {
                if (!cesiumScene) {
                  return;
                }

                const region = computeFloodRegionFromView(cesiumScene.Cesium, cesiumScene.viewer);

                if (region) {
                  setFloodSamples(null);
                  setFloodRegion(region);
                }
              }}
            >
              <RefreshCw size={13} />
              按视野重选
            </button>
          </div>
          <label className="map-terrain-row">
            <span className="map-terrain-label">水位</span>
            <input
              type="range"
              min={floodLimits.min}
              max={floodLimits.max}
              step={levelStep}
              value={Math.min(Math.max(floodLevel, floodLimits.min), floodLimits.max)}
              aria-label="水位"
              onChange={(event) => {
                setFloodAutoRise(false);
                setFloodLevel(Number(event.target.value));
              }}
            />
            <output className="map-terrain-value">{Math.round(floodLevel)} m</output>
          </label>
          <label className="map-terrain-row">
            <span className="map-terrain-label">透明度</span>
            <input
              type="range"
              min={0.15}
              max={0.85}
              step={0.05}
              value={floodOpacity}
              aria-label="水面透明度"
              onChange={(event) => setFloodOpacity(Number(event.target.value))}
            />
            <output className="map-terrain-value">{floodOpacity.toFixed(2)}</output>
          </label>
          <div className="map-terrain-row">
            <label className="map-terrain-check">
              <input
                type="checkbox"
                checked={floodAutoRise}
                onChange={(event) => setFloodAutoRise(event.target.checked)}
              />
              自动涨水
            </label>
            <input
              type="range"
              min={10}
              max={300}
              step={10}
              value={floodSpeed}
              aria-label="涨水速度（米/秒）"
              onChange={(event) => setFloodSpeed(Number(event.target.value))}
            />
            <output className="map-terrain-value">{floodSpeed} m/s</output>
          </div>
          <div className="map-terrain-status" aria-live="polite">{floodStatus}</div>
        </div>
      </aside>
    );
  }

  return (
    <>
      <aside className="map-terrain-panel" aria-label="地形剖面">
        <header className="map-terrain-panel-header">
          <div>
            <Activity size={15} strokeWidth={1.8} />
            <span>地形剖面</span>
          </div>
          <button type="button" title="关闭" aria-label="关闭" onClick={closeTerrainTool}>
            <X size={14} strokeWidth={1.8} />
          </button>
        </header>
        <div className="map-terrain-panel-body">
          <div className="map-terrain-status" aria-live="polite">{profileStatus}</div>
          {profileResult || profilePoints.length > 0 ? (
            <button className="map-terrain-action" type="button" onClick={clearProfile}>
              <Eraser size={13} />
              清除重画
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}

export function TerrainProfileChart() {
  const { profileResult } = useTerrainAnalysis();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ height: 220, width: 680 });

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const updateSize = () => {
      setSize({ height: wrapper.clientHeight, width: wrapper.clientWidth });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(wrapper);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !profileResult) {
      return;
    }

    drawProfileChart(canvas, Math.max(size.width - 16, 240), Math.max(size.height - 16, 120), profileResult);
  }, [profileResult, size]);

  return (
    <section className="terrain-profile-dock" aria-label="地形剖面图">
      {profileResult ? (
        <>
          <header className="terrain-profile-dock-header">
            <span className="terrain-profile-dock-title">地形剖面</span>
            <span className="terrain-profile-dock-stats">{formatProfileStats(profileResult)}</span>
          </header>
          <div className="terrain-profile-dock-canvas" ref={wrapperRef}>
            <canvas ref={canvasRef} />
          </div>
        </>
      ) : (
        <div className="terrain-profile-dock-placeholder">
          暂无剖面结果：请在三维视图中使用「地形剖面」工具绘制剖面
        </div>
      )}
    </section>
  );
}
