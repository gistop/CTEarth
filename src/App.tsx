import { useCallback, useMemo, useState } from 'react';
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react';
import {
  Bell,
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  Database,
  Download,
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
  Sparkles,
  SquareDashedMousePointer,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MapPanel } from './components/MapPanel';

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
      </div>
      <section className="layer-tree">
        <h3>绘制顺序</h3>
        <div className="tree-row root">
          <input type="checkbox" defaultChecked aria-label="地图" />
          <Map size={16} />
          <span>地图</span>
        </div>
        <div className="tree-row">
          <input type="checkbox" defaultChecked aria-label="DEM 图层" />
          <span className="layer-swatch terrain" />
          <span>ASTGTMV003_N31E121_dem.tif</span>
        </div>
        <div className="legend-block">
          <span>值</span>
          <div className="legend-gradient color" />
          <div className="legend-scale"><span>90</span><span>0</span></div>
        </div>
        <div className="tree-row selected">
          <input type="checkbox" defaultChecked aria-label="Hillshade 图层" />
          <span className="layer-swatch mono" />
          <span>hill.tif</span>
        </div>
        <div className="legend-block">
          <span>值</span>
          <div className="legend-gradient mono" />
          <div className="legend-scale"><span>254</span><span>0</span></div>
        </div>
      </section>
    </aside>
  );
}

function InspectorPanel() {
  return (
    <aside className="panel-shell inspector-panel">
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
      <div className="inspector-tabs">
        <button className="is-selected" type="button">统计数据</button>
        <button type="button">掩膜</button>
        <button type="button">高级标注</button>
      </div>
    </aside>
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

export default function App() {
  const [isRibbonCollapsed, setIsRibbonCollapsed] = useState(false);

  const components = useMemo(
    () => ({
      contents: ContentsPanel,
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
      <footer className="status-bar">
        <span>1:166,420</span>
        <span>924,714.81  3,460,074.03 m</span>
        <span>所选要素：0</span>
        <button type="button" title="运行任务" aria-label="运行任务"><Play size={14} /></button>
      </footer>
    </div>
  );
}
