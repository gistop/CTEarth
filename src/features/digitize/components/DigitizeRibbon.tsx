import { useEffect, type ComponentType, type ReactNode } from 'react';
import { Download, Layers, LocateFixed, MousePointer2, PenTool, Plus, Save, SlidersHorizontal, SquareDashedMousePointer, X } from 'lucide-react';
import { displayLayerName, type EditableGeometryType, type useGis } from '../../../gisStore';
import { useLayerStore } from '../../layers';
import { useDigitize } from '../stores/DigitizeContext';
import type { DigitizeGeometryType } from '../types';
import { NewLayerButton } from './NewLayerButton';
import { RasterEditControls } from './RasterEditControls';

export type DigitizeRibbonTool = { active?: boolean; disabled?: boolean; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; muted?: boolean; render?: () => ReactNode; onClick?: () => void };
export type DigitizeRibbonGroup = { title: string; tools: DigitizeRibbonTool[]; accessory?: ReactNode };

export function useDigitizeRibbonGroups(active: boolean): DigitizeRibbonGroup[] {
  const digitize = useDigitize();
  const { activeLayerId, createBlankGeoJsonLayer, layers, saveGeoJsonLayer, setActiveLayer } = useLayerStore();
  const activeLayer = layers.find(layer => layer.id === activeLayerId) ?? layers.at(-1) ?? null;
  const { activeTool, setActiveTool, setEditingActive } = digitize;
  useEffect(() => { setEditingActive(active); }, [active, setEditingActive]);
  useEffect(() => {
    if (active && activeLayer?.geometryType && activeTool !== activeLayer.geometryType) setActiveTool(activeLayer.geometryType);
  }, [active, activeLayer?.geometryType, activeTool, setActiveTool]);
  return createEditRibbonGroups({ activeLayerId, createBlankGeoJsonLayer, digitize, layers, saveGeoJsonLayer, setActiveLayer });
}

function createEditRibbonGroups({
  activeLayerId,
  createBlankGeoJsonLayer,
  digitize,
  layers,
  saveGeoJsonLayer,
  setActiveLayer,
}: {
  activeLayerId: string | null;
  createBlankGeoJsonLayer: ReturnType<typeof useGis>['createBlankGeoJsonLayer'];
  digitize: ReturnType<typeof useDigitize>;
  layers: ReturnType<typeof useGis>['layers'];
  saveGeoJsonLayer: ReturnType<typeof useGis>['saveGeoJsonLayer'];
  setActiveLayer: ReturnType<typeof useGis>['setActiveLayer'];
}): DigitizeRibbonGroup[] {
  const hasEditableLayer = layers.length > 0;
  const activeLayer = layers.find((item) => item.id === activeLayerId) ?? layers.at(-1) ?? null;
  const activeGeometryType = activeLayer?.geometryType;
  const activeSaveLayerId = activeLayerId ?? activeLayer?.id;
  const createLayerTool = (geometryType: EditableGeometryType, label: string, icon: DigitizeRibbonTool['icon']): DigitizeRibbonTool => ({
    icon,
    label,
    render: () => <NewLayerButton geometryType={geometryType} label={label} icon={icon} />,
  });
  const drawTool = (tool: DigitizeGeometryType, label: string, icon: DigitizeRibbonTool['icon']): DigitizeRibbonTool => ({
    active: digitize.activeTool === tool && !digitize.modifyEnabled && !digitize.rasterAoiActive,
    disabled: !hasEditableLayer || (Boolean(activeGeometryType) && activeGeometryType !== tool),
    icon,
    label,
    onClick: () => digitize.setActiveTool(tool),
  });

  return [
    {
      title: 'GeoJSON',
      tools: [
        createLayerTool('Point', 'New Pt', Plus),
        createLayerTool('LineString', 'New Ln', PenTool),
        createLayerTool('Polygon', 'New Poly', SquareDashedMousePointer),
        {
          disabled: !activeSaveLayerId,
          icon: Save,
          label: 'Save',
          onClick: () => void saveGeoJsonLayer(activeSaveLayerId),
        },
        {
          disabled: !activeSaveLayerId,
          icon: Download,
          label: 'Save As',
          onClick: () => void saveGeoJsonLayer(activeSaveLayerId, { saveAs: true }),
        },
      ],
    },
    {
      title: '栅格',
      tools: [],
      accessory: <RasterEditControls />,
    },
    {
      title: '目标图层',
      tools: [],
      accessory: (
        <label className="ribbon-layer-select">
          <Layers size={18} strokeWidth={1.7} />
          <select
            value={activeLayerId ?? layers.at(-1)?.id ?? ''}
            disabled={layers.length === 0}
            aria-label="当前编辑图层"
            onChange={(event) => {
              if (event.target.value) {
                setActiveLayer(event.target.value);
              }
            }}
          >
            {layers.length === 0 ? <option value="">无可编辑图层</option> : null}
            {layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {displayLayerName(layer.fileName)}
              </option>
            ))}
          </select>
        </label>
      ),
    },
    {
      title: '创建要素',
      tools: [
        drawTool('Point', '点', Plus),
        drawTool('LineString', '线', PenTool),
        drawTool('Polygon', '面', SquareDashedMousePointer),
      ],
    },
    {
      title: '编辑',
      tools: [
        {
          active: digitize.modifyEnabled,
          disabled: !hasEditableLayer,
          icon: MousePointer2,
          label: '节点编辑',
          onClick: digitize.toggleModify,
        },
        {
          disabled: !hasEditableLayer,
          icon: X,
          label: '清空图层',
          muted: digitize.featureCount === 0,
          onClick: digitize.clearFeatures,
        },
      ],
    },
    {
      title: '辅助',
      tools: [
        {
          active: digitize.snapEnabled,
          icon: LocateFixed,
          label: 'Snap',
          onClick: () => digitize.setSnapEnabled(!digitize.snapEnabled),
        },
        {
          active: digitize.traceEnabled,
          disabled: !hasEditableLayer,
          icon: SlidersHorizontal,
          label: '自动完成面',
          onClick: () => digitize.setTraceEnabled(!digitize.traceEnabled),
        },
      ],
    },
    {
      title: '状态',
      tools: [
        {
          icon: Layers,
          label: `编辑 ${digitize.featureCount}`,
          muted: true,
        },
      ],
    },
  ];
}
