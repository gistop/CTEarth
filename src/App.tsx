import { createContext, Fragment, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type IDockviewHeaderActionsProps,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type IDockviewPanel,
} from 'dockview-react';
import {
  ArrowLeft,
  Bell,
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  ChartColumn,
  Database,
  Download,
  Earth,
  FolderCog,
  FolderOpen,
  Grid2X2,
  HelpCircle,
  History,
  Layers,
  LocateFixed,
  Map,
  Minus,
  MousePointer2,
  Mountain,
  PanelLeft,
  Pause,
  PenTool,
  Play,
  Plus,
  Redo2,
  Rotate3d,
  RotateCcw,
  Ruler,
  Save,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  SquareDashedMousePointer,
  TableProperties,
  Tags,
  Wrench,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MapPanel } from './components/MapPanel';
import { CoordinateSystemControls as MapCoordinateSystemControls } from './components/map/CoordinateSystemControls';
import { GlobeLocateSearchButton } from './components/map/GlobeLocateSearchButton';
import { MapLayerMenu } from './components/map/MapLayerMenu';
import { MapBasemapSelectionProvider } from './components/map/MapBasemapSelectionContext';
import type { OpenLayersProjectionMapHandle } from './components/map/OpenLayersProjectionMap';
import {
  AttributeTableProvider,
  defaultAttributeTableState,
  useAttributeTable,
  type AttributeTableState,
} from './components/attributes/AttributeTableContext';
import { ContentsPanel as EmbeddedContentsPanel } from './components/contents/ContentsPanel';
import {
  DigitizeProvider,
  useDigitize,
  type DigitizeGeometryType,
} from './components/digitize/DigitizeContext';
import {
  MapCommandProvider,
  type DisplayCrsId,
  type MapCommand,
  type MapCommandState,
  type MapViewMode,
  useMapCommands,
} from './components/map/MapCommandContext';
import { MapIdentifyProvider, useMapIdentify } from './components/map/MapIdentifyContext';
import { MapSelectionProvider, useMapSelection } from './components/map/MapSelectionContext';
import { MapViewportProvider } from './components/map/MapViewportContext';
import {
  LayoutElementControls,
  LayoutAlignSplitButton,
  LayoutExportSplitButton,
  LayoutHeaderActions,
  LayoutPanel,
  LayoutOrderButton,
  LayoutPageSettings,
  LayoutSelectionSplitButton,
  LayoutProvider,
} from './components/layout/LayoutPanel';
import {
  GisProvider,
  type BufferParameters as BufferRunParameters,
  type EditableGeometryType,
  type ExtractByMaskParameters as ExtractByMaskRunParameters,
  type IdwParameters as IdwRunParameters,
  type OverlayParameters as OverlayRunParameters,
  type OverlayToolId,
  type SelectByLocationParameters as SelectByLocationRunParameters,
  type SelectByValueParameters as SelectByValueRunParameters,
  type TerrainParameters as TerrainRunParameters,
  type TerrainToolId,
  displayLayerName,
  useGis,
} from './gisStore';

type RibbonTool = {
  active?: boolean;
  disabled?: boolean;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  muted?: boolean;
  render?: () => React.ReactNode;
  onClick?: () => void;
};

type RibbonGroup = {
  accessory?: React.ReactNode;
  title: string;
  tools: RibbonTool[];
};

const quickTools = [
  { title: '保存', icon: Save },
  { title: '打开工程', icon: FolderOpen },
  { title: '撤销', icon: Undo2 },
  { title: '重做', icon: Redo2 },
  { title: '放大', icon: ZoomIn, active: true },
  { title: '缩小', icon: ZoomOut },
];

const ribbonTabs = ['工程', '地图', '布局', '分析', '编辑', '共享', '帮助'];
type RibbonTab = typeof ribbonTabs[number];
const editRibbonTab = '编辑';

const dockColumnWidths = {
  contents: 180,
  map: 640,
  inspector: 180,
};

const dockColumnRatio = {
  contents: 0.18,
  map: 0.64,
  inspector: 0.18,
};

const aiAssistantPanelId = 'ai-assistant-panel';
const attributeChartPanelIdPrefix = 'attribute-chart:';
const attributeTablePanelIdPrefix = 'attribute-table:';
type ProjectionMapCommand = Extract<MapCommand, 'zoomIn' | 'zoomOut' | 'resetNorth' | 'locate'>;
type ProjectionMapCommands = Pick<OpenLayersProjectionMapHandle, ProjectionMapCommand>;

function isProjectionMapCommand(command: MapCommand): command is ProjectionMapCommand {
  return command !== 'toggleDragRotate';
}

type DockPanelActionsValue = {
  hasProjectionMapCommands: boolean;
  registerProjectionMapCommands: (commands: ProjectionMapCommands) => () => void;
  runProjectionMapCommand: (command: ProjectionMapCommand) => void;
};

const DockPanelActionsContext = createContext<DockPanelActionsValue>({
  hasProjectionMapCommands: false,
  registerProjectionMapCommands: () => () => undefined,
  runProjectionMapCommand: () => undefined,
});

function useDockPanelActions() {
  return useContext(DockPanelActionsContext);
}

function getAttributeTablePanelId(layerId: string) {
  return `${attributeTablePanelIdPrefix}${encodeURIComponent(layerId)}`;
}

function getAttributeChartPanelId(layerId: string) {
  return `${attributeChartPanelIdPrefix}${encodeURIComponent(layerId)}`;
}

function getLayerIdFromAttributeTablePanelId(panelId: string | undefined) {
  if (!panelId?.startsWith(attributeTablePanelIdPrefix)) {
    return null;
  }

  try {
    return decodeURIComponent(panelId.slice(attributeTablePanelIdPrefix.length));
  } catch {
    return panelId.slice(attributeTablePanelIdPrefix.length);
  }
}

function getAttributeTableTitle(layerName?: string) {
  return layerName ? `属性表 - ${layerName}` : '属性表';
}

function getAttributeChartTitle(layerName?: string) {
  return layerName ? `图表 - ${layerName}` : '图表';
}

const AiAssistantPanel = lazy(() => (
  import('./components/ai/AiAssistantPanel').then((module) => ({ default: module.AiAssistantPanel }))
));
const AttributeTablePanel = lazy(() => (
  import('./components/attributes/AttributeTablePanel').then((module) => ({ default: module.AttributeTablePanel }))
));
const AttributeChartPanel = lazy(() => (
  import('./components/attributes/AttributeChartPanel').then((module) => ({ default: module.AttributeChartPanel }))
));
const ProjectionMap = lazy(() => (
  import('./components/map/OpenLayersProjectionMap').then((module) => ({ default: module.OpenLayersProjectionMap }))
));

const baseRibbonGroups: RibbonGroup[] = [
  {
    title: '剪贴板',
    tools: [
      { label: '粘贴', icon: Plus },
      { label: '剪切', icon: SquareDashedMousePointer, muted: true },
      { label: '复制', icon: Grid2X2, muted: true },
    ],
  },
  {
    title: '导航',
    tools: [
      { label: '浏览', icon: MousePointer2 },
      { label: '书签', icon: FolderOpen },
      { label: '转到 XY', icon: Map },
    ],
  },
  {
    title: '图层',
    tools: [
      { label: '底图', icon: Layers },
      { label: '添加数据', icon: Database },
      { label: '从路径添加数据', icon: Upload },
      { label: '添加图形图层', icon: Plus },
    ],
  },
  {
    title: '选择',
    tools: [
      { label: '选择', icon: MousePointer2 },
      { label: '按属性选择', icon: SquareDashedMousePointer },
      { label: '按位置选择', icon: Map },
      { label: '清除', icon: Pause, muted: true },
    ],
  },
  {
    title: '查询',
    tools: [
      { label: '属性', icon: PanelLeft },
      { label: '测量', icon: Ruler },
      { label: '定位', icon: Search },
      { label: 'Infographics', icon: Sparkles, muted: true },
    ],
  },
  {
    title: '输出',
    tools: [
      { label: '暂停', icon: Pause },
      { label: '锁定', icon: Settings },
      { label: '转换', icon: PenTool },
    ],
  },
  {
    title: '离线',
    tools: [
      { label: '下载地图', icon: Download, muted: true },
      { label: '同步', icon: History, muted: true },
    ],
  },
];

function createMapRibbonGroups({
  clearSelection,
  activeTab,
  hasLayers,
  identifyActive,
  selectionActive,
  setIdentifyActive,
  setSelectionActive,
  toggleIdentifyActive,
  toggleSelectionActive,
}: {
  clearSelection: ReturnType<typeof useGis>['clearSelection'];
  activeTab: RibbonTab;
  hasLayers: boolean;
  identifyActive: boolean;
  selectionActive: boolean;
  setIdentifyActive: (active: boolean) => void;
  setSelectionActive: (active: boolean) => void;
  toggleIdentifyActive: () => void;
  toggleSelectionActive: () => void;
}): RibbonGroup[] {
  const groups = baseRibbonGroups.map((group, groupIndex) => {
    if (groupIndex === 1) {
      return {
        ...group,
        tools: group.tools.map((tool, toolIndex) => (
          toolIndex === 0
            ? {
              ...tool,
              active: !selectionActive && !identifyActive,
              onClick: () => {
                setSelectionActive(false);
                setIdentifyActive(false);
              },
            }
            : tool
        )),
      };
    }

    if (groupIndex === 3) {
      return {
        ...group,
        tools: group.tools.map((tool, toolIndex) => {
          if (toolIndex === 0) {
            return {
              ...tool,
              active: selectionActive,
              disabled: !hasLayers,
              muted: !hasLayers,
              onClick: () => {
                setIdentifyActive(false);
                toggleSelectionActive();
              },
            };
          }

          if (toolIndex === 3) {
            return {
              ...tool,
              disabled: !hasLayers,
              icon: X,
              muted: !hasLayers,
              onClick: () => clearSelection(),
            };
          }

          return tool;
        }),
      };
    }

    if (activeTab === '共享' && groupIndex === 5) {
      return {
        ...group,
        tools: group.tools.map((tool, toolIndex) => {
          if (toolIndex === 0) {
            return {
              ...tool,
              label: '导出',
              icon: Download,
              render: () => <LayoutExportSplitButton />,
            };
          }

          return tool;
        }),
      };
    }

    return group;
  });

  groups[4] = {
    ...groups[4],
    tools: [
      {
        label: '识别',
        icon: Tags,
        active: identifyActive,
        disabled: !hasLayers,
        muted: !hasLayers,
        onClick: () => {
          setSelectionActive(false);
          toggleIdentifyActive();
        },
      },
      ...groups[4].tools,
    ],
  };

  return [
    ...groups.slice(0, 2),
    {
      title: '坐标系',
      tools: [],
      accessory: (
              <MapCoordinateSystemControls
              />
      ),
    },
    ...groups.slice(2),
  ];
}

