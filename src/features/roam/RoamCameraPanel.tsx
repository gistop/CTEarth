// 「相机」dock 面板：航线编辑主界面。
// 结构：顶部辅助视口（顶/东/南/西/北）→ 工具栏 → 环绕模板 → 航点列表 →
// 全局参数 → 底部播放条（播放/进度/录制）。逐帧进度经 roamBus 驱动，避免整面板重渲染。

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronRight,
  Circle,
  Crosshair,
  Download,
  Navigation,
  Pause,
  Play,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRoam } from './RoamContext';
import { roamBus } from './roamBus';
import { parseRoute, serializeRoute, totalDuration } from './roamPath';
import { downloadBlob } from './roamRecorder';
import { AUX_DIRECTIONS, AUX_DIRECTION_LABELS, type RoamAuxDirection } from './types';
import { RoamTopView } from './RoamTopView';
import { RoamSideView } from './RoamSideView';

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

/** 逐帧进度条：rAF 直写 DOM，不触发 React 渲染 */
function RoamProgressSlider() {
  const { route, executor } = useRoam();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const totalRef = useRef(0);

  totalRef.current = totalDuration(route);

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const state = roamBus.get();
      const input = inputRef.current;

      if (input && document.activeElement !== input) {
        input.value = String(Math.round(state.progress * 1000));
      }
      if (labelRef.current) {
        labelRef.current.textContent = `${(state.progress * totalRef.current).toFixed(1)}s / ${totalRef.current.toFixed(1)}s`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); };
  }, []);

  const onSeek = (event: ChangeEvent<HTMLInputElement>) => {
    executor?.seek(Number(event.target.value) / 1000);
  };

  return (
    <div className="roam-progress">
      <input
        ref={inputRef}
        className="roam-progress-slider"
        type="range"
        min={0}
        max={1000}
        defaultValue={0}
        onChange={onSeek}
      />
      <span ref={labelRef} className="roam-progress-label">0.0s / 0.0s</span>
    </div>
  );
}

