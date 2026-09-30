// 漫游播放/录制的逐帧状态总线。
// 播放与录制过程每帧都要更新进度和当前姿态，直接走 React state 会导致面板高频重渲染，
// 因此用独立的可观察对象：三维桥每帧 emit，画布类订阅者（辅助视口/进度滑杆）在 rAF 中读取。

import type { RoamPose } from './types';

export type RoamBusState = {
  playing: boolean;
  /** 播放进度（0..1，已按循环模式映射） */
  progress: number;
  recording: boolean;
  recordFrame: number;
  recordTotal: number;
  /** 当前帧相机姿态（辅助视口绘制视锥用） */
  pose: RoamPose | null;
};

type Listener = () => void;

const state: RoamBusState = {
  playing: false,
  progress: 0,
  recording: false,
  recordFrame: 0,
  recordTotal: 0,
  pose: null,
};

const listeners = new Set<Listener>();
let dirty = false;

function flush(): void {
  if (!dirty) {
    return;
  }
  dirty = false;

  for (const listener of listeners) {
    listener();
  }
}

export const roamBus = {
  get(): Readonly<RoamBusState> {
    return state;
  },
  patch(update: Partial<RoamBusState>): void {
    Object.assign(state, update);
    dirty = true;

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(flush);
    } else {
      flush();
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },
};