const layoutRibbonGroups: RibbonGroup[] = [
  {
    title: '剪贴板',
    tools: [
      { label: '粘贴', icon: Plus },
      { label: '剪切', icon: SquareDashedMousePointer, muted: true },
      { label: '复制', icon: Grid2X2, muted: true },
    ],
  },
  {
    title: '导航',
    tools: [
      { label: '选择浏览', icon: MousePointer2 },
      { label: '平移页面', icon: Map },
      { label: '定位页面', icon: Search },
    ],
  },
  {
    title: '选择',
    tools: [
      { label: '选择元素', icon: MousePointer2, render: () => <LayoutSelectionSplitButton /> },
      { label: '框选元素', icon: SquareDashedMousePointer },
      { label: '清除选择', icon: X, muted: true },
    ],
  },
  {
    title: '整饬元素',
    tools: [],
    accessory: <LayoutElementControls />,
  },
  {
    title: '排列',
    tools: [
      { label: '对齐', icon: Grid2X2, render: () => <LayoutAlignSplitButton /> },
      { label: '分布', icon: SlidersHorizontal },
      { label: '上移', icon: Layers },
      { label: '下移', icon: Tags },
    ],
  },
  {
    title: '页面设置',
    tools: [],
    accessory: <LayoutPageSettings />,
  },
];

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
}): RibbonGroup[] {
  const hasEditableLayer = layers.length > 0;
  const activeLayer = layers.find((item) => item.id === activeLayerId) ?? layers.at(-1) ?? null;
  const activeGeometryType = activeLayer?.geometryType;
  const activeSaveLayerId = activeLayerId ?? activeLayer?.id;
  const createLayerTool = (geometryType: EditableGeometryType, label: string, icon: RibbonTool['icon']): RibbonTool => ({
    icon,
    label,
    onClick: () => {
      const defaultName = `${geometryType.toLowerCase()}-layer.geojson`;
      const fileName = window.prompt('GeoJSON layer name', defaultName);

      if (fileName === null) {
        return;
      }

      createBlankGeoJsonLayer({ fileName, geometryType });
      digitize.setActiveTool(geometryType);
    },
  });
  const drawTool = (tool: DigitizeGeometryType, label: string, icon: RibbonTool['icon']): RibbonTool => ({
    active: digitize.activeTool === tool && !digitize.modifyEnabled,
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

function RasterEditControls() {
  const [value, setValue] = useState('0');
  const digitize = useDigitize();
  const { editRasterByAoi, isRunning, raster, saveRasterLayer } = useGis();
  const hasValidValue = Number.isFinite(Number(value));

  return (
    <div className="ribbon-raster-edit">
      <label className="ribbon-layer-select">
        <Layers size={18} strokeWidth={1.7} />
        <select value={raster ? 'raster' : ''} disabled={!raster} aria-label="当前栅格图层">
          {raster ? (
            <option value="raster">{displayLayerName(raster.name)}</option>
          ) : (
            <option value="">无栅格图层</option>
          )}
        </select>
      </label>
      <button
        className={digitize.rasterAoiActive ? 'ribbon-aoi-button is-active' : 'ribbon-aoi-button'}
        type="button"
        title="绘制 AOI"
        disabled={!raster}
        aria-pressed={digitize.rasterAoiActive}
        onClick={digitize.startRasterAoi}
      >
        <SquareDashedMousePointer size={23} strokeWidth={1.6} />
        <span>AOI</span>
      </button>
      <label className="ribbon-value-input">
        <span>修改值</span>
        <input
          type="number"
          value={value}
          aria-label="新像元值"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button
        className="ribbon-icon-only-button"
        type="button"
        title="执行栅格修改"
        disabled={!raster || !digitize.rasterAoi || !hasValidValue || isRunning}
        onClick={() => {
          if (digitize.rasterAoi) {
            void editRasterByAoi({ polygon: digitize.rasterAoi, value });
          }
        }}
      >
        <Play size={23} strokeWidth={1.6} />
      </button>
      <button
        className="ribbon-icon-only-button"
        type="button"
        title="下载 GeoTIFF"
        disabled={!raster || isRunning}
        onClick={() => void saveRasterLayer()}
      >
        <Download size={23} strokeWidth={1.6} />
      </button>
    </div>
  );
}

function ToolButton({
  title,
  icon: Icon,
  active,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active?: boolean;
}) {
  return (
    <button className={`icon-button${active ? ' is-active' : ''}`} type="button" title={title} aria-label={title}>
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}

function QuickAccessBar({
  isRibbonCollapsed,
  isAiAssistantPanelVisible,
  onToggleAiAssistantPanel,
  onToggleRibbon,
}: {
  isRibbonCollapsed: boolean;
  isAiAssistantPanelVisible: boolean;
  onToggleAiAssistantPanel: () => void;
  onToggleRibbon: () => void;
}) {
  return (
    <header className="quick-access">
      <div className="brand-mark" aria-label="CTEarth">C</div>
      <div className="quick-divider" />
      <div className="quick-tools">
        {quickTools.map((tool) => (
          <ToolButton key={tool.title} {...tool} />
        ))}
      </div>
      <button className="project-switcher" type="button">
        <span>MyProject35</span>
        <ChevronDown size={15} />
      </button>
      <button
        className="icon-button panel-visibility-button"
        type="button"
        title={isAiAssistantPanelVisible ? '隐藏 AI 面板' : '显示 AI 面板'}
        aria-label={isAiAssistantPanelVisible ? '隐藏 AI 面板' : '显示 AI 面板'}
        aria-pressed={isAiAssistantPanelVisible}
        onClick={onToggleAiAssistantPanel}
      >
        <span>AI</span>
      </button>
      <div className="global-search">
        <Search size={16} />
        <input aria-label="全局搜索" placeholder="命令或搜索 (Alt+Q)" />
      </div>
      <div className="window-actions">
        <button type="button" title="共享" aria-label="共享"><Share2 size={17} /></button>
        <button type="button" title="通知" aria-label="通知"><Bell size={17} /></button>
        <button type="button" title="帮助" aria-label="帮助"><HelpCircle size={17} /></button>
        <button
          type="button"
          title={isRibbonCollapsed ? '展开功能区' : '收起功能区'}
          aria-label={isRibbonCollapsed ? '展开功能区' : '收起功能区'}
          aria-pressed={isRibbonCollapsed}
          onClick={onToggleRibbon}
        >
          {isRibbonCollapsed ? <ChevronsDown size={17} /> : <ChevronsUp size={17} />}
        </button>
      </div>
    </header>
  );
}

function Ribbon({
  activeTab,
  collapsed,
  onChangeTab,
}: {
  activeTab: RibbonTab;
  collapsed: boolean;
  onChangeTab: (tab: RibbonTab) => void;
}) {
  const digitize = useDigitize();
  const { activeLayerId, clearSelection, createBlankGeoJsonLayer, layers, saveGeoJsonLayer, setActiveLayer } = useGis();
  const { identifyActive, setIdentifyActive, toggleIdentifyActive } = useMapIdentify();
  const { selectionActive, setSelectionActive, toggleSelectionActive } = useMapSelection();
  const activeEditLayer = layers.find((item) => item.id === activeLayerId) ?? layers.at(-1) ?? null;

  useEffect(() => {
    if (activeTab === editRibbonTab && activeEditLayer?.geometryType && digitize.activeTool !== activeEditLayer.geometryType) {
      digitize.setActiveTool(activeEditLayer.geometryType);
    }
  }, [activeEditLayer?.geometryType, activeTab, digitize]);

  const activeGroups = activeTab === editRibbonTab
    ? createEditRibbonGroups({ activeLayerId, createBlankGeoJsonLayer, digitize, layers, saveGeoJsonLayer, setActiveLayer })
    : activeTab === '布局'
      ? layoutRibbonGroups.map((group, groupIndex) => {
        if (groupIndex !== 4) {
          return group;
        }

        return {
          ...group,
          tools: group.tools.map((tool, toolIndex) => {
            if (toolIndex === 2) {
              return { ...tool, render: () => <LayoutOrderButton direction="up" /> };
            }

            if (toolIndex === 3) {
              return { ...tool, render: () => <LayoutOrderButton direction="down" /> };
            }

            return tool;
          }),
        };
      })
      : createMapRibbonGroups({
        activeTab,
        clearSelection,
        hasLayers: layers.length > 0,
        identifyActive,
        selectionActive,
        setIdentifyActive,
        setSelectionActive,
        toggleIdentifyActive,
        toggleSelectionActive,
      });

  return (
    <section className={`ribbon${activeTab === ribbonTabs[2] ? ' layout-ribbon' : ''}`} aria-label="功能区">
      <nav className="ribbon-tabs" aria-label="菜单">
        <div className="ribbon-tab-list">
          {ribbonTabs.map((tab) => (
            <button
              key={tab}
              className={tab === activeTab ? 'is-selected' : ''}
              type="button"
              onClick={() => {
                onChangeTab(tab);
                digitize.setEditingActive(tab === editRibbonTab);
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>
      <div className="ribbon-strip" aria-hidden={collapsed}>
        {activeGroups.map((group) => (
          <div className="ribbon-group" key={group.title}>
            <div className={group.accessory ? 'ribbon-tools ribbon-tools-accessory' : 'ribbon-tools'}>
              {group.accessory}
              {group.tools.map((tool) => {
                if (tool.render) {
                  return (
                    <Fragment key={tool.label}>
                      {tool.render()}
                    </Fragment>
                  );
                }

                const Icon = tool.icon;
                return (
                  <button
                    className={[
                      tool.muted ? 'is-muted' : '',
                      tool.active ? 'is-active' : '',
                    ].filter(Boolean).join(' ')}
                    disabled={tool.disabled}
                    key={tool.label}
                    type="button"
                    aria-pressed={tool.onClick ? tool.active : undefined}
                    onClick={tool.onClick}
                  >
                    <Icon size={23} strokeWidth={1.6} />
                    <span>{tool.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="ribbon-group-title">{group.title}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContentsPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { layer, message, uploadCsv, uploadGeoJson, uploadGeoTiff, uploadShapefileZip } = useGis();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (/\.csv$/i.test(file.name)) {
      await uploadCsv(file);
    } else if (isGeoTiffFile(file.name)) {
      await uploadGeoTiff(file);
    } else if (/\.geojson$/i.test(file.name) || /\.json$/i.test(file.name)) {
      await uploadGeoJson(file);
    } else {
      await uploadShapefileZip(file);
    }
    event.target.value = '';
  };

  return (
    <aside className="panel-shell">
      <div className="panel-search">
        <Search size={15} />
        <input placeholder="搜索" aria-label="搜索内容" />
      </div>
      <div className="contents-tabs">
        <Layers size={18} />
        <Database size={18} />
        <Map size={18} />
        <PenTool size={18} />
        <Grid2X2 size={18} />
        <button type="button" title="上传 CSV、Shapefile ZIP、GeoJSON 或 GeoTIFF" aria-label="上传 CSV、Shapefile ZIP、GeoJSON 或 GeoTIFF" onClick={() => fileInputRef.current?.click()}>
          <Upload size={18} />
        </button>
        <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".csv,.zip,.geojson,.json,.tif,.tiff,.geotiff" onChange={handleFileChange} />
      </div>
      <section className="layer-tree">
        <h3>绘制顺序</h3>
        <div className="tree-row root">
          <input type="checkbox" defaultChecked aria-label="地图" />
          <Map size={16} />
          <span>地图</span>
        </div>
        {layer ? (
          <>
            <div className="tree-row selected">
              <input type="checkbox" defaultChecked aria-label={`${displayLayerName(layer.fileName)} 图层`} />
              <span className="layer-swatch point" />
              <span>{displayLayerName(layer.fileName)}</span>
            </div>
            <div className="layer-note">
              {layer.geojson.features.length} 个要素
              {layer.points.features.length > 0 ? `，点：${layer.points.features.length}` : ''}
              {layer.selectedField ? `，字段：${layer.selectedField}` : ''}
            </div>
          </>
        ) : (
          <div className="layer-note">点击上方上传按钮，选择 Shapefile ZIP 或 GeoJSON。</div>
        )}
        <div className="layer-note status">{message}</div>
      </section>
    </aside>
  );
}

function isGeoTiffFile(fileName: string) {
  return /\.(tif|tiff|geotiff)$/i.test(fileName);
}

type InspectorTabId = 'statistics' | 'mask' | 'annotation' | 'tools';
type ToolView = 'tree' | 'detail';
type ToolDetailTab = 'parameters' | 'environment';
type AnalysisTool = 'idw' | 'buffer' | 'extractByMask' | 'selectByValue' | 'selectByLocation' | TerrainToolId | OverlayToolId;
type ToolNode = {
  id: string;
  label: string;
  children?: ToolNode[];
  tool?: AnalysisTool;
};

const overlayToolIds = ['intersect', 'union', 'erase'] as const;

const inspectorTabs: {
  id: InspectorTabId;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { id: 'statistics', label: '统计数据', icon: Database },
  { id: 'mask', label: '掩膜', icon: SquareDashedMousePointer },
  { id: 'annotation', label: '高级标注', icon: Tags },
  { id: 'tools', label: '工具', icon: Wrench },
];

const toolTree: ToolNode[] = [{
  id: 'general',
  label: '通用',
  children: [
    {
      id: 'general-interpolation',
      label: '插值',
      children: [{ id: 'general-interpolation-idw', label: '反距离加权', tool: 'idw' }],
    },
    {
      id: 'general-proximity',
      label: '邻近',
      children: [{ id: 'general-proximity-buffer', label: '缓冲区', tool: 'buffer' }],
    },
    {
      id: 'general-overlay',
      label: '叠加',
      children: [
        { id: 'general-overlay-intersect', label: '相交', tool: 'intersect' },
        { id: 'general-overlay-union', label: '联合', tool: 'union' },
        { id: 'general-overlay-erase', label: '擦除', tool: 'erase' },
      ],
    },
    {
      id: 'general-extraction',
      label: '提取',
      children: [{ id: 'general-extraction-mask', label: '按掩膜提取', tool: 'extractByMask' }],
    },
    {
      id: 'general-selection',
      label: '选择',
      children: [
        { id: 'general-selection-value', label: '按属性选择', tool: 'selectByValue' },
        { id: 'general-selection-location', label: '按位置选择', tool: 'selectByLocation' },
      ],
    },
    {
      id: 'general-terrain',
      label: '地形',
      children: [
        { id: 'general-terrain-hillshade', label: '山体阴影', tool: 'hillshade' },
        { id: 'general-terrain-slope', label: '坡度', tool: 'slope' },
        { id: 'general-terrain-aspect', label: '坡向', tool: 'aspect' },
      ],
    },
  ],
}, {
  id: 'industry',
  label: '行业',
  children: [
    { id: 'industry-water', label: '水利' },
    { id: 'industry-forestry', label: '林业' },
    { id: 'industry-geology', label: '地质' },
  ],
}];

const toolTitles: Record<AnalysisTool, string> = {
  idw: '反距离加权',
  buffer: '缓冲区',
  extractByMask: '按掩膜提取',
  selectByValue: '按属性选择',
  selectByLocation: '按位置选择',
  intersect: '相交',
  union: '联合',
  erase: '擦除',
  hillshade: '山体阴影',
  slope: '坡度',
  aspect: '坡向',
};

const selectionModeOptions = [
  { value: 'new', label: '新建选择集' },
  { value: 'add', label: '添加到当前选择集' },
  { value: 'remove', label: '从当前选择集移除' },
  { value: 'subset', label: '从当前选择集筛选' },
] as const;

function InspectorPanel() {
  const [activeTab, setActiveTab] = useState<InspectorTabId>('statistics');

  return (
    <aside className="panel-shell inspector-panel">
      <div className="inspector-content">
        {activeTab === 'statistics' && <section className="inspector-scroll-area"><StatisticsTab /></section>}
        {activeTab === 'mask' && <div className="inspector-scroll-area"><MaskTab /></div>}
        {activeTab === 'annotation' && <div className="inspector-scroll-area"><AnnotationTab /></div>}
        {activeTab === 'tools' && <ToolsTab />}
      </div>
      <div className="inspector-tabs" role="tablist" aria-label="右侧面板">
        {inspectorTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              className={activeTab === tab.id ? 'is-selected' : ''}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} strokeWidth={1.7} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function StatisticsTab() {
  const { isRunning, layer, layers, raster, toolsReady, vectorOverlay } = useGis();

  return (
    <>
      <div className="inspector-toolbar">
        <button className="is-selected" type="button" title="统计数据" aria-label="统计数据"><Database size={20} /></button>
        <button type="button" title="属性" aria-label="属性"><PanelLeft size={20} /></button>
        <button type="button" title="更多" aria-label="更多"><Settings size={20} /></button>
      </div>
      <h3>统计数据</h3>
      <dl className="inspector-stat-grid">
        <dt>图层数</dt>
        <dd>{layers.length}</dd>
        <dt>当前图层</dt>
        <dd>{displayLayerName(layer?.fileName ?? '') || '无'}</dd>
        <dt>要素数</dt>
        <dd>{layer?.geojson.features.length ?? 0}</dd>
        <dt>已选择</dt>
        <dd>{layer?.selectedFeatureIndexes.length ?? 0}</dd>
        <dt>点要素</dt>
        <dd>{layer?.points.features.length ?? 0}</dd>
        <dt>数值字段</dt>
        <dd>{layer?.numericFields.length ?? 0}</dd>
        <dt>栅格结果</dt>
        <dd>{raster ? `${raster.width} x ${raster.height}` : '无'}</dd>
        <dt>矢量结果</dt>
        <dd>{vectorOverlay ? displayLayerName(vectorOverlay.name) : '无'}</dd>
        <dt>WASM</dt>
        <dd>{toolsReady ? '已就绪' : '加载中'}</dd>
        <dt>任务状态</dt>
        <dd>{isRunning ? '运行中' : '空闲'}</dd>
      </dl>
    </>
  );
}

function MaskTab() {
  return (
    <section className="inspector-empty">
      <h3>掩膜</h3>
      <p>当前未配置掩膜。</p>
    </section>
  );
}

function AnnotationTab() {
  return (
    <section className="inspector-empty">
      <h3>高级标注</h3>
      <p>当前未配置高级标注。</p>
    </section>
  );
}

function ToolsTab() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ToolView>('tree');
  const [detailTab, setDetailTab] = useState<ToolDetailTab>('parameters');
  const [activeTool, setActiveTool] = useState<AnalysisTool>('idw');
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const visibleNodes = useMemo(() => filterToolTree(toolTree, normalizedQuery), [normalizedQuery]);
  const visibleIds = useMemo(() => new Set(collectNodeIds(visibleNodes)), [visibleNodes]);
  const expandedIds = useMemo(() => {
    if (!normalizedQuery) {
      return expandedNodeIds;
    }

    return new Set([...expandedNodeIds, ...collectParentIds(visibleNodes)]);
  }, [expandedNodeIds, normalizedQuery, visibleNodes]);
  const openTool = (tool: AnalysisTool) => {
    setActiveTool(tool);
    setDetailTab('parameters');
    setView('detail');
  };
  const toggleNode = (nodeId: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  };

  if (view === 'detail') {
    return (
      <ToolDetailView
        activeTab={detailTab}
        tool={activeTool}
        onBack={() => setView('tree')}
        onChangeTab={setDetailTab}
      />
    );
  }

  return (
    <section className="tools-panel">
      <div className="panel-search">
        <Search size={15} />
        <input
          placeholder="搜索工具"
          aria-label="搜索工具"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="tool-tree" aria-label="工具树">
        {visibleNodes.map((node) => (
          <ToolTreeNode
            key={node.id}
            depth={0}
            expandedIds={expandedIds}
            node={node}
            query={normalizedQuery}
            visibleIds={visibleIds}
            onOpenTool={openTool}
            onToggle={toggleNode}
          />
        ))}
      </div>
      {trimmedQuery && visibleNodes.length === 0 && (
        <p className="tool-empty">没有找到匹配工具。</p>
      )}
    </section>
  );
}

function ToolTreeNode({
  node,
  depth,
  expandedIds,
  query,
  visibleIds,
  onOpenTool,
  onToggle,
}: {
  node: ToolNode;
  depth: number;
  expandedIds: Set<string>;
  query: string;
  visibleIds: Set<string>;
  onOpenTool: (tool: AnalysisTool) => void;
  onToggle: (nodeId: string) => void;
}) {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expandedIds.has(node.id);
  const isMatched = query.length > 0 && node.label.toLowerCase().includes(query);
  const handleOpen = node.tool ? () => onOpenTool(node.tool as AnalysisTool) : undefined;

  return (
    <>
      <TreeRow
        depth={depth}
        label={node.label}
        leaf={!hasChildren}
        open={isExpanded}
        matched={isMatched}
        onOpen={handleOpen}
        onToggle={hasChildren ? () => onToggle(node.id) : undefined}
      />
      {hasChildren && isExpanded && node.children?.filter((child) => visibleIds.has(child.id)).map((child) => (
        <ToolTreeNode
          key={child.id}
          depth={depth + 1}
          expandedIds={expandedIds}
          node={child}
          query={query}
          visibleIds={visibleIds}
          onOpenTool={onOpenTool}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

function TreeRow({
  depth,
  label,
  open = false,
  leaf = false,
  matched = false,
  onOpen,
  onToggle,
}: {
  depth: number;
  label: string;
  open?: boolean;
  leaf?: boolean;
  matched?: boolean;
  onOpen?: () => void;
  onToggle?: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' && onToggle && !open) {
      event.preventDefault();
      onToggle();
      return;
    }

    if (event.key === 'ArrowLeft' && onToggle && open) {
      event.preventDefault();
      onToggle();
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && onToggle) {
      event.preventDefault();
      onToggle();
      return;
    }

    if (!onOpen || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    onOpen();
  };

  return (
    <button
      className={`tool-tree-row${matched ? ' matched' : ''}`}
      style={{ '--tree-depth': depth } as React.CSSProperties}
      type="button"
      onDoubleClick={onOpen}
      onKeyDown={handleKeyDown}
      onClick={onToggle ?? onOpen}
    >
      <ChevronDown className={`${leaf ? 'is-hidden' : ''}${!open ? ' is-collapsed' : ''}`} size={14} />
      {leaf ? <Wrench size={16} /> : <FolderCog size={16} />}
      <span>{label}</span>
    </button>
  );
}

function filterToolTree(nodes: ToolNode[], query: string): ToolNode[] {
  if (!query) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const children = node.children ? filterToolTree(node.children, query) : [];
    const matched = node.label.toLowerCase().includes(query);

    if (matched || children.length > 0) {
      return [{ ...node, children }];
    }

    return [];
  });
}

function collectNodeIds(nodes: ToolNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...collectNodeIds(node.children ?? [])]);
}

function collectParentIds(nodes: ToolNode[]): string[] {
  return nodes.flatMap((node) => (
    node.children?.length ? [node.id, ...collectParentIds(node.children)] : []
  ));
}


function ToolDetailView({
  activeTab,
  tool,
  onBack,
  onChangeTab,
}: {
  activeTab: ToolDetailTab;
  tool: AnalysisTool;
  onBack: () => void;
  onChangeTab: (tab: ToolDetailTab) => void;
}) {
  const {
    isRunning,
    layer,
    layers,
    raster,
    runBufferAnalysis,
    runExtractByMask,
    runIdwInterpolation,
    runOverlayAnalysis,
    runTerrainAnalysis,
    selectByLocation,
    selectByValue,
    toolsReady,
    vectorOverlay,
  } = useGis();
  const [idwParams, setIdwParams] = useState<IdwRunParameters>({
    layerId: defaultIdwLayerId(layers, layer),
    field: layer?.selectedField ?? '',
    outputName: 'idw-interpolation.tif',
    cellSize: '0.001',
    weight: '2',
    radius: '0',
    minPoints: '0',
  });
  const [bufferParams, setBufferParams] = useState<BufferRunParameters>({
    outputName: 'buffer',
    distance: '0.01',
    quadrantSegments: '8',
    capStyle: 'round',
    joinStyle: 'round',
    dissolve: false,
  });
  const [overlayParamsByTool, setOverlayParamsByTool] = useState<Record<OverlayToolId, OverlayRunParameters>>({
    intersect: {
      inputLayerId: defaultOverlayInputLayerId(layers, layer?.id, Boolean(vectorOverlay)),
      overlayLayerId: defaultOverlayLayerId(layers, layer?.id, Boolean(vectorOverlay)),
      outputName: 'intersect.geojson',
      snapTolerance: '',
    },
    union: {
      inputLayerId: defaultOverlayInputLayerId(layers, layer?.id, Boolean(vectorOverlay)),
      overlayLayerId: defaultOverlayLayerId(layers, layer?.id, Boolean(vectorOverlay)),
      outputName: 'union.geojson',
      snapTolerance: '',
    },
    erase: {
      inputLayerId: defaultOverlayInputLayerId(layers, layer?.id, Boolean(vectorOverlay)),
      overlayLayerId: defaultOverlayLayerId(layers, layer?.id, Boolean(vectorOverlay)),
      outputName: 'erase.geojson',
      snapTolerance: '',
    },
  });
  const [extractByMaskParams, setExtractByMaskParams] = useState<ExtractByMaskRunParameters>({
    maskLayerId: defaultMaskLayerId(layers, Boolean(vectorOverlay)),
    outputName: 'extract-by-mask.tif',
    maintainDimensions: true,
  });
  const [selectValueParams, setSelectValueParams] = useState<SelectByValueRunParameters>({
    field: layer?.fields[0] ?? '',
    operator: 'equals',
    value: '',
    caseSensitive: false,
    selectionMode: 'new',
  });
  const [selectLocationParams, setSelectLocationParams] = useState<SelectByLocationRunParameters>({
    referenceLayerId: defaultReferenceLayerId(layers, layer?.id, Boolean(vectorOverlay)),
    relation: 'intersects',
    selectionMode: 'new',
  });
  const [terrainParamsByTool, setTerrainParamsByTool] = useState<Record<TerrainToolId, TerrainRunParameters>>({
    hillshade: {
      outputName: 'hillshade.tif',
      zFactor: '1',
      altitude: '45',
      azimuth: '315',
      units: 'degrees',
    },
    slope: {
      outputName: 'slope.tif',
      zFactor: '1',
      altitude: '45',
      azimuth: '315',
      units: 'degrees',
    },
    aspect: {
      outputName: 'aspect.tif',
      zFactor: '1',
      altitude: '45',
      azimuth: '315',
      units: 'degrees',
    },
  });
  const title = toolTitles[tool];
  const terrainTool = isTerrainTool(tool) ? tool : null;
  const overlayTool = isOverlayTool(tool) ? tool : null;
  const terrainParams = terrainTool ? terrainParamsByTool[terrainTool] : terrainParamsByTool.hillshade;
  const overlayParams = overlayTool ? overlayParamsByTool[overlayTool] : overlayParamsByTool.intersect;
  const requiresWasm = tool === 'idw' || tool === 'buffer' || tool === 'extractByMask' || Boolean(terrainTool) || Boolean(overlayTool);
  const requiresLayer = tool === 'idw' || tool === 'buffer' || tool === 'selectByValue' || tool === 'selectByLocation';
  const requiresRaster = tool === 'extractByMask' || Boolean(terrainTool);
  const requiresPointLayer = tool === 'idw';
  const requiresMaskLayer = tool === 'extractByMask';
  const requiresOverlayLayers = Boolean(overlayTool);
  const hasPointLayer = isIdwLayerAvailable(layers, idwParams.layerId);
  const hasMaskLayer = isMaskLayerAvailable(layers, vectorOverlay, extractByMaskParams.maskLayerId);
  const hasOverlayLayers = isOverlayLayerAvailable(layers, vectorOverlay, overlayParams.inputLayerId)
    && isOverlayLayerAvailable(layers, vectorOverlay, overlayParams.overlayLayerId)
    && overlayParams.inputLayerId !== overlayParams.overlayLayerId;

  useEffect(() => {
    const idwLayerId = defaultIdwLayerId(layers, layer);
    setIdwParams((current) => {
      const nextLayerId = isIdwLayerAvailable(layers, current.layerId) ? current.layerId : idwLayerId;
      const selectedIdwLayer = layers.find((item) => item.id === nextLayerId) ?? null;

      return {
        ...current,
        layerId: nextLayerId,
        field: selectedIdwLayer && (!current.field || !selectedIdwLayer.numericFields.includes(current.field))
          ? selectedIdwLayer.selectedField
          : current.field,
      };
    });

    if (!layer) {
      return;
    }

    setSelectValueParams((current) => ({
      ...current,
      field: current.field && layer.fields.includes(current.field) ? current.field : layer.fields[0] ?? '',
    }));
  }, [layer, layers]);

  useEffect(() => {
    const referenceLayerId = defaultReferenceLayerId(layers, layer?.id, Boolean(vectorOverlay));

    setSelectLocationParams((current) => ({
      ...current,
      referenceLayerId: current.referenceLayerId || referenceLayerId,
    }));

    setOverlayParamsByTool((current) => {
      const next = {
        intersect: normalizeOverlayParams(current.intersect, layers, layer?.id, Boolean(vectorOverlay)),
        union: normalizeOverlayParams(current.union, layers, layer?.id, Boolean(vectorOverlay)),
        erase: normalizeOverlayParams(current.erase, layers, layer?.id, Boolean(vectorOverlay)),
      };

      return overlayToolIds.every((id) => sameOverlayParams(current[id], next[id])) ? current : next;
    });
  }, [layer?.id, layers, vectorOverlay]);

  useEffect(() => {
    const maskLayerId = defaultMaskLayerId(layers, Boolean(vectorOverlay));

    setExtractByMaskParams((current) => ({
      ...current,
      maskLayerId: isMaskLayerAvailable(layers, vectorOverlay, current.maskLayerId) ? current.maskLayerId : maskLayerId,
    }));
  }, [layers, vectorOverlay]);

  const updateIdwParam = (name: keyof IdwRunParameters, value: string) => {
    setIdwParams((current) => ({ ...current, [name]: value }));
  };
  const updateBufferParam = (name: keyof BufferRunParameters, value: string | boolean) => {
    setBufferParams((current) => ({ ...current, [name]: value }));
  };
  const updateOverlayParam = (name: keyof OverlayRunParameters, value: string) => {
    if (!overlayTool) {
      return;
    }

    setOverlayParamsByTool((current) => ({
      ...current,
      [overlayTool]: {
        ...current[overlayTool],
        [name]: value,
      },
    }));
  };
  const updateExtractByMaskParam = (name: keyof ExtractByMaskRunParameters, value: string | boolean) => {
    setExtractByMaskParams((current) => ({ ...current, [name]: value }));
  };
  const updateSelectValueParam = (name: keyof SelectByValueRunParameters, value: string | boolean) => {
    setSelectValueParams((current) => ({ ...current, [name]: value }));
  };
  const updateSelectLocationParam = (name: keyof SelectByLocationRunParameters, value: string) => {
    setSelectLocationParams((current) => ({ ...current, [name]: value }));
  };
  const updateTerrainParam = (name: keyof TerrainRunParameters, value: string) => {
    if (!terrainTool) {
      return;
    }

    setTerrainParamsByTool((current) => ({
      ...current,
      [terrainTool]: {
        ...current[terrainTool],
        [name]: value,
      },
    }));
  };
  const runActiveTool = () => {
    if (tool === 'idw') {
      void runIdwInterpolation(idwParams);
      return;
    }

    if (tool === 'buffer') {
      void runBufferAnalysis(bufferParams);
      return;
    }

    if (overlayTool) {
      void runOverlayAnalysis(overlayTool, overlayParams);
      return;
    }

    if (tool === 'extractByMask') {
      void runExtractByMask(extractByMaskParams);
      return;
    }

    if (tool === 'selectByValue') {
      void selectByValue(selectValueParams);
      return;
    }

    if (terrainTool) {
      void runTerrainAnalysis(terrainTool, terrainParams);
      return;
    }

    void selectByLocation(selectLocationParams);
  };

  return (
    <section className="tool-detail">
      <div className="tool-detail-header">
        <button type="button" title="返回工具树" aria-label="返回工具树" onClick={onBack}>
          <ArrowLeft size={19} />
        </button>
        <h3>{title}</h3>
        <button type="button" title="工具选项" aria-label="工具选项">
          <SlidersHorizontal size={18} />
        </button>
      </div>
      <div className="tool-detail-tabs" role="tablist" aria-label="反距离加权设置">
        <button
          className={activeTab === 'parameters' ? 'is-selected' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'parameters'}
          onClick={() => onChangeTab('parameters')}
        >
          参数
        </button>
        <button
          className={activeTab === 'environment' ? 'is-selected' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'environment'}
          onClick={() => onChangeTab('environment')}
        >
          环境
        </button>
      </div>
      <div className="tool-detail-body">
        {activeTab === 'parameters' && tool === 'idw' ? (
          <IdwParameters params={idwParams} onChange={updateIdwParam} />
        ) : null}
        {activeTab === 'parameters' && tool === 'buffer' ? (
          <BufferParameters params={bufferParams} onChange={updateBufferParam} />
        ) : (
          null
        )}
        {activeTab === 'parameters' && overlayTool ? (
          <OverlayParameters tool={overlayTool} params={overlayParams} onChange={updateOverlayParam} />
        ) : null}
        {activeTab === 'parameters' && tool === 'extractByMask' ? (
          <ExtractByMaskParameters params={extractByMaskParams} onChange={updateExtractByMaskParam} />
        ) : null}
        {activeTab === 'parameters' && tool === 'selectByValue' ? (
          <SelectByValueParameters params={selectValueParams} onChange={updateSelectValueParam} />
        ) : null}
        {activeTab === 'parameters' && tool === 'selectByLocation' ? (
          <SelectByLocationParameters params={selectLocationParams} onChange={updateSelectLocationParam} />
        ) : null}
        {activeTab === 'parameters' && terrainTool ? (
          <TerrainParameters tool={terrainTool} params={terrainParams} onChange={updateTerrainParam} />
        ) : null}
        {activeTab === 'environment' ? <AnalysisEnvironment /> : null}
      </div>
      <div className="tool-detail-actions">
        <button type="button">重置</button>
        <button
          className="primary"
          type="button"
          disabled={(requiresWasm && !toolsReady) || (requiresLayer && !layer) || (requiresRaster && !raster) || (requiresPointLayer && !hasPointLayer) || (requiresMaskLayer && !hasMaskLayer) || (requiresOverlayLayers && !hasOverlayLayers) || isRunning}
          onClick={runActiveTool}
        >
          <Play size={15} />
          <span>{isRunning ? '运行中' : '运行'}</span>
        </button>
      </div>
    </section>
  );
}

function IdwParameters({
  params,
  onChange,
}: {
  params: IdwRunParameters;
  onChange: (name: keyof IdwRunParameters, value: string) => void;
}) {
  const { layer, layers, setActiveLayer, setSelectedField } = useGis();
  const pointLayerOptions = layers.filter((item) => item.points.features.length > 0);
  const selectedLayer = pointLayerOptions.find((item) => item.id === params.layerId)
    ?? (layer && layer.points.features.length > 0 ? layer : null)
    ?? pointLayerOptions[0]
    ?? null;
  const fieldOptions = selectedLayer?.numericFields ?? [];

  return (
    <form className="tool-form">
      <ToolField label="输入点要素" required action="folder">
        <select
          value={selectedLayer?.id ?? ''}
          onChange={(event) => {
            const nextLayer = pointLayerOptions.find((item) => item.id === event.target.value);

            onChange('layerId', event.target.value);
            onChange('field', nextLayer?.selectedField ?? nextLayer?.numericFields[0] ?? '');

            if (nextLayer) {
              setActiveLayer(nextLayer.id);
            }
          }}
        >
          <option value="" disabled>选择点图层</option>
          {pointLayerOptions.map((item) => (
            <option key={item.id} value={item.id}>{idwLayerDisplayName(item.fileName)}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="Z 值字段" required action="settings">
        <select
          value={params.field}
          onChange={(event) => {
            onChange('field', event.target.value);
            if (selectedLayer?.id === layer?.id) {
              setSelectedField(event.target.value);
            }
          }}
        >
          <option value="" disabled>选择字段</option>
          {fieldOptions.map((field) => (
            <option key={field} value={field}>{field}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="输出栅格" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="输出像元大小">
        <input value={params.cellSize} onChange={(event) => onChange('cellSize', event.target.value)} />
      </ToolField>
      <ToolField label="幂">
        <input value={params.weight} type="number" min="0.1" step="0.1" onChange={(event) => onChange('weight', event.target.value)} />
      </ToolField>
      <ToolField label="搜索半径">
        <input value={params.radius} type="number" min="0" step="any" onChange={(event) => onChange('radius', event.target.value)} />
      </ToolField>
      <ToolField label="点数">
        <input value={params.minPoints} type="number" min="0" step="1" onChange={(event) => onChange('minPoints', event.target.value)} />
      </ToolField>
      <ToolField label="最大距离">
        <input />
      </ToolField>
      <ToolField label="输入障碍折线要素" action="folder">
        <input />
      </ToolField>
    </form>
  );
}

function BufferParameters({
  params,
  onChange,
}: {
  params: BufferRunParameters;
  onChange: (name: keyof BufferRunParameters, value: string | boolean) => void;
}) {
  const { layer } = useGis();
  const inputName = layer?.fileName ?? '';

  return (
    <form className="tool-form">
      <ToolField label="输入要素" required action="folder">
        <input value={inputName} readOnly placeholder="请先在左侧上传 Shapefile ZIP" />
      </ToolField>
      <ToolField label="输出要素" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="距离" required>
        <input value={params.distance} type="number" min="0.000001" step="any" onChange={(event) => onChange('distance', event.target.value)} />
      </ToolField>
      <ToolField label="圆弧段数">
        <input value={params.quadrantSegments} type="number" min="1" step="1" onChange={(event) => onChange('quadrantSegments', event.target.value)} />
      </ToolField>
      <ToolField label="端点样式">
        <select value={params.capStyle} onChange={(event) => onChange('capStyle', event.target.value)}>
          <option value="round">圆形</option>
          <option value="flat">平直</option>
          <option value="square">方形</option>
        </select>
      </ToolField>
      <ToolField label="连接样式">
        <select value={params.joinStyle} onChange={(event) => onChange('joinStyle', event.target.value)}>
          <option value="round">圆形</option>
          <option value="bevel">斜角</option>
          <option value="mitre">尖角</option>
        </select>
      </ToolField>
      <ToolField label="融合结果">
        <input checked={params.dissolve} type="checkbox" onChange={(event) => onChange('dissolve', event.target.checked)} />
      </ToolField>
    </form>
  );
}

function OverlayParameters({
  tool,
  params,
  onChange,
}: {
  tool: OverlayToolId;
  params: OverlayRunParameters;
  onChange: (name: keyof OverlayRunParameters, value: string) => void;
}) {
  const { layers, vectorOverlay } = useGis();
  const polygonLayers = layers.filter(isPolygonOverlaySource);
  const polygonVectorOverlay = vectorOverlay && hasPolygonOverlayFeatures(vectorOverlay.geojson.features)
    ? vectorOverlay
    : null;
  const layerOptions = [
    ...polygonLayers.map((item) => ({ id: item.id, label: displayLayerName(item.fileName) })),
    ...(vectorOverlay ? [{ id: 'vectorOverlay', label: `${displayLayerName(vectorOverlay.name)}（叠加结果）` }] : []),
  ];
  const overlayLayerOptions = layerOptions.filter((option) => option.id !== 'vectorOverlay' || Boolean(polygonVectorOverlay));
  const overlayOptions = overlayLayerOptions.filter((option) => option.id !== params.inputLayerId);

  return (
    <form className="tool-form">
      <ToolField label="输入要素" required action="folder">
        <select
          value={params.inputLayerId}
          onChange={(event) => {
            const inputLayerId = event.target.value;
            const nextOverlayLayerId = params.overlayLayerId === inputLayerId
              ? layerOptions.find((option) => option.id !== inputLayerId)?.id ?? ''
              : params.overlayLayerId;

            onChange('inputLayerId', inputLayerId);
            onChange('overlayLayerId', nextOverlayLayerId);
          }}
        >
          <option value="" disabled>选择输入图层</option>
          {overlayLayerOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="叠加要素" required action="folder">
        <select value={params.overlayLayerId} onChange={(event) => onChange('overlayLayerId', event.target.value)}>
          <option value="" disabled>选择叠加图层</option>
          {overlayOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="输出要素" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="捕捉容差">
        <input
          value={params.snapTolerance}
          type="number"
          min="0"
          step="any"
          placeholder="默认"
          onChange={(event) => onChange('snapTolerance', event.target.value)}
        />
      </ToolField>
      <ToolField label="叠加类型">
        <input value={toolTitles[tool]} readOnly />
      </ToolField>
    </form>
  );
}

function ExtractByMaskParameters({
  params,
  onChange,
}: {
  params: ExtractByMaskRunParameters;
  onChange: (name: keyof ExtractByMaskRunParameters, value: string | boolean) => void;
}) {
  const { layers, raster, vectorOverlay } = useGis();
  const inputName = raster?.name ?? '';
  const maskOptions = [
    ...layers.map((item) => ({ id: item.id, label: displayLayerName(item.fileName) })),
    ...(vectorOverlay ? [{ id: 'vectorOverlay', label: displayLayerName(vectorOverlay.name) }] : []),
  ];

  return (
    <form className="tool-form">
      <ToolField label="输入栅格" required action="folder">
        <input value={inputName} readOnly placeholder="请先添加 GeoTIFF 栅格" />
      </ToolField>
      <ToolField label="输入掩膜数据" required action="folder">
        <select value={params.maskLayerId} onChange={(event) => onChange('maskLayerId', event.target.value)}>
          <option value="" disabled>选择面图层或缓冲区结果</option>
          {maskOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="输出栅格" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="保持输入栅格尺寸">
        <input
          checked={params.maintainDimensions}
          type="checkbox"
          onChange={(event) => onChange('maintainDimensions', event.target.checked)}
        />
      </ToolField>
    </form>
  );
}

function SelectByValueParameters({
  params,
  onChange,
}: {
  params: SelectByValueRunParameters;
  onChange: (name: keyof SelectByValueRunParameters, value: string | boolean) => void;
}) {
  const { layer } = useGis();
  const fieldOptions = layer?.fields ?? [];
  const inputName = layer?.fileName ?? '';
  const valueDisabled = params.operator === 'isEmpty' || params.operator === 'isNotEmpty';

  return (
    <form className="tool-form">
      <ToolField label="输入要素" required action="folder">
        <input value={inputName} readOnly placeholder="请先在左侧上传 Shapefile ZIP 或 GeoJSON" />
      </ToolField>
      <ToolField label="属性字段" required>
        <select value={params.field} onChange={(event) => onChange('field', event.target.value)}>
          <option value="" disabled>选择字段</option>
          {fieldOptions.map((field) => (
            <option key={field} value={field}>{field}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="比较方式" required>
        <select value={params.operator} onChange={(event) => onChange('operator', event.target.value)}>
          <option value="equals">等于</option>
          <option value="notEquals">不等于</option>
          <option value="contains">包含</option>
          <option value="startsWith">开头为</option>
          <option value="endsWith">结尾为</option>
          <option value="greaterThan">大于</option>
          <option value="greaterOrEqual">大于等于</option>
          <option value="lessThan">小于</option>
          <option value="lessOrEqual">小于等于</option>
          <option value="isEmpty">为空</option>
          <option value="isNotEmpty">非空</option>
        </select>
      </ToolField>
      <ToolField label="值">
        <input
          value={params.value}
          disabled={valueDisabled}
          placeholder={valueDisabled ? '无需输入' : '输入比较值'}
          onChange={(event) => onChange('value', event.target.value)}
        />
      </ToolField>
      <ToolField label="区分大小写">
        <input
          checked={params.caseSensitive}
          type="checkbox"
          onChange={(event) => onChange('caseSensitive', event.target.checked)}
        />
      </ToolField>
      <ToolField label="选择方式">
        <select value={params.selectionMode} onChange={(event) => onChange('selectionMode', event.target.value)}>
          {selectionModeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </ToolField>
    </form>
  );
}

function SelectByLocationParameters({
  params,
  onChange,
}: {
  params: SelectByLocationRunParameters;
  onChange: (name: keyof SelectByLocationRunParameters, value: string) => void;
}) {
  const { layer, layers, vectorOverlay } = useGis();
  const inputName = layer?.fileName ?? '';
  const referenceOptions = [
    ...layers
      .filter((item) => item.id !== layer?.id)
      .map((item) => ({ id: item.id, label: displayLayerName(item.fileName) })),
    ...(vectorOverlay ? [{ id: 'vectorOverlay', label: displayLayerName(vectorOverlay.name) }] : []),
  ];

  return (
    <form className="tool-form">
      <ToolField label="目标要素" required action="folder">
        <input value={inputName} readOnly placeholder="请先在左侧上传 Shapefile ZIP 或 GeoJSON" />
      </ToolField>
      <ToolField label="参考要素" required action="folder">
        <select value={params.referenceLayerId} onChange={(event) => onChange('referenceLayerId', event.target.value)}>
          <option value="" disabled>选择参考图层</option>
          {referenceOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="空间关系" required>
        <select value={params.relation} onChange={(event) => onChange('relation', event.target.value)}>
          <option value="intersects">相交</option>
          <option value="within">位于内部</option>
          <option value="contains">包含</option>
          <option value="disjoint">不相交</option>
        </select>
      </ToolField>
      <ToolField label="选择方式">
        <select value={params.selectionMode} onChange={(event) => onChange('selectionMode', event.target.value)}>
          {selectionModeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </ToolField>
    </form>
  );
}

function TerrainParameters({
  tool,
  params,
  onChange,
}: {
  tool: TerrainToolId;
  params: TerrainRunParameters;
  onChange: (name: keyof TerrainRunParameters, value: string) => void;
}) {
  const { raster } = useGis();
  const inputName = raster?.name ?? '';

  return (
    <form className="tool-form">
      <ToolField label="输入 DEM" required action="folder">
        <input value={inputName} readOnly placeholder="请先添加 DEM GeoTIFF" />
      </ToolField>
      <ToolField label="输出栅格" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="Z 因子">
        <input value={params.zFactor} type="number" min="0.000001" step="any" onChange={(event) => onChange('zFactor', event.target.value)} />
      </ToolField>
      {tool === 'hillshade' ? (
        <>
          <ToolField label="太阳高度角">
            <input value={params.altitude} type="number" min="0" max="90" step="any" onChange={(event) => onChange('altitude', event.target.value)} />
          </ToolField>
          <ToolField label="太阳方位角">
            <input value={params.azimuth} type="number" min="0" max="360" step="any" onChange={(event) => onChange('azimuth', event.target.value)} />
          </ToolField>
        </>
      ) : null}
      {tool === 'slope' ? (
        <ToolField label="输出单位">
          <select value={params.units} onChange={(event) => onChange('units', event.target.value)}>
            <option value="degrees">degrees</option>
            <option value="radians">radians</option>
            <option value="percent">percent</option>
          </select>
        </ToolField>
      ) : null}
    </form>
  );
}

function defaultReferenceLayerId(layers: { id: string }[], activeLayerId: string | undefined, hasVectorOverlay: boolean) {
  return layers.find((item) => item.id !== activeLayerId)?.id ?? (hasVectorOverlay ? 'vectorOverlay' : '');
}

function defaultIdwLayerId(
  layers: Array<{ id: string; points: { features: unknown[] } }>,
  activeLayer: { id: string; points: { features: unknown[] } } | null,
) {
  if (activeLayer && activeLayer.points.features.length > 0) {
    return activeLayer.id;
  }

  return layers.find((item) => item.points.features.length > 0)?.id ?? '';
}

function idwLayerDisplayName(fileName: string) {
  return /\.geojson$/i.test(fileName) ? fileName : `${fileName}.geojson`;
}

function isIdwLayerAvailable(layers: Array<{ id: string; points: { features: unknown[] } }>, layerId: string) {
  return Boolean(layerId) && layers.some((item) => item.id === layerId && item.points.features.length > 0);
}

function defaultMaskLayerId(layers: { id: string }[], hasVectorOverlay: boolean) {
  return layers[0]?.id ?? (hasVectorOverlay ? 'vectorOverlay' : '');
}

function isMaskLayerAvailable(layers: { id: string }[], vectorOverlay: unknown, maskLayerId: string) {
  if (!maskLayerId) {
    return false;
  }

  return layers.some((item) => item.id === maskLayerId) || (maskLayerId === 'vectorOverlay' && Boolean(vectorOverlay));
}

function defaultOverlayInputLayerId(layers: { id: string }[], activeLayerId: string | undefined, hasVectorOverlay: boolean) {
  const polygonLayers = layers.filter(isPolygonOverlaySource);

  if (activeLayerId && polygonLayers.some((item) => item.id === activeLayerId)) {
    return activeLayerId;
  }

  return polygonLayers[0]?.id ?? (hasVectorOverlay ? 'vectorOverlay' : '');
}

function defaultOverlayLayerId(layers: { id: string }[], inputLayerId: string | undefined, hasVectorOverlay: boolean) {
  const polygonLayers = layers.filter(isPolygonOverlaySource).filter((item) => item.id !== inputLayerId);

  return polygonLayers[0]?.id ?? (hasVectorOverlay && inputLayerId !== 'vectorOverlay' ? 'vectorOverlay' : '');
}

function isOverlayLayerAvailable(layers: { id: string }[], vectorOverlay: unknown, layerId: string) {
  if (!layerId) {
    return false;
  }

  return layers.some((item) => item.id === layerId && isPolygonOverlaySource(item))
    || (layerId === 'vectorOverlay' && isPolygonOverlayVectorOverlay(vectorOverlay));
}

function normalizeOverlayParams(
  params: OverlayRunParameters,
  layers: { id: string }[],
  activeLayerId: string | undefined,
  hasVectorOverlay: boolean,
): OverlayRunParameters {
  const inputLayerId = isOverlayLayerAvailable(layers, hasVectorOverlay, params.inputLayerId)
    ? params.inputLayerId
    : defaultOverlayInputLayerId(layers, activeLayerId, hasVectorOverlay);
  const overlayLayerId = isOverlayLayerAvailable(layers, hasVectorOverlay, params.overlayLayerId) && params.overlayLayerId !== inputLayerId
    ? params.overlayLayerId
    : defaultOverlayLayerId(layers, inputLayerId, hasVectorOverlay);

  return {
    ...params,
    inputLayerId,
    overlayLayerId,
  };
}

function sameOverlayParams(left: OverlayRunParameters, right: OverlayRunParameters) {
  return left.inputLayerId === right.inputLayerId
    && left.overlayLayerId === right.overlayLayerId
    && left.outputName === right.outputName
    && left.snapTolerance === right.snapTolerance;
}

function isTerrainTool(tool: AnalysisTool): tool is TerrainToolId {
  return tool === 'hillshade' || tool === 'slope' || tool === 'aspect';
}

function isOverlayTool(tool: AnalysisTool): tool is OverlayToolId {
  return (overlayToolIds as readonly AnalysisTool[]).includes(tool);
}

function isPolygonOverlaySource(layer: { id: string; geojson?: { features: unknown[] } }) {
  return hasPolygonOverlayFeatures(layer.geojson?.features ?? []);
}

function isPolygonOverlayVectorOverlay(vectorOverlay: unknown) {
  if (!vectorOverlay || typeof vectorOverlay !== 'object' || !('geojson' in vectorOverlay)) {
    return false;
  }

  const geojson = (vectorOverlay as { geojson?: { features?: unknown[] } }).geojson;

  return hasPolygonOverlayFeatures(geojson?.features ?? []);
}

function hasPolygonOverlayFeatures(features: unknown[]) {
  return features.some(isPolygonFeature);
}

function isPolygonFeature(feature: unknown) {
  if (!feature || typeof feature !== 'object') {
    return false;
  }

  const geometry = (feature as { geometry?: { type?: unknown } }).geometry;

  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

function AnalysisEnvironment() {
  return (
    <form className="tool-form">
      <ToolField label="输出坐标系">
        <select defaultValue="map">
          <option value="map">与当前地图相同</option>
          <option value="layer">与输入图层相同</option>
        </select>
      </ToolField>
      <ToolField label="处理范围">
        <select defaultValue="default">
          <option value="default">默认</option>
          <option value="display">当前显示范围</option>
        </select>
      </ToolField>
      <ToolField label="像元大小">
        <input placeholder="使用参数设置" />
      </ToolField>
      <ToolField label="捕捉栅格" action="folder">
        <input />
      </ToolField>
      <ToolField label="并行处理因子">
        <input defaultValue="50%" />
      </ToolField>
    </form>
  );
}

function ToolField({
  label,
  required = false,
  action,
  children,
}: {
  label: string;
  required?: boolean;
  action?: 'folder' | 'settings';
  children: React.ReactNode;
}) {
  return (
    <label className="tool-field">
      <span>
        {required && <strong>*</strong>}
        {label}
      </span>
      <div className="tool-field-control">
        {children}
        {action === 'folder' && (
          <button type="button" title="浏览" aria-label={`浏览${label}`}>
            <FolderOpen size={17} />
          </button>
        )}
        {action === 'settings' && (
          <button type="button" title="设置" aria-label={`设置${label}`}>
            <Settings size={17} />
          </button>
        )}
      </div>
    </label>
  );
}

function PythonPanel() {
  return (
    <section className="python-panel">
      <div className="python-output" />
      <div className="python-input">
        <span>在此输入</span>
        <strong>Python</strong>
        <span>代码</span>
      </div>
    </section>
  );
}

function PlaceholderPanel({ params }: IDockviewPanelProps<{ title: string }>) {
  return <div className="placeholder-panel">{params.title}</div>;
}

function AiAssistantDockPanel() {
  return (
    <Suspense fallback={<div className="placeholder-panel">AI 助手</div>}>
      <AiAssistantPanel />
    </Suspense>
  );
}

function AttributeTableDockPanel(props: IDockviewPanelProps<{ layerId?: string }>) {
  return (
    <Suspense fallback={<div className="placeholder-panel">属性表</div>}>
      <AttributeTablePanel {...props} />
    </Suspense>
  );
}

function AttributeChartDockPanel(props: IDockviewPanelProps<{ layerId?: string; field?: string }>) {
  return (
    <Suspense fallback={<div className="placeholder-panel">图表</div>}>
      <AttributeChartPanel {...props} />
    </Suspense>
  );
}

function ProjectionMapDockPanel() {
  const { mapCommandState } = useMapCommands();
  const { registerProjectionMapCommands } = useDockPanelActions();
  const { identifyActive } = useMapIdentify();
  const [coords, setCoords] = useState('');
  const projectionMapRef = useRef<OpenLayersProjectionMapHandle | null>(null);

  useEffect(() => {
    if (mapCommandState.displayCrs === 'webMercator') {
      return undefined;
    }

    return registerProjectionMapCommands({
      locate: () => projectionMapRef.current?.locate(),
      resetNorth: () => projectionMapRef.current?.resetNorth(),
      zoomIn: () => projectionMapRef.current?.zoomIn(),
      zoomOut: () => projectionMapRef.current?.zoomOut(),
    });
  }, [mapCommandState.displayCrs, registerProjectionMapCommands]);

  if (mapCommandState.displayCrs === 'webMercator') {
    return (
      <section className="map-panel projection-panel-empty">
        <div className="map-status">请选择 WGS84 或 EPSG:32651 投影视图。</div>
      </section>
    );
  }

  return (
    <section className="map-panel">
      <Suspense fallback={<div className="openlayers-projection-map is-visible" />}>
        <ProjectionMap
          basemap={mapCommandState.basemap}
          displayCrs={mapCommandState.displayCrs}
          key={mapCommandState.displayCrs}
          onCoordinateChange={setCoords}
          ref={projectionMapRef}
          identifyActive={identifyActive}
          visible
        />
      </Suspense>
      <div className="map-status">{displayCrsTitle(mapCommandState.displayCrs)}</div>
      {coords ? <div className="map-readout">{coords}</div> : null}
    </section>
  );
}

function MapSurfaceDockPanel() {
  const { mapCommandState } = useMapCommands();

  if (mapCommandState.displayCrs === 'webMercator') {
    return <MapPanel />;
  }

  return <ProjectionMapDockPanel />;
}

function displayCrsTitle(displayCrs: DisplayCrsId) {
  if (displayCrs === 'epsg32651') {
    return 'EPSG:32651 / WGS 84 UTM Zone 51N';
  }

  if (displayCrs === 'wgs84') {
    return 'WGS84 / EPSG:4326';
  }

  return 'Web Mercator / EPSG:3857';
}

function MapHeaderPrefixActions({ panels }: IDockviewHeaderActionsProps) {
  const { toolsReady } = useGis();

  if (!panels.some((panel) => panel.id === 'map')) {
    return null;
  }

  return (
    <div
      className="map-header-prefix"
      title={toolsReady ? 'GeoLibre WASM 已就绪' : 'GeoLibre WASM 未就绪'}
      aria-label={toolsReady ? 'GeoLibre WASM 已就绪' : 'GeoLibre WASM 未就绪'}
    >
      <span className={`map-ready-light${toolsReady ? ' is-ready' : ' is-not-ready'}`} aria-hidden="true" />
    </div>
  );
}

const mapHeaderTools: {
  command: MapCommand;
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active?: (state: MapCommandState) => boolean;
}[] = [
  { command: 'zoomIn', title: '放大', icon: Plus },
  { command: 'zoomOut', title: '缩小', icon: Minus },
  { command: 'resetNorth', title: '复位方向', icon: RotateCcw },
  { command: 'toggleDragRotate', title: '拖拽旋转', icon: Rotate3d, active: (state) => state.dragRotateEnabled },
  { command: 'locate', title: '定位示例区域', icon: LocateFixed },
];

const mapModeOptions: {
  id: MapViewMode;
  label: string;
  title: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { id: 'planar', label: '平面', title: '平面模式', icon: Map },
  { id: 'terrain', label: '地形', title: '地形模式', icon: Mountain },
  { id: 'globe', label: '三维', title: '三维模式', icon: Earth },
];

function MapHeaderActions({ activePanel }: IDockviewHeaderActionsProps) {
  const { hasMapCommands, mapCommandState, runMapCommand, setMapMode } = useMapCommands();
  const { hasProjectionMapCommands, runProjectionMapCommand } = useDockPanelActions();
  const { layers, clearSelection } = useGis();
  const { getTableState, openAttributeChart, updateTableState } = useAttributeTable();
  const [isMapModeSwitcherOpen, setIsMapModeSwitcherOpen] = useState(false);
  const attributeLayerId = getLayerIdFromAttributeTablePanelId(activePanel?.id);
  const projectionDisplayActive = mapCommandState.displayCrs !== 'webMercator';

  if (attributeLayerId) {
    const layer = layers.find((item) => item.id === attributeLayerId) ?? null;
    const tableState = getTableState(attributeLayerId);

    return (
      <div
        className="attribute-header-actions"
        aria-label="属性表工具"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div
          className="attribute-header-title"
          title={displayLayerName(layer?.fileName ?? '') || (activePanel?.title ?? '属性表')}
        >
          <TableProperties size={15} />
          <span>{displayLayerName(layer?.fileName ?? '') || '属性表'}</span>
        </div>
        <div className="attribute-header-search">
          <Search size={14} />
          <input
            value={tableState.query}
            placeholder="搜索属性"
            aria-label="搜索属性"
            onChange={(event) => updateTableState(attributeLayerId, { query: event.target.value })}
          />
        </div>
        <button
          className={tableState.showSelectedOnly ? 'is-selected' : undefined}
          type="button"
          aria-pressed={tableState.showSelectedOnly}
          disabled={!layer}
          onClick={() => {
            updateTableState(attributeLayerId, {
              showSelectedOnly: !tableState.showSelectedOnly,
            });
          }}
        >
          已选 {layer?.selectedFeatureIndexes.length ?? 0}
        </button>
        <button
          type="button"
          title="清除选择"
          aria-label="清除选择"
          disabled={!layer || layer.selectedFeatureIndexes.length === 0}
          onClick={() => {
            if (layer) {
              clearSelection(layer.id);
            }
          }}
        >
          <X size={14} />
          <span>清除</span>
        </button>
        <button
          type="button"
          title="生成统计图"
          aria-label="生成当前属性表统计图"
          disabled={!layer || layer.fields.length === 0}
          onClick={() => {
            if (layer) {
              openAttributeChart(layer.id, displayLayerName(layer.fileName), tableState.sort?.field ?? undefined);
            }
          }}
        >
          <ChartColumn size={14} />
          <span>图表</span>
        </button>
      </div>
    );
  }

  if (activePanel?.id === 'layout') {
    return <LayoutHeaderActions />;
  }

  if (activePanel?.id !== 'map') {
    return null;
  }

  const currentMapMode = mapModeOptions.find((option) => option.id === mapCommandState.mapMode) ?? mapModeOptions[0];
  const CurrentMapModeIcon = currentMapMode.icon;

  return (
    <div className="map-header-actions" aria-label="地图工具">
      <GlobeLocateSearchButton />
      {mapHeaderTools.map((tool) => {
        const Icon = tool.icon;
        const isActive = tool.active?.(mapCommandState) ?? false;
        const isProjectionCommand = isProjectionMapCommand(tool.command);
        const isDisabled = projectionDisplayActive
          ? !hasProjectionMapCommands || !isProjectionCommand
          : !hasMapCommands;

        return (
          <Fragment key={tool.command}>
            <button
              className={isActive ? 'is-active' : undefined}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              aria-pressed={tool.active ? isActive : undefined}
              disabled={isDisabled}
              onClick={(event) => {
                event.stopPropagation();
                if (projectionDisplayActive && isProjectionMapCommand(tool.command)) {
                  runProjectionMapCommand(tool.command);
                } else {
                  runMapCommand(tool.command);
                }
              }}
            >
              <Icon size={15} strokeWidth={1.8} />
            </button>
            {tool.command === 'toggleDragRotate' ? (
              <div
                className="map-mode-switcher"
                onBlur={(event) => {
                  if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                    setIsMapModeSwitcherOpen(false);
                  }
                }}
              >
                <button
                  className={`map-tooltip-trigger${isMapModeSwitcherOpen ? ' is-active' : ''}`}
                  type="button"
                  aria-label={currentMapMode.title}
                  aria-expanded={isMapModeSwitcherOpen}
                  data-tooltip={currentMapMode.title}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsMapModeSwitcherOpen((isOpen) => !isOpen);
                  }}
                >
                  <CurrentMapModeIcon size={15} strokeWidth={1.8} />
                </button>
                {isMapModeSwitcherOpen ? (
                  <div className="map-mode-popover" role="toolbar" aria-label="地图模式切换">
                    {mapModeOptions.map((option) => {
                      const ModeIcon = option.icon;
                      const isSelected = option.id === mapCommandState.mapMode;

                      return (
                        <button
                          key={option.id}
                          className={`map-tooltip-trigger${isSelected ? ' is-selected' : ''}`}
                          type="button"
                          aria-label={option.title}
                          aria-pressed={isSelected}
                          data-tooltip={option.title}
                          onClick={(event) => {
                            event.stopPropagation();
                            setMapMode(option.id);
                            setIsMapModeSwitcherOpen(false);
                          }}
                        >
                          <ModeIcon size={15} strokeWidth={1.8} />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Fragment>
        );
      })}
      <MapLayerMenu />
    </div>
  );
}

function StatusFooter() {
  const { layer } = useGis();

  return (
    <footer className="status-bar">
      <span>1:166,420</span>
      <span>924,714.81  3,460,074.03 m</span>
      <span>点要素：{layer?.points.features.length ?? 0}</span>
      <button type="button" title="运行任务" aria-label="运行任务"><Play size={14} /></button>
    </footer>
  );
}

export default function App() {
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTab>('地图');
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState(false);
  const [isAiAssistantPanelVisible, setIsAiAssistantPanelVisible] = useState(false);
  const [attributeTableStateByLayerId, setAttributeTableStateByLayerId] = useState<Record<string, AttributeTableState>>({});
  const dockviewApiRef = useRef<DockviewApi | null>(null);
  const aiAssistantPanelRef = useRef<IDockviewPanel | null>(null);
  const projectionMapCommandsRef = useRef<ProjectionMapCommands | null>(null);
  const [hasProjectionMapCommands, setHasProjectionMapCommands] = useState(false);

  const components = useMemo(
    () => ({
      aiAssistant: AiAssistantDockPanel,
      attributeChart: AttributeChartDockPanel,
      attributeTable: AttributeTableDockPanel,
      contents: EmbeddedContentsPanel,
      layout: LayoutPanel,
      map: MapSurfaceDockPanel,
      inspector: InspectorPanel,
      python: PythonPanel,
      placeholder: PlaceholderPanel,
    }),
    [],
  );

  const changeRibbonTab = useCallback((tab: RibbonTab) => {
    setActiveRibbonTab(tab);
  }, []);

  const registerProjectionMapCommands = useCallback((commands: ProjectionMapCommands) => {
    projectionMapCommandsRef.current = commands;
    setHasProjectionMapCommands(true);

    return () => {
      if (projectionMapCommandsRef.current === commands) {
        projectionMapCommandsRef.current = null;
        setHasProjectionMapCommands(false);
      }
    };
  }, []);

  const runProjectionMapCommand = useCallback((command: ProjectionMapCommand) => {
    projectionMapCommandsRef.current?.[command]();
  }, []);

  const dockPanelActions = useMemo(
    () => ({
      hasProjectionMapCommands,
      registerProjectionMapCommands,
      runProjectionMapCommand,
    }),
    [hasProjectionMapCommands, registerProjectionMapCommands, runProjectionMapCommand],
  );

  const addAiAssistantPanel = useCallback((api: DockviewApi) => {
    const existingPanel = api.getPanel(aiAssistantPanelId);

    if (existingPanel) {
      aiAssistantPanelRef.current = existingPanel;
      existingPanel.api.setActive();
      setIsAiAssistantPanelVisible(true);
      return existingPanel;
    }

    const panel = api.addPanel({
      id: aiAssistantPanelId,
      component: 'aiAssistant',
      title: 'AI 助手',
      floating: {
        x: 74,
        y: 74,
        width: 460,
        height: 520,
      },
      minimumWidth: 340,
      minimumHeight: 320,
    });
    aiAssistantPanelRef.current = panel;
    setIsAiAssistantPanelVisible(true);
    return panel;
  }, []);

  const toggleAiAssistantPanel = useCallback(() => {
    const api = dockviewApiRef.current;

    if (!api) {
      setIsAiAssistantPanelVisible((visible) => !visible);
      return;
    }

    const panel = api.getPanel(aiAssistantPanelId);

    if (panel) {
      panel.api.close();
      aiAssistantPanelRef.current = null;
      setIsAiAssistantPanelVisible(false);
      return;
    }

    addAiAssistantPanel(api);
  }, [addAiAssistantPanel]);

  const getTableState = useCallback((layerId: string | null | undefined) => {
    if (!layerId) {
      return defaultAttributeTableState;
    }

    return attributeTableStateByLayerId[layerId] ?? defaultAttributeTableState;
  }, [attributeTableStateByLayerId]);

  const updateTableState = useCallback((layerId: string, patch: Partial<AttributeTableState>) => {
    setAttributeTableStateByLayerId((current) => ({
      ...current,
      [layerId]: {
        ...(current[layerId] ?? defaultAttributeTableState),
        ...patch,
      },
    }));
  }, []);

  const openAttributeChart = useCallback((layerId: string, layerName?: string, field?: string) => {
    const api = dockviewApiRef.current;

    if (!api) {
      return;
    }

    const title = getAttributeChartTitle(layerName);
    const panelId = getAttributeChartPanelId(layerId);
    const existingPanel = api.getPanel(panelId);
    const params = { layerId, field };

    if (existingPanel) {
      existingPanel.api.updateParameters(params);
      existingPanel.api.setTitle(title);
      existingPanel.api.setActive();
      return;
    }

    const attributeTablePanel = api.getPanel(getAttributeTablePanelId(layerId));
    const pythonPanel = api.getPanel('python');
    const referencePanel = attributeTablePanel ?? pythonPanel;

    api.addPanel({
      id: panelId,
      component: 'attributeChart',
      title,
      params,
      position: referencePanel ? {
        direction: 'within',
        referencePanel,
        index: referencePanel.group.panels.length,
      } : undefined,
      minimumHeight: 96,
    }).api.setActive();
  }, []);

  const openAttributeTable = useCallback((layerId: string, layerName?: string) => {
    const api = dockviewApiRef.current;

    if (!api) {
      return;
    }

    const title = getAttributeTableTitle(layerName);
    const panelId = getAttributeTablePanelId(layerId);
    const existingPanel = api.getPanel(panelId);

    if (existingPanel) {
      existingPanel.api.setTitle(title);
      existingPanel.api.setActive();
      return;
    }

    const pythonPanel = api.getPanel('python');

    api.addPanel({
      id: panelId,
      component: 'attributeTable',
      title,
      params: { layerId },
      position: pythonPanel ? {
        direction: 'within',
        referencePanel: pythonPanel,
        index: pythonPanel.group.panels.length,
      } : undefined,
      minimumHeight: 96,
    }).api.setActive();
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    dockviewApiRef.current = event.api;
    event.api.onDidRemovePanel((panel) => {
      if (panel.id === aiAssistantPanelId) {
        aiAssistantPanelRef.current = null;
        setIsAiAssistantPanelVisible(false);
      }
    });

    const contents = event.api.addPanel({
      id: 'contents',
      component: 'contents',
      title: '内容',
      initialWidth: dockColumnWidths.contents,
      minimumWidth: 180,
      minimumHeight: 120,
    });

    const map = event.api.addPanel({
      id: 'map',
      component: 'map',
      title: '地图',
      position: { direction: 'right', referencePanel: contents },
      initialWidth: dockColumnWidths.map,
      minimumWidth: 280,
      minimumHeight: 180,
    });


    event.api.addPanel({
      id: 'layout',
      component: 'layout',
      title: '布局',
      inactive: true,
      position: { direction: 'within', referencePanel: map, index: 2 },
      minimumWidth: 280,
      minimumHeight: 180,
    });

    const inspector = event.api.addPanel({
      id: 'inspector',
      component: 'inspector',
      title: '统计数据',
      position: { direction: 'right', referencePanel: map },
      initialWidth: dockColumnWidths.inspector,
      minimumWidth: 180,
      minimumHeight: 120,
    });

    event.api.addPanel({
      id: 'python',
      component: 'python',
      title: 'Python',
      position: { direction: 'below', referencePanel: map },
      initialHeight: 180,
      minimumWidth: 200,
      minimumHeight: 72,
    });

    const applyDefaultColumnRatio = () => {
      const width = event.api.width;

      if (!width) {
        return;
      }

      contents.api.group.api.setSize({
        width: Math.round(width * dockColumnRatio.contents),
      });
      inspector.api.group.api.setSize({
        width: Math.round(width * dockColumnRatio.inspector),
      });
      map.api.group.api.setSize({
        width: Math.round(width * dockColumnRatio.map),
      });
    };

    requestAnimationFrame(() => {
      applyDefaultColumnRatio();
      requestAnimationFrame(applyDefaultColumnRatio);
    });

  }, []);

  return (
    <GisProvider>
      <MapViewportProvider>
        <MapCommandProvider>
          <MapBasemapSelectionProvider>
            <MapSelectionProvider>
            <MapIdentifyProvider>
            <DigitizeProvider>
              <AttributeTableProvider value={{ getTableState, openAttributeChart, openAttributeTable, updateTableState }}>
                <LayoutProvider>
                <DockPanelActionsContext.Provider value={dockPanelActions}>
                  <div className={`app-shell${isRibbonCollapsed ? ' ribbon-is-collapsed' : ''}`}>
                <QuickAccessBar
                  isAiAssistantPanelVisible={isAiAssistantPanelVisible}
                  isRibbonCollapsed={isRibbonCollapsed}
                  onToggleAiAssistantPanel={toggleAiAssistantPanel}
                  onToggleRibbon={() => setIsRibbonCollapsed((value) => !value)}
                />
                <Ribbon
                  activeTab={activeRibbonTab}
                  collapsed={isRibbonCollapsed}
                  onChangeTab={changeRibbonTab}
                />
                <main className="workspace">
                  <DockviewReact
                    className="dockview-theme-light cte-dockview"
                    components={components}
                    disableTabsOverflowList={false}
                    floatingGroupBounds="boundedWithinViewport"
                    onReady={onReady}
                    prefixHeaderActionsComponent={MapHeaderPrefixActions}
                    rightHeaderActionsComponent={MapHeaderActions}
                  />
                </main>
                <StatusFooter />
                  </div>
                </DockPanelActionsContext.Provider>
                </LayoutProvider>
              </AttributeTableProvider>
            </DigitizeProvider>
            </MapIdentifyProvider>
            </MapSelectionProvider>
          </MapBasemapSelectionProvider>
        </MapCommandProvider>
      </MapViewportProvider>
    </GisProvider>
  );
}
