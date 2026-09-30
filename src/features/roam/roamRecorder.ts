// 漫游录制器：离线逐帧渲染 + WebCodecs 硬编码 H.264 + mp4-muxer 封装。
// 技术路线移植自 G:/testws/cesiumtest/record.js：
//   路径逐帧推进 → 等瓦片加载 → scene.render() → VideoFrame(canvas)
//   → VideoEncoder(H.264) → mp4-muxer → Blob → 下载 .mp4
// 与实时录屏（MediaRecorder）相比：不掉帧、不拍糊瓦片、输出标准 MP4。

import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

/** 录制用路径适配器（cesiumtest roam.js 的接口形态） */
export type RoamRecordPath = {
  /** 置于起始姿态 */
  begin: () => void;
  /** 推进相机到 progress ∈ [0,1]（不渲染） */
  applyProgress: (progress: number) => void;
  frameCount: number;
  fps: number;
};

export type RoamRecordOptions = {
  canvas: HTMLCanvasElement;
  path: RoamRecordPath;
  /** 等待场景瓦片加载完成（由调用方提供，避免本模块依赖 Cesium 类型） */
  waitTilesLoaded: () => Promise<void>;
  /** 渲染当前帧（调用 scene.render） */
  renderFrame: () => void;
  onProgress?: (frame: number, total: number) => void;
  isCancelled?: () => boolean;
};

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function createStamp(): string {
  const now = new Date();

  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
}

function pickBitrate(width: number, height: number, fps: number): number {
  return Math.max(2_000_000, Math.round(width * height * fps * 0.12));
}

async function resolveAvcCodec(width: number, height: number, bitrate: number, fps: number): Promise<string> {
  // High → Main → Baseline 逐级回退，兼容不同显卡的硬编码支持
  const candidates = ['avc1.640028', 'avc1.4D001F', 'avc1.42E01E'];

  for (const codec of candidates) {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
    }).catch(() => null);

    if (support?.supported) {
      return codec;
    }
  }

  throw new Error('当前浏览器不支持 H.264 视频编码（需要 Chrome/Edge 的 WebCodecs 能力）');
}

function waitForDequeue(encoder: VideoEncoder): Promise<void> {
  return new Promise<void>((resolve) => {
    const previous = encoder.ondequeue;

    encoder.ondequeue = (event) => {
      previous?.call(encoder, event);
      resolve();
    };
  });
}

/**
 * 执行录制并返回 MP4 Blob。逐帧渲染期间调用方应禁用地图交互。
 */
export async function recordRoamVideo(options: RoamRecordOptions): Promise<Blob> {
  const { canvas, path, waitTilesLoaded, renderFrame, onProgress, isCancelled } = options;

  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('当前浏览器不支持 WebCodecs，无法录制视频');
  }

  // H.264 要求宽高为偶数
  const width = Math.floor(canvas.width / 2) * 2;
  const height = Math.floor(canvas.height / 2) * 2;

  if (width < 2 || height < 2) {
    throw new Error('地图画布尺寸无效，无法录制');
  }

  const fps = Math.max(1, Math.round(path.fps));
  const frameCount = Math.max(2, Math.round(path.frameCount));
  const bitrate = pickBitrate(width, height, fps);
  const codec = await resolveAvcCodec(width, height, bitrate, fps);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  });

  let encodeError: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (error) => {
      encodeError = error;
    },
  });

  encoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
  });

  const microsecondsPerFrame = 1_000_000 / fps;
  let cancelled = false;

  try {
    path.begin();
    await waitTilesLoaded();

    for (let frame = 0; frame < frameCount; frame += 1) {
      if (isCancelled?.()) {
        cancelled = true;
        break;
      }
      if (encodeError !== null) {
        throw encodeError;
      }

      path.applyProgress(frame / (frameCount - 1));
      // 每帧都等瓦片加载完成再渲染，保证画面中不出现模糊瓦片
      await waitTilesLoaded();
      renderFrame();
      onProgress?.(frame + 1, frameCount);

      const videoFrame = new VideoFrame(canvas, {
        timestamp: Math.round(frame * microsecondsPerFrame),
        duration: Math.round(microsecondsPerFrame),
      });

      // 关键帧间隔 60 帧
      encoder.encode(videoFrame, { keyFrame: frame % 60 === 0 });
      videoFrame.close();

      // 背压控制：编码队列堆积时等待出队，防止内存膨胀
      if (encoder.encodeQueueSize > 8) {
        await waitForDequeue(encoder);
      }

      // 让出主线程，保持页面可响应
      await sleep(0);
    }
  } finally {
    try {
      await encoder.flush();
    } catch {
      // 取消路径上 flush 可能已失败，忽略
    }
    encoder.close();
    muxer.finalize();
  }

  if (encodeError !== null) {
    throw encodeError;
  }
  if (cancelled) {
    throw new DOMException('录制已取消', 'AbortError');
  }

  return new Blob([target.buffer], { type: 'video/mp4' });
}

export function createRoamVideoName(): string {
  return `ctearth-roam-${createStamp()}.mp4`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => { URL.revokeObjectURL(url); }, 60_000);
}
