// 漫游辅助视口——侧视图（东/南/西/北）：黑底线框示意图，横轴为对应方向的水平
// 投影距离、纵轴为海拔；绘制路径线、航点、当前相机视锥（GES 风格示意）。
// 逐帧动画通过 roamBus + rAF 驱动，不触发 React 重渲染。

import { useEffect, useRef } from 'react';
import { useRoam } from './RoamContext';
import { roamBus } from './roamBus';
import { buildTrack } from './roamPath';
import type { RoamAuxDirection } from './types';

/** 侧视方向的屏幕水平轴（unit: [east, north]）与视线水平轴 */
const SIDE_AXES: Record<Exclude<RoamAuxDirection, 'top'>, {
  screenAxis: [number, number];
  viewAxis: [number, number];
  xLabel: string;
}> = {
  // 从西侧看（视线朝东）：屏幕横轴 = 南北向
  west: { screenAxis: [0, 1], viewAxis: [1, 0], xLabel: '北 → 南 (m)' },
  east: { screenAxis: [0, -1], viewAxis: [-1, 0], xLabel: '南 → 北 (m)' },
  // 从北侧看（视线朝南）：屏幕横轴 = 东西向
  north: { screenAxis: [1, 0], viewAxis: [0, -1], xLabel: '西 → 东 (m)' },
  south: { screenAxis: [-1, 0], viewAxis: [0, 1], xLabel: '东 → 西 (m)' },
};

function niceStep(span: number): number {
  const raw = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));

  return [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((step) => step >= raw) ?? magnitude;
}

function formatDistance(meters: number): string {
  if (Math.abs(meters) >= 10_000) {
    return `${Math.round(meters / 1000)}km`;
  }
  if (Math.abs(meters) >= 1_000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }

  return `${Math.round(meters)}m`;
}