export function RoamCameraPanel() {
  const {
    route,
    replaceRoute,
    updateWaypoint,
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
    recordingState,
    lastRecording,
    recordMessage,
    setRecordMessage,
    sceneReady,
    executor,
  } = useRoam();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const hasWaypoints = route.waypoints.length > 0;
  const busy = recordingState.active;

  const handleExport = () => {
    if (!hasWaypoints) {
      return;
    }
    downloadBlob(new Blob([serializeRoute(route)], { type: 'application/json' }), `${route.name || '航线'}.json`);
  };

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    event.target.value = '';
    if (!file) {
      return;
    }
    file.text()
      .then((text) => {
        replaceRoute(parseRoute(text));
        setRecordMessage(null);
      })
      .catch((error: unknown) => {
        setRecordMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`);
      });
  };

  const handlePlay = () => {
    if (!executor) {
      return;
    }
    if (recordArmed) {
      executor.record();
    } else if (playbackState === 'playing') {
      executor.pause();
    } else {
      executor.play();
    }
  };

  const renderWaypointRow = (waypoint: (typeof route.waypoints)[number], index: number) => {
    const selected = waypoint.id === selectedWaypointId;
    const expanded = waypoint.id === expandedId;

    return (
      <div key={waypoint.id} className={`roam-waypoint-row ${selected ? 'is-selected' : ''}`}>
        <div
          className="roam-waypoint-summary"
          onClick={() => {
            setSelectedWaypointId(waypoint.id);
            setExpandedId(expanded ? null : waypoint.id);
          }}
        >
          <ChevronRight className={`roam-chevron ${expanded ? 'is-open' : ''}`} size={13} />
          <span className="roam-waypoint-index">{index + 1}</span>
          <span className="roam-waypoint-coords">
            {waypoint.lat.toFixed(4)}, {waypoint.lon.toFixed(4)}
          </span>
          <span className="roam-waypoint-height">{Math.round(waypoint.height)}m</span>
        </div>
        {expanded ? (
          <div className="roam-waypoint-editor">
            <label className="roam-field">
              <span>经度</span>
              <input
                type="number"
                step="0.0001"
                value={waypoint.lon}
                onChange={(event) => updateWaypoint(waypoint.id, { lon: Number(event.target.value) })}
              />
            </label>
            <label className="roam-field">
              <span>纬度</span>
              <input
                type="number"
                step="0.0001"
                value={waypoint.lat}
                onChange={(event) => updateWaypoint(waypoint.id, { lat: Number(event.target.value) })}
              />
            </label>
            <label className="roam-field">
              <span>高度 m</span>
              <input
                type="number"
                step="10"
                value={waypoint.height}
                onChange={(event) => updateWaypoint(waypoint.id, { height: Number(event.target.value) })}
              />
            </label>
            <label className="roam-field">
              <span>朝向°</span>
              <input
                type="number"
                step="1"
                value={waypoint.heading}
                onChange={(event) => updateWaypoint(waypoint.id, { heading: Number(event.target.value) })}
              />
            </label>
            <label className="roam-field">
              <span>俯仰°</span>
              <input
                type="number"
                step="1"
                value={waypoint.pitch}
                onChange={(event) => updateWaypoint(waypoint.id, { pitch: Number(event.target.value) })}
              />
            </label>
            {index < route.waypoints.length - 1 ? (
              <label className="roam-field">
                <span>时长 s</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  value={waypoint.duration}
                  onChange={(event) => updateWaypoint(waypoint.id, { duration: Math.max(0.1, Number(event.target.value) || 0.1) })}
                />
              </label>
            ) : null}
            <div className="roam-waypoint-actions">
              <button
                className="roam-mini-button"
                title="飞到此处"
                disabled={!sceneReady}
                onClick={() => executor?.flyToWaypoint(waypoint.id)}
              >
                <Navigation size={12} />
              </button>
              <button
                className="roam-mini-button"
                title="上移"
                disabled={index === 0}
                onClick={() => moveWaypoint(waypoint.id, -1)}
              >
                <ArrowUp size={12} />
              </button>
              <button
                className="roam-mini-button"
                title="下移"
                disabled={index === route.waypoints.length - 1}
                onClick={() => moveWaypoint(waypoint.id, 1)}
              >
                <ArrowDown size={12} />
              </button>
              <button className="roam-mini-button is-danger" title="删除" onClick={() => removeWaypoint(waypoint.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="roam-camera-panel">
      {!sceneReady ? <div className="roam-mode-hint">请将地图切换到三维模式后使用漫游功能</div> : null}

      <div className="roam-aux">
        <div className="roam-aux-tabs">
          {AUX_DIRECTIONS.map((direction) => (
            <button
              key={direction}
              className={`roam-aux-tab ${auxDirection === direction ? 'is-active' : ''}`}
              onClick={() => setAuxDirection(direction)}
            >
              {AUX_DIRECTION_LABELS[direction]}
            </button>
          ))}
        </div>
        <div className="roam-aux-viewport">
          {auxDirection === 'top' ? <RoamTopView /> : <RoamSideView direction={auxDirection} />}
        </div>
      </div>

      <div className="roam-toolbar">
        <button className="roam-tool-button" disabled={!sceneReady} title="捕获当前视图为航点" onClick={() => executor?.captureView()}>
          <Camera size={13} />
          捕获视图
        </button>
        <button
          className={`roam-tool-button ${pickModeActive ? 'is-active' : ''}`}
          disabled={!sceneReady}
          title="在地图上点击拾取航点"
          onClick={() => setPickModeActive(!pickModeActive)}
        >
          <Crosshair size={13} />
          地图取点
        </button>
        <button
          className="roam-tool-button"
          disabled={!sceneReady || busy}
          title="以当前视角为中心生成环绕航线"
          onClick={() => executor?.generateOrbit()}
        >
          生成环绕
        </button>
        <button className="roam-tool-button" disabled={!hasWaypoints || busy} title="清空航点" onClick={clearWaypoints}>
          清空
        </button>
        <button className="roam-tool-button" disabled={!hasWaypoints} title="导出航线 JSON" onClick={handleExport}>
          <Download size={13} />
        </button>
        <button className="roam-tool-button" title="导入航线 JSON" onClick={() => importInputRef.current?.click()}>
          <Upload size={13} />
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </div>

      <div className="roam-waypoints">
        {hasWaypoints ? (
          route.waypoints.map(renderWaypointRow)
        ) : (
          <div className="roam-empty">暂无航点。点击「捕获视图」把当前相机存为航点，或用「地图取点」在地图上添加。</div>
        )}
      </div>

      <div className="roam-params">
        <label className="roam-field">
          <span>帧率</span>
          <input
            type="number"
            min="1"
            max="60"
            value={route.fps}
            onChange={(event) => setFps(Math.min(60, Math.max(1, Number(event.target.value) || 30)))}
          />
        </label>
        <label className="roam-field">
          <span>循环</span>
          <select value={route.loopMode} onChange={(event) => setLoopMode(event.target.value as typeof route.loopMode)}>
            <option value="once">单次</option>
            <option value="loop">循环</option>
            <option value="pingpong">往返</option>
          </select>
        </label>
        <span className="roam-total">总时长 {totalDuration(route).toFixed(1)}s</span>
      </div>

      {recordMessage ? <div className="roam-message">{recordMessage}</div> : null}

      <div className="roam-playback">
        <div className="roam-playback-controls">
          <button
            className="roam-play-button"
            disabled={!sceneReady || !hasWaypoints || busy}
            title={recordArmed ? '录制 MP4' : playbackState === 'playing' ? '暂停' : '播放'}
            onClick={handlePlay}
          >
            {recordArmed ? <Circle size={14} className="roam-record-icon" /> : playbackState === 'playing' ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            className="roam-play-button"
            disabled={!sceneReady || playbackState === 'idle' || busy}
            title="停止"
            onClick={() => executor?.stop()}
          >
            <Square size={12} />
          </button>
          <label className={`roam-arm-toggle ${recordArmed ? 'is-active' : ''}`} title="开启后，播放动作将录制为 MP4">
            <input type="checkbox" checked={recordArmed} onChange={toggleRecordArmed} />
            录制
          </label>
          {busy ? (
            <>
              <span className="roam-record-progress">录制中 {recordingState.frame}/{recordingState.total} 帧</span>
              <button className="roam-tool-button is-danger" onClick={() => executor?.cancelRecord()}>取消</button>
            </>
          ) : null}
        </div>
        <RoamProgressSlider />
        {lastRecording ? (
          <div className="roam-last-recording">
            <span className="roam-last-name" title={lastRecording.name}>
              {lastRecording.name}（{formatSize(lastRecording.sizeBytes)}）
            </span>
            <a className="roam-last-download" href={lastRecording.url} download={lastRecording.name}>
              <Download size={12} />
              再次下载
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
