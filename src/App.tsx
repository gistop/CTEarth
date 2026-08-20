import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react';
import {
  ArrowLeft,
  Bell,
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  Database,
  Download,
  FolderCog,
  FolderOpen,
  Grid2X2,
  HelpCircle,
  History,
  Layers,
  Map,
  MousePointer2,
  PanelLeft,
  Pause,
  PenTool,
  Play,
  Plus,
  Redo2,
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
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MapPanel } from './components/MapPanel';
import { ContentsPanel as EmbeddedContentsPanel } from './components/contents/ContentsPanel';
import {
  GisProvider,
  type BufferParameters as BufferRunParameters,
  type IdwParameters as IdwRunParameters,
  useGis,
} from './gisStore';

type RibbonTool = {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  muted?: boolean;
};

const quickTools = [
  { title: '保存', icon: Save },
  { title: '打开工程', icon: FolderOpen },
  { title: '撤销', icon: Undo2 },
  { title: '重做', icon: Redo2 },
  { title: '放大', icon: ZoomIn, active: true },
  { title: '缩小', icon: ZoomOut },
];

const ribbonTabs = ['工程', '地图', '插入', '分析', '视图', '编辑', '影像', '共享', '帮助'];

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

const ribbonGroups: { title: string; tools: RibbonTool[] }[] = [
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
    title: '标注',
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
  onToggleRibbon,
}: {
  isRibbonCollapsed: boolean;
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
  collapsed,
}: {
  collapsed: boolean;
}) {
  return (
    <section className="ribbon" aria-label="功能区">
      <nav className="ribbon-tabs" aria-label="菜单">
        <div className="ribbon-tab-list">
          {ribbonTabs.map((tab) => (
            <button key={tab} className={tab === '地图' ? 'is-selected' : ''} type="button">
              {tab}
            </button>
          ))}
        </div>
      </nav>
      <div className="ribbon-strip" aria-hidden={collapsed}>
        {ribbonGroups.map((group) => (
          <div className="ribbon-group" key={group.title}>
            <div className="ribbon-tools">
              {group.tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button className={tool.muted ? 'is-muted' : ''} key={tool.label} type="button">
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
  const { layer, message, uploadGeoJson, uploadShapefileZip } = useGis();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (/\.geojson$/i.test(file.name) || /\.json$/i.test(file.name)) {
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
        <button type="button" title="上传 Shapefile ZIP 或 GeoJSON" aria-label="上传 Shapefile ZIP 或 GeoJSON" onClick={() => fileInputRef.current?.click()}>
          <Upload size={18} />
        </button>
        <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".zip,.geojson,.json" onChange={handleFileChange} />
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
              <input type="checkbox" defaultChecked aria-label={`${layer.fileName} 图层`} />
              <span className="layer-swatch point" />
              <span>{layer.fileName}</span>
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

type InspectorTabId = 'statistics' | 'mask' | 'annotation' | 'tools';
type ToolView = 'tree' | 'detail';
type ToolDetailTab = 'parameters' | 'environment';
type AnalysisTool = 'idw' | 'buffer';
type ToolNode = {
  id: string;
  label: string;
  children?: ToolNode[];
  tool?: AnalysisTool;
};

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
  return (
    <>
      <div className="inspector-toolbar">
        <button className="is-selected" type="button" title="符号系统" aria-label="符号系统"><PenTool size={20} /></button>
        <button type="button" title="属性" aria-label="属性"><PanelLeft size={20} /></button>
        <button type="button" title="更多" aria-label="更多"><Settings size={20} /></button>
      </div>
      <h3>主符号系统</h3>
      <label>
        渲染方式
        <select defaultValue="stretch">
          <option value="stretch">拉伸</option>
          <option value="classified">分类</option>
          <option value="rgb">RGB 合成</option>
        </select>
      </label>
      <label>
        波段
        <select defaultValue="band1">
          <option value="band1">Band_1</option>
        </select>
      </label>
      <label>
        配色方案
        <div className="ramp-control">
          <span />
          <ChevronDown size={16} />
        </div>
      </label>
      <label className="inline-check">
        <input type="checkbox" />
        反向
      </label>
      <div className="form-grid">
        <span>值</span>
        <input defaultValue="0" />
        <input defaultValue="254" />
        <span>标注</span>
        <input defaultValue="0" />
        <input defaultValue="254" />
      </div>
      <label>
        拉伸类型
        <select defaultValue="std">
          <option value="std">标准差</option>
          <option value="minmax">最小值-最大值</option>
        </select>
      </label>
      <label>
        标准差数量
        <input defaultValue="8" />
      </label>
      <label>
        Gamma
        <input defaultValue="2.0" />
      </label>
      <label>
        锐化
        <input defaultValue="0" />
      </label>
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
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set(['general', 'general-interpolation', 'general-proximity', 'industry']));
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
        selected={Boolean(node.tool)}
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
  selected = false,
  matched = false,
  onOpen,
  onToggle,
}: {
  depth: number;
  label: string;
  open?: boolean;
  leaf?: boolean;
  selected?: boolean;
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
      className={`tool-tree-row${selected ? ' selected' : ''}${matched ? ' matched' : ''}`}
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
  const { isRunning, layer, runBufferAnalysis, runIdwInterpolation, toolsReady } = useGis();
  const [idwParams, setIdwParams] = useState<IdwRunParameters>({
    field: layer?.selectedField ?? '',
    outputName: 'idw-interpolation.tif',
    cellSize: '0.001',
    weight: '2',
    radius: '0',
    minPoints: '0',
  });
  const [bufferParams, setBufferParams] = useState<BufferRunParameters>({
    outputName: 'buffer.geojson',
    distance: '0.01',
    quadrantSegments: '8',
    capStyle: 'round',
    joinStyle: 'round',
    dissolve: false,
  });
  const title = tool === 'idw' ? '反距离加权' : '缓冲区';

  useEffect(() => {
    if (!layer) {
      return;
    }

    setIdwParams((current) => ({
      ...current,
      field: current.field || layer.selectedField,
    }));
  }, [layer]);

  const updateIdwParam = (name: keyof IdwRunParameters, value: string) => {
    setIdwParams((current) => ({ ...current, [name]: value }));
  };
  const updateBufferParam = (name: keyof BufferRunParameters, value: string | boolean) => {
    setBufferParams((current) => ({ ...current, [name]: value }));
  };
  const runActiveTool = () => {
    if (tool === 'idw') {
      void runIdwInterpolation(idwParams);
      return;
    }

    void runBufferAnalysis(bufferParams);
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
        {activeTab === 'environment' ? <AnalysisEnvironment /> : null}
      </div>
      <div className="tool-detail-actions">
        <button type="button">重置</button>
        <button
          className="primary"
          type="button"
          disabled={!toolsReady || !layer || isRunning}
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
  const { layer, setSelectedField } = useGis();
  const fieldOptions = layer?.numericFields ?? [];
  const inputName = layer?.fileName ?? '';

  return (
    <form className="tool-form">
      <ToolField label="输入点要素" required action="folder">
        <input value={inputName} readOnly placeholder="请先在左侧上传 Shapefile ZIP" />
      </ToolField>
      <ToolField label="Z 值字段" required action="settings">
        <select
          value={params.field}
          onChange={(event) => {
            onChange('field', event.target.value);
            setSelectedField(event.target.value);
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
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState(false);

  const components = useMemo(
    () => ({
      contents: EmbeddedContentsPanel,
      map: MapPanel,
      inspector: InspectorPanel,
      python: PythonPanel,
      placeholder: PlaceholderPanel,
    }),
    [],
  );

  const onReady = useCallback((event: DockviewReadyEvent) => {
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

    const inspector = event.api.addPanel({
      id: 'inspector',
      component: 'inspector',
      title: '符号系统 - hill.tif',
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
      <div className={`app-shell${isRibbonCollapsed ? ' ribbon-is-collapsed' : ''}`}>
        <QuickAccessBar
          isRibbonCollapsed={isRibbonCollapsed}
          onToggleRibbon={() => setIsRibbonCollapsed((value) => !value)}
        />
        <Ribbon
          collapsed={isRibbonCollapsed}
        />
        <main className="workspace">
          <DockviewReact
            className="dockview-theme-light cte-dockview"
            components={components}
            onReady={onReady}
            disableFloatingGroups
          />
        </main>
        <StatusFooter />
      </div>
    </GisProvider>
  );
}
