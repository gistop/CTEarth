import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGis } from '../../../gisStore';
import type { AiGisPort, AiGisSnapshot } from '../tools/gisPort';

export function useGisAiPort(): { port: AiGisPort; snapshot: AiGisSnapshot } {
  const gis = useGis();
  const current = useRef(gis);
  const connected = useRef(true);
  const pending = useRef(new Set<{ notify: () => void; cancel: () => void }>());
  useLayoutEffect(() => {
    current.current = gis;
    pending.current.forEach((waiter) => waiter.notify());
  }, [gis]);
  useLayoutEffect(() => {
    connected.current = true;
    return () => {
      connected.current = false;
      pending.current.forEach((waiter) => waiter.cancel());
    };
  }, []);

  const port = useMemo(() => {
    function waitForCommit(ready: (snapshot: typeof gis) => boolean) {
      if (!connected.current) {
        return Promise.reject(new DOMException('AI 助手已关闭。', 'AbortError'));
      }
      if (ready(current.current)) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout);
          pending.current.delete(waiter);
        };
        const waiter = {
          notify: () => {
            if (ready(current.current)) {
              cleanup();
              resolve();
            }
          },
          cancel: () => {
            cleanup();
            reject(new DOMException('AI 助手已关闭。', 'AbortError'));
          },
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('GIS 操作已完成，但界面状态未同步。请检查地图结果，勿重复执行。'));
        }, 10000);
        pending.current.add(waiter);
        waiter.notify();
      });
    }

    const port: AiGisPort = {
      getSnapshot: () => current.current,
      async selectByValue(params) {
        const before = current.current.layer;
        const result = await current.current.selectByValue(params);
        if (result) {
          await waitForCommit((snapshot) => snapshot.layer !== before);
        }
        return result;
      },
      async selectByLocation(params) {
        const before = current.current.layer;
        const result = await current.current.selectByLocation(params);
        if (result) {
          await waitForCommit((snapshot) => snapshot.layer !== before && !snapshot.isRunning);
        }
        return result;
      },
      async runBufferAnalysis(params) {
        const result = await current.current.runBufferAnalysis(params);
        if (result.ok) {
          await waitForCommit((snapshot) => snapshot.layers.some((layer) => layer.id === result.output.id && layer.geojson === result.output.geojson) && !snapshot.isRunning);
        }
        return result;
      },
      async runOverlayAnalysis(tool, params) {
        const result = await current.current.runOverlayAnalysis(tool, params);
        if (result.ok) {
          await waitForCommit((snapshot) => snapshot.layers.some((layer) => layer.id === result.output.id && layer.geojson === result.output.geojson) && !snapshot.isRunning);
        }
        return result;
      },
      async runIdwInterpolation(params) {
        const result = await current.current.runIdwInterpolation(params);
        if (result.ok) {
          await waitForCommit((snapshot) => snapshot.raster === result.output && !snapshot.isRunning);
        }
        return result;
      },
      async runTerrainAnalysis(tool, params) {
        const result = await current.current.runTerrainAnalysis(tool, params);
        if (result.ok) {
          await waitForCommit((snapshot) => snapshot.raster === result.output && !snapshot.isRunning);
        }
        return result;
      },
    };
    return port;
  }, []);
  return { port, snapshot: gis };
}
