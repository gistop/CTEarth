import type Map from 'ol/Map.js';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj.js';
import { unByKey } from 'ol/Observable.js';
import type { DigitizeHostMap } from './digitizeMapTypes';

export const digitizeDefaultCenter: [number, number] = [10.4515, 51.1657];
export const digitizeDefaultZoom = 5.3;

export function createDigitizeViewportAdapter(map: Map, container: HTMLElement, report: (error: unknown) => void) {
  let host: DigitizeHostMap | null = null;
  let visible = false;
  let disposed = false;
  let publishing = false;
  let synchronized = false;
  let frame = 0;
  let lastHost = '';
  let lastView = '';
  const view = map.getView();
  const viewKey = () => JSON.stringify([view.getCenter(), view.getResolution(), view.getRotation(), map.getSize()]);
  const hostKey = () => {
    if (!host) return '';
    const bounds = host.getBounds();
    return JSON.stringify([bounds?.toArray(), host.getCenter().toArray(), host.getZoom()]);
  };
  const syncFromHost = (force = false) => {
    if (disposed || !host || publishing) return;
    const nextKey = hostKey();
    if (!force && nextKey === lastHost) return;
    const bounds = host.getBounds();
    const size = map.getSize();
    if (bounds && size?.every(value => value > 0)) {
      view.fit(transformExtent([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], 'EPSG:4326', 'EPSG:3857'), { nearest: false, padding: [0, 0, 0, 0], size });
    } else {
      const center = host.getCenter();
      view.setCenter(fromLonLat([center.lng, center.lat]));
      view.setZoom(host.getZoom() + 1);
    }
    view.setRotation(0);
    lastHost = nextKey;
    lastView = viewKey();
    synchronized = true;
  };
  const syncToHost = () => {
    if (disposed || !host || !synchronized || !view.getCenter()) return;
    const nextKey = viewKey();
    if (nextKey === lastView) return;
    publishing = true;
    try {
      const size = map.getSize();
      if (size?.every(value => value > 0)) {
        const [west, south, east, north] = transformExtent(view.calculateExtent(size), 'EPSG:3857', 'EPSG:4326');
        host.fitBounds([[west, south], [east, north]], { duration: 0, padding: 0 });
        host.jumpTo({ pitch: 0, bearing: 0 });
      } else {
        const center = toLonLat(view.getCenter()!);
        host.jumpTo({ center: [center[0], center[1]], zoom: (view.getZoom() ?? digitizeDefaultZoom + 1) - 1, pitch: 0, bearing: 0 });
      }
      lastHost = hostKey();
      lastView = nextKey;
    } finally { publishing = false; }
  };
  const safely = (action: () => void) => { try { action(); } catch (error) { report(error); } };
  const onHostMove = () => { if (visible) safely(() => syncFromHost()); };
  const moveKey = map.on('moveend', () => { if (visible) safely(syncToHost); });
  const resize = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!disposed && visible) safely(() => { map.updateSize(); syncFromHost(true); });
    });
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(container);
  const navigate = (action: () => void) => { if (!disposed) safely(() => { if (host && !synchronized) syncFromHost(true); action(); syncToHost(); }); };
  return {
    setHost(next: DigitizeHostMap | null) {
      if (disposed || next === host) return;
      host?.off('moveend', onHostMove);
      host = next;
      synchronized = false;
      lastHost = ''; lastView = '';
      host?.on('moveend', onHostMove);
      if (visible) resize();
    },
    setVisible(next: boolean) {
      if (disposed || next === visible) return;
      if (!next && visible) safely(syncToHost);
      visible = next;
      if (visible) resize();
      else cancelAnimationFrame(frame);
    },
    syncFromMapLibre: () => safely(() => syncFromHost(true)),
    locate: () => navigate(() => { view.setCenter(fromLonLat(digitizeDefaultCenter)); view.setZoom(digitizeDefaultZoom); view.setRotation(0); }),
    resetNorth: () => navigate(() => view.setRotation(0)),
    zoomIn: () => navigate(() => view.setZoom((view.getZoom() ?? digitizeDefaultZoom) + 1)),
    zoomOut: () => navigate(() => view.setZoom((view.getZoom() ?? digitizeDefaultZoom) - 1)),
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      host?.off('moveend', onHostMove);
      host = null;
      unByKey(moveKey);
    },
  };
}