export function RoamSideView({ direction }: { direction: Exclude<RoamAuxDirection, 'top'> }) {
  const { route } = useRoam();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }
    const axes = SIDE_AXES[direction];
    let raf = 0;

    const draw = () => {
      const context = canvas.getContext('2d');
      const bus = roamBus.get();

      if (context) {
        const ratio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth || 280;
        const height = canvas.clientHeight || 180;

        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
          canvas.width = Math.round(width * ratio);
          canvas.height = Math.round(height * ratio);
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);

        // 背景
        context.fillStyle = '#0b1220';
        context.fillRect(0, 0, width, height);

        const track = buildTrack(route);

        if (track.length === 0) {
          context.fillStyle = '#475569';
          context.font = '12px sans-serif';
          context.textAlign = 'center';
          context.fillText('暂无航点', width / 2, height / 2);
        } else {
          const padLeft = 52;
          const padRight = 14;
          const padTop = 18;
          const padBottom = 26;
          const plotWidth = Math.max(10, width - padLeft - padRight);
          const plotHeight = Math.max(10, height - padTop - padBottom);
          const xs = track.map((point) => point.east * axes.screenAxis[0] + point.north * axes.screenAxis[1]);
          const xMin = Math.min(...xs);
          const xMaxRaw = Math.max(...xs);
          const xSpan = Math.max(xMaxRaw - xMin, 50);
          const yMin = Math.min(0, ...track.map((point) => point.height));
          const yMaxRaw = Math.max(...track.map((point) => point.height), 100);
          const ySpan = Math.max(yMaxRaw - yMin, 100);

          const toScreenX = (x: number) => padLeft + ((x - xMin) / xSpan) * plotWidth;
          const toScreenY = (y: number) => padTop + (1 - (y - yMin) / ySpan) * plotHeight;

          // 网格 + 高度标尺
          const yStep = niceStep(ySpan);
          const xStep = niceStep(xSpan);

          context.strokeStyle = '#1d2a3d';
          context.fillStyle = '#64748b';
          context.font = '10px sans-serif';
          context.textAlign = 'right';
          context.lineWidth = 1;
          for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMin + ySpan; y += yStep) {
            const sy = toScreenY(y);

            context.beginPath();
            context.moveTo(padLeft, sy);
            context.lineTo(width - padRight, sy);
            context.stroke();
            context.fillText(formatDistance(y), padLeft - 6, sy + 3);
          }
          context.textAlign = 'center';
          context.beginPath();
          context.moveTo(padLeft, padTop);
          context.lineTo(padLeft, padTop + plotHeight);
          context.lineTo(width - padRight, padTop + plotHeight);
          context.strokeStyle = '#334155';
          context.stroke();
          for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMin + xSpan; x += xStep) {
            const sx = toScreenX(x);

            context.fillText(formatDistance(x - xMin), sx, height - 8);
          }
          context.fillStyle = '#475569';
          context.textAlign = 'left';
          context.fillText('海拔 (m)', 4, 12);
          context.textAlign = 'right';
          context.fillText(axes.xLabel, width - padRight, 12);

          // 地面线（海拔 0）
          if (yMin <= 0) {
            const groundY = toScreenY(0);

            context.strokeStyle = '#2b3a4f';
            context.setLineDash([4, 4]);
            context.beginPath();
            context.moveTo(padLeft, groundY);
            context.lineTo(width - padRight, groundY);
            context.stroke();
            context.setLineDash([]);
          }

          // 轨迹线
          context.strokeStyle = '#7dd3fc';
          context.lineWidth = 2;
          context.beginPath();
          track.forEach((point, index) => {
            const sx = toScreenX(point.east * axes.screenAxis[0] + point.north * axes.screenAxis[1]);
            const sy = toScreenY(point.height);

            if (index === 0) {
              context.moveTo(sx, sy);
            } else {
              context.lineTo(sx, sy);
            }
          });
          context.stroke();

          // 航点
          track.forEach((point, index) => {
            const sx = toScreenX(point.east * axes.screenAxis[0] + point.north * axes.screenAxis[1]);
            const sy = toScreenY(point.height);

            context.fillStyle = '#e2e8f0';
            context.beginPath();
            context.arc(sx, sy, 3, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = '#94a3b8';
            context.font = '10px sans-serif';
            context.textAlign = 'center';
            context.fillText(String(index + 1), sx, sy - 7);
          });

          // 当前相机视锥（播放/暂停中）
          const pose = bus.pose;

          if (pose) {
            const camX = pose.lon;
            const camY = pose.lat;
            // 将 pose 投影到本视图坐标（用首航点作原点，与 track 一致）
            const origin = track[0];
            const metersPerDegLat = Math.PI * 6371008.8 / 180;
            const east = (camX - origin.lon) * metersPerDegLat * Math.cos(origin.lat * Math.PI / 180);
            const north = (camY - origin.lat) * metersPerDegLat;
            const sx = toScreenX(east * axes.screenAxis[0] + north * axes.screenAxis[1]);
            const sy = toScreenY(pose.height);
            // 视锥朝向：heading/pitch 投影到屏幕平面
            const headingRad = pose.heading * Math.PI / 180;
            const pitchRad = pose.pitch * Math.PI / 180;
            const dirEast = Math.sin(headingRad) * Math.cos(pitchRad);
            const dirNorth = Math.cos(headingRad) * Math.cos(pitchRad);
            const dirUp = Math.sin(pitchRad);
            let vx = dirEast * axes.screenAxis[0] + dirNorth * axes.screenAxis[1];
            let vy = -dirUp;

            const norm = Math.hypot(vx, vy) || 1;

            vx /= norm;
            vy /= norm;
            const size = 12;
            const apexX = sx + vx * size;
            const apexY = sy + vy * size;
            const perpX = -vy;
            const perpY = vx;

            context.fillStyle = 'rgba(248, 113, 113, 0.85)';
            context.beginPath();
            context.moveTo(apexX, apexY);
            context.lineTo(sx + perpX * 5, sy + perpY * 5);
            context.lineTo(sx - perpX * 5, sy - perpY * 5);
            context.closePath();
            context.fill();
            context.strokeStyle = '#f87171';
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(sx, sy, 3.5, 0, Math.PI * 2);
            context.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => { cancelAnimationFrame(raf); };
  }, [route, direction]);

  return <canvas ref={canvasRef} className="roam-side-view" />;
}
