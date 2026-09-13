import { Fragment, lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type IDockviewHeaderActionsProps,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type IDockviewPanel,
} from 'dockview-react';
import {
  Bell,
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  Database,
  Download,
  Earth,
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
  Tags,
  Wrench,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CoordinateSystemControls as MapCoordinateSystemControls,
  GlobeLocateSearchButton,
  MapLayerMenu,
  MapMeasureButton,
  MapTerrainDiagnosticsButton,
  MapMeasureProvider,
  MapPanel,
  MapViewportFrame,
  MapSunlightButton,
  MapSunlightProvider,
  MapBasemapSelectionProvider,
} from './features/maps';
import { AttributeFieldsHeader, AttributeFieldsPanel, AttributeTableHeader, AttributeTablePanel, useAttributeFieldRibbonGroups } from './features/attributes';
import type { AttributeFieldRibbonGroup } from './features/attributes';
import { ChartPanel } from './features/charts';
import { DataViewWorkspaceProvider } from './components/workspace/DataViewWorkspaceProvider';
import { getAttributeFieldsLayerId, openAttributeFieldsPanel } from './components/workspace/attributeFieldsDock';
import { ContentsPanel as EmbeddedContentsPanel } from './components/contents/ContentsPanel';
import {
  DigitizeProvider,
  useDigitizeRibbonGroups,
} from './features/digitize';
import {
  MapCommandProvider,
  type DisplayCrsId,
  type MapCommand,
  type MapCommandState,
  type MapViewMode,
  useMapCommands,
} from './features/maps';
import { MapIdentifyProvider, useMapIdentify } from './features/maps';
import { MapSelectionProvider, useMapSelection } from './features/maps';
import { MapViewportProvider } from './features/maps';
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
} from './features/layout';
import {
  GisProvider,
  displayLayerName,
  useGis,
} from './gisStore';
import { defaultToolboxCatalog, ToolboxPanel } from './features/toolbox';

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

