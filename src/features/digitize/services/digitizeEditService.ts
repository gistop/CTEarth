import type { DigitizeDataPort, DigitizeEditSession, DigitizeFeatureCollection } from '../types';
import { validateFeatureCollection } from './digitizeValidation';

export function createDigitizeEditService(port: DigitizeDataPort) {
  const sessions = new WeakMap<DigitizeEditSession, { requireActive: boolean }>();
  const beginEdit = (layerId?: string): DigitizeEditSession => {
    const layer = layerId ? port.getLayer(layerId) : port.getActiveLayer();
    if (!layer) throw new Error('请选择一个可编辑的矢量图层。');
    const session = Object.freeze({ layerId: layer.id, base: layer.geojson, geometryType: layer.geometryType });
    sessions.set(session, { requireActive: layerId === undefined });
    return session;
  };
  const cancel = (session: DigitizeEditSession) => { sessions.delete(session); };
  const commit = (session: DigitizeEditSession, features: unknown[]): DigitizeFeatureCollection => {
    const metadata = sessions.get(session);
    if (!metadata) throw new Error('编辑会话已结束，请重新开始编辑。');
    const layer = port.getLayer(session.layerId);
    if (!layer || (metadata.requireActive && port.getActiveLayer()?.id !== session.layerId)) throw new Error('编辑目标已切换或移除，本次变更未提交。');
    if (layer.geojson !== session.base || layer.geometryType !== session.geometryType) throw new Error('图层数据已变化，本次变更未覆盖新数据；请重新编辑。');
    const next: DigitizeFeatureCollection = { ...session.base, features };
    validateFeatureCollection(next, session.geometryType);
    if (JSON.stringify(features) === JSON.stringify(session.base.features)) {
      cancel(session);
      return session.base;
    }
    delete next.bbox;
    const owned = structuredClone(next);
    port.replaceFeatures(session.layerId, owned, session.base);
    cancel(session);
    return owned;
  };
  const clearFeatures = (layerId?: string) => {
    const session = beginEdit(layerId);
    try { return commit(session, []); } finally { cancel(session); }
  };
  return { beginEdit, commit, cancel, clearFeatures };
}

export type DigitizeEditService = ReturnType<typeof createDigitizeEditService>;
