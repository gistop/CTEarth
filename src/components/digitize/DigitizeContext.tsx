import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type DigitizeGeometryType = 'Point' | 'LineString' | 'Polygon';

export type RasterAoiPolygon = {
  type: 'Polygon';
  coordinates: [number, number][][];
};

type DigitizeState = {
  activeTool: DigitizeGeometryType;
  clearRequestId: number;
  editingActive: boolean;
  featureCount: number;
  modifyEnabled: boolean;
  rasterAoi: RasterAoiPolygon | null;
  rasterAoiActive: boolean;
  rasterAoiRevision: number;
  snapEnabled: boolean;
  status: string;
  traceEnabled: boolean;
};

type DigitizeContextValue = DigitizeState & {
  clearFeatures: () => void;
  clearRasterAoi: () => void;
  setActiveTool: (tool: DigitizeGeometryType) => void;
  setEditingActive: (active: boolean) => void;
  setFeatureCount: (count: number) => void;
  setRasterAoi: (polygon: RasterAoiPolygon | null) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setStatus: (status: string) => void;
  setTraceEnabled: (enabled: boolean) => void;
  startRasterAoi: () => void;
  toggleModify: () => void;
};

const DigitizeContext = createContext<DigitizeContextValue | null>(null);

const defaultStatus = '点工具已启用，Snap 已开启。';

export function DigitizeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DigitizeState>({
    activeTool: 'Point',
    clearRequestId: 0,
    editingActive: false,
    featureCount: 0,
    modifyEnabled: false,
    rasterAoi: null,
    rasterAoiActive: false,
    rasterAoiRevision: 0,
    snapEnabled: true,
    status: defaultStatus,
    traceEnabled: true,
  });

  const setActiveTool = useCallback((tool: DigitizeGeometryType) => {
    setState((current) => ({
      ...current,
      activeTool: tool,
      modifyEnabled: false,
      rasterAoiActive: false,
      status: getToolStatus(tool, current.snapEnabled, current.traceEnabled),
    }));
  }, []);

  const startRasterAoi = useCallback(() => {
    setState((current) => ({
      ...current,
      modifyEnabled: false,
      rasterAoi: null,
      rasterAoiActive: true,
      rasterAoiRevision: current.rasterAoiRevision + 1,
      status: 'AOI 绘制已启用：在地图上绘制一个多边形，双击结束。',
    }));
  }, []);

  const setRasterAoi = useCallback((rasterAoi: RasterAoiPolygon | null) => {
    setState((current) => ({
      ...current,
      rasterAoi,
      rasterAoiActive: rasterAoi ? false : current.rasterAoiActive,
      status: rasterAoi
        ? 'AOI 已绘制，可输入像元值并执行栅格修改。'
        : 'AOI 已清空。',
    }));
  }, []);

  const clearRasterAoi = useCallback(() => {
    setState((current) => ({
      ...current,
      rasterAoi: null,
      rasterAoiActive: false,
      rasterAoiRevision: current.rasterAoiRevision + 1,
      status: 'AOI 已清空。',
    }));
  }, []);

  const setEditingActive = useCallback((editingActive: boolean) => {
    setState((current) => ({
      ...current,
      editingActive,
      modifyEnabled: editingActive ? current.modifyEnabled : false,
      rasterAoiActive: editingActive ? current.rasterAoiActive : false,
      status: editingActive
        ? getToolStatus(current.activeTool, current.snapEnabled, current.traceEnabled)
        : current.status,
    }));
  }, []);

  const toggleModify = useCallback(() => {
    setState((current) => ({
      ...current,
      modifyEnabled: !current.modifyEnabled,
      rasterAoiActive: false,
      status: !current.modifyEnabled
        ? '节点编辑已启用，拖动顶点时支持 Snap。'
        : getToolStatus(current.activeTool, current.snapEnabled, current.traceEnabled),
    }));
  }, []);

  const setSnapEnabled = useCallback((enabled: boolean) => {
    setState((current) => ({
      ...current,
      snapEnabled: enabled,
      status: getToolStatus(current.activeTool, enabled, current.traceEnabled),
    }));
  }, []);

  const setTraceEnabled = useCallback((enabled: boolean) => {
    setState((current) => ({
      ...current,
      traceEnabled: enabled,
      status: getToolStatus(current.activeTool, current.snapEnabled, enabled),
    }));
  }, []);

  const setStatus = useCallback((status: string) => {
    setState((current) => ({ ...current, status }));
  }, []);

  const setFeatureCount = useCallback((featureCount: number) => {
    setState((current) => ({ ...current, featureCount }));
  }, []);

  const clearFeatures = useCallback(() => {
    setState((current) => ({
      ...current,
      clearRequestId: current.clearRequestId + 1,
      featureCount: 0,
      modifyEnabled: false,
      rasterAoiActive: false,
      status: '已清空数字化草图。',
    }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      clearFeatures,
      clearRasterAoi,
      setActiveTool,
      setEditingActive,
      setFeatureCount,
      setRasterAoi,
      setSnapEnabled,
      setStatus,
      setTraceEnabled,
      startRasterAoi,
      toggleModify,
    }),
    [
      clearFeatures,
      clearRasterAoi,
      setActiveTool,
      setEditingActive,
      setFeatureCount,
      setRasterAoi,
      setSnapEnabled,
      setStatus,
      setTraceEnabled,
      startRasterAoi,
      state,
      toggleModify,
    ],
  );

  return <DigitizeContext.Provider value={value}>{children}</DigitizeContext.Provider>;
}

export function useDigitize() {
  const value = useContext(DigitizeContext);

  if (!value) {
    throw new Error('useDigitize must be used inside DigitizeProvider');
  }

  return value;
}

function getToolStatus(tool: DigitizeGeometryType, snapEnabled: boolean, traceEnabled: boolean) {
  const snapText = snapEnabled ? 'Snap 已开启' : 'Snap 已关闭';
  const traceText = traceEnabled && tool === 'Polygon' ? '公共边自动完成已开启' : '公共边自动完成已关闭';

  return `${labelForTool(tool)}工具已启用，${snapText}，${traceText}。`;
}

function labelForTool(tool: DigitizeGeometryType) {
  if (tool === 'Point') {
    return '点';
  }

  if (tool === 'LineString') {
    return '线';
  }

  return '面';
}