const ribbonTabs = ['工程', '地图', '布局', '分析', '编辑', '共享', '帮助'] as const;
type RibbonTab = typeof ribbonTabs[number];
const editRibbonTab = '编辑';
const fieldRibbonTab = '字段';

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
  import('./features/ai').then((module) => ({ default: module.AiAssistantPanel }))
));
const ProjectionMap = lazy(() => (
  import('./features/maps/components/map/OpenLayersProjectionMap').then((module) => ({ default: module.OpenLayersProjectionMap }))
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
  fieldContextVisible,
  fieldContextSelected,
  fieldDatasetId,
  onChangeTab,
  onSelectFieldContext,
}: {
  activeTab: RibbonTab;
  collapsed: boolean;
  fieldContextVisible: boolean;
  fieldContextSelected: boolean;
  fieldDatasetId: string | null;
  onChangeTab: (tab: RibbonTab) => void;
  onSelectFieldContext: () => void;
}) {
  const fieldGroups = useAttributeFieldRibbonGroups(fieldContextVisible ? fieldDatasetId : null);
  const editGroups = useDigitizeRibbonGroups(activeTab === editRibbonTab);
  const { clearSelection, layers } = useGis();
  const { identifyActive, setIdentifyActive, toggleIdentifyActive } = useMapIdentify();
  const { selectionActive, setSelectionActive, toggleSelectionActive } = useMapSelection();
  const activeGroups: RibbonGroup[] = fieldContextSelected
    ? fieldGroups.map((group: AttributeFieldRibbonGroup) => group)
    : activeTab === editRibbonTab
    ? editGroups
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
    <section className={`ribbon${activeTab === ribbonTabs[2] ? ' layout-ribbon' : ''}${fieldContextVisible ? ' field-context-ribbon' : ''}`} aria-label="功能区">
      <nav className="ribbon-tabs" aria-label="菜单">
        <div className="ribbon-tab-list">
          {ribbonTabs.map((tab) => (
            <button
              key={tab}
              className={tab === activeTab ? 'is-selected' : ''}
              type="button"
              onClick={() => {
                onChangeTab(tab);
              }}
            >
              {tab}
            </button>
          ))}
          {fieldContextVisible ? (
            <button
              className={`ribbon-context-tab${fieldContextSelected ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={fieldContextSelected}
              onClick={onSelectFieldContext}
            >
              {fieldRibbonTab}
            </button>
          ) : null}
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

type InspectorTabId = 'statistics' | 'mask' | 'annotation' | 'toolbox';

const inspectorTabs: {
  id: InspectorTabId;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { id: 'statistics', label: '统计数据', icon: Database },
  { id: 'mask', label: '掩膜', icon: SquareDashedMousePointer },
  { id: 'annotation', label: '高级标注', icon: Tags },
  { id: 'toolbox', label: '工具箱', icon: Wrench },
];

function InspectorPanel() {
  const [activeTab, setActiveTab] = useState<InspectorTabId>('statistics');

  return (
    <aside className="panel-shell inspector-panel">
      <div className="inspector-content">
        {activeTab === 'statistics' && <section className="inspector-scroll-area"><StatisticsTab /></section>}
        {activeTab === 'mask' && <div className="inspector-scroll-area"><MaskTab /></div>}
        {activeTab === 'annotation' && <div className="inspector-scroll-area"><AnnotationTab /></div>}
        {activeTab === 'toolbox' && <ToolboxPanel catalog={defaultToolboxCatalog} />}
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
<AttributeTablePanel datasetId={props.params.layerId} />
    </Suspense>
  );
}

function AttributeFieldsDockPanel(props: IDockviewPanelProps<{ layerId?: string }>) {
  return (
    <Suspense fallback={<div className="placeholder-panel">字段</div>}>
      <AttributeFieldsPanel datasetId={props.params.layerId} />
    </Suspense>
  );
}

function AttributeChartDockPanel(props: IDockviewPanelProps<{ layerId?: string; field?: string }>) {
  return (
    <Suspense fallback={<div className="placeholder-panel">图表</div>}>
<ChartPanel datasetId={props.params.layerId} preferredField={props.params.field} />
    </Suspense>
  );
}

function ProjectionMapDockPanel() {
  const { mapCommandState } = useMapCommands();
  const { identifyActive } = useMapIdentify();
  const [coords, setCoords] = useState('');

  if (mapCommandState.displayCrs === 'webMercator') {
    return (
      <MapViewportFrame status="请选择 WGS84 或 EPSG:32651 投影视图。" className="projection-panel-empty">
        <div />
      </MapViewportFrame>
    );
  }

  return (
    <MapViewportFrame status={displayCrsTitle(mapCommandState.displayCrs)} readout={coords}>
      <Suspense fallback={<div className="openlayers-projection-map is-visible" />}>
        <ProjectionMap
          basemap={mapCommandState.basemap}
          displayCrs={mapCommandState.displayCrs}
          key={mapCommandState.displayCrs}
          onCoordinateChange={setCoords}
          identifyActive={identifyActive}
          visible
        />
      </Suspense>
    </MapViewportFrame>
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
  const { canRunMapCommand, hasMapCommands, mapCommandState, runMapCommand, setMapMode } = useMapCommands();
  const [isMapModeSwitcherOpen, setIsMapModeSwitcherOpen] = useState(false);
  const attributeLayerId = getLayerIdFromAttributeTablePanelId(activePanel?.id);
  const fieldsLayerId = getAttributeFieldsLayerId(activePanel?.id);

  if (attributeLayerId) return <AttributeTableHeader datasetId={attributeLayerId} />;
  if (fieldsLayerId) return <AttributeFieldsHeader datasetId={fieldsLayerId} />;

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
        const isDisabled = !hasMapCommands || !canRunMapCommand(tool.command);

        return (
          <Fragment key={tool.command}>
            {tool.command === 'resetNorth' ? (
              <>
                <MapTerrainDiagnosticsButton />
                <MapMeasureButton />
                <MapSunlightButton />
              </>
            ) : null}
            <button
              className={isActive ? 'is-active' : undefined}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              aria-pressed={tool.active ? isActive : undefined}
              disabled={isDisabled}
              onClick={(event) => {
                event.stopPropagation();
                runMapCommand(tool.command);
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
  const [activeDockPanelId, setActiveDockPanelId] = useState<string | null>(null);
  const [fieldContextSelected, setFieldContextSelected] = useState(false);
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState(false);
  const [isAiAssistantPanelVisible, setIsAiAssistantPanelVisible] = useState(false);
  const dockviewApiRef = useRef<DockviewApi | null>(null);
  const aiAssistantPanelRef = useRef<IDockviewPanel | null>(null);

  const components = useMemo(
    () => ({
      aiAssistant: AiAssistantDockPanel,
      attributeChart: AttributeChartDockPanel,
      attributeTable: AttributeTableDockPanel,
      attributeFields: AttributeFieldsDockPanel,
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
    setFieldContextSelected(false);
  }, []);

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

  const openAttributeFields = useCallback((layerId: string, layerName?: string) => {
    const api = dockviewApiRef.current;
    if (api) openAttributeFieldsPanel(api, layerId, layerName);
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
    setActiveDockPanelId(event.api.activePanel?.id ?? null);
    event.api.onDidActivePanelChange(({ panel }) => {
      setActiveDockPanelId(panel?.id ?? null);
      setFieldContextSelected(Boolean(getAttributeFieldsLayerId(panel?.id)));
    });
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
            <MapSunlightProvider>
            <MapMeasureProvider>
            <MapSelectionProvider>
            <MapIdentifyProvider>
            <DigitizeProvider>
<DataViewWorkspaceProvider onOpenTable={openAttributeTable} onOpenChart={openAttributeChart} onOpenFields={openAttributeFields}>
                <LayoutProvider>
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
                  fieldContextVisible={Boolean(getAttributeFieldsLayerId(activeDockPanelId ?? undefined))}
                  fieldContextSelected={fieldContextSelected}
                  fieldDatasetId={getAttributeFieldsLayerId(activeDockPanelId ?? undefined)}
                  onChangeTab={changeRibbonTab}
                  onSelectFieldContext={() => setFieldContextSelected(true)}
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
                </LayoutProvider>
</DataViewWorkspaceProvider>
            </DigitizeProvider>
            </MapIdentifyProvider>
            </MapSelectionProvider>
            </MapMeasureProvider>
            </MapSunlightProvider>
          </MapBasemapSelectionProvider>
        </MapCommandProvider>
      </MapViewportProvider>
    </GisProvider>
  );
}
