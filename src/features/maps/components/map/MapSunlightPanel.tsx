import { Clock3, Pause, Play, Sunrise, Sunset, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MapViewMode } from './MapCommandContext';
import type { CesiumNamespace, CesiumViewer } from './cesiumRuntime';
import { useMapSunlight } from './MapSunlightContext';

type MapSunlightPanelProps = {
  cesiumScene: { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
  mapMode: MapViewMode;
};

const MINUTES_PER_DAY = 24 * 60;
const PLAYBACK_RATE = 600;
const PLAYBACK_INTERVAL_MS = 100;

export function MapSunlightPanel({ cesiumScene, mapMode }: MapSunlightPanelProps) {
  const { closeSunlight, isSunlightOpen } = useMapSunlight();
  const initialTime = useMemo(() => new Date(), []);
  const [dateValue, setDateValue] = useState(() => formatDateInput(initialTime));
  const [minuteOfDay, setMinuteOfDay] = useState(() => (
    initialTime.getHours() * 60 + initialTime.getMinutes()
  ));
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (mapMode !== 'globe') {
      setIsPlaying(false);
      closeSunlight();
    }
  }, [closeSunlight, mapMode]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const simulatedMinutesPerTick = PLAYBACK_RATE * PLAYBACK_INTERVAL_MS / 60_000;
    const timer = window.setInterval(() => {
      setMinuteOfDay((current) => {
        const next = current + simulatedMinutesPerTick;

        if (next < MINUTES_PER_DAY) {
          return next;
        }

        setDateValue((currentDate) => shiftDateInput(currentDate, 1));
        return next % MINUTES_PER_DAY;
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    if (!cesiumScene || mapMode !== 'globe') {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const localDate = createLocalDate(dateValue, minuteOfDay);

    viewer.clock.currentTime = Cesium.JulianDate.fromDate(localDate);
    viewer.clock.shouldAnimate = false;
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.shadows = Cesium.ShadowMode.ENABLED;
    viewer.scene.shadowMap.enabled = true;
    viewer.shadows = true;
    viewer.scene.requestRender?.();
  }, [cesiumScene, dateValue, mapMode, minuteOfDay]);

  if (!isSunlightOpen || mapMode !== 'globe') {
    return null;
  }

  const roundedMinute = Math.round(minuteOfDay) % MINUTES_PER_DAY;

  const resetToNow = () => {
    const now = new Date();
    setDateValue(formatDateInput(now));
    setMinuteOfDay(now.getHours() * 60 + now.getMinutes());
  };

  return (
    <section className="map-sunlight-panel" aria-label="太阳光照时间控制">
      <div className="map-sunlight-heading">
        <Sunrise size={16} aria-hidden="true" />
        <strong>太阳光照</strong>
      </div>
      <button
        className="map-sunlight-icon-button"
        type="button"
        title={isPlaying ? '暂停时间播放' : '播放时间变化（600 倍速）'}
        aria-label={isPlaying ? '暂停时间播放' : '播放时间变化'}
        onClick={() => setIsPlaying((value) => !value)}
      >
        {isPlaying ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <label className="map-sunlight-date">
        <span className="sr-only">日期</span>
        <input
          type="date"
          value={dateValue}
          onChange={(event) => {
            if (event.target.value) {
              setDateValue(event.target.value);
            }
          }}
        />
      </label>
      <div className="map-sunlight-range">
        <Sunrise size={14} aria-label="日出方向" />
        <input
          type="range"
          min={0}
          max={MINUTES_PER_DAY - 1}
          step={1}
          value={roundedMinute}
          aria-label="一天中的时间"
          onChange={(event) => {
            setIsPlaying(false);
            setMinuteOfDay(Number(event.target.value));
          }}
        />
        <Sunset size={14} aria-label="日落方向" />
      </div>
      <output className="map-sunlight-time" aria-live="polite">{formatTime(roundedMinute)}</output>
      <button
        className="map-sunlight-icon-button"
        type="button"
        title="恢复当前时间"
        aria-label="恢复当前时间"
        onClick={resetToNow}
      >
        <Clock3 size={15} />
      </button>
      <button
        className="map-sunlight-icon-button"
        type="button"
        title="关闭光照时间控制"
        aria-label="关闭光照时间控制"
        onClick={() => {
          setIsPlaying(false);
          closeSunlight();
        }}
      >
        <X size={15} />
      </button>
    </section>
  );
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatTime(minuteOfDay: number) {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function createLocalDate(dateValue: string, minuteOfDay: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = Math.floor(minuteOfDay % 60);

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function shiftDateInput(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}
