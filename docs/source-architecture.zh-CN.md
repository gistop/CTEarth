# 前端源码架构说明

本文说明 `src` 目录的职责划分、命名约定和模块依赖方向。新增代码应优先遵循本文；现有旧目录采用渐进式迁移，不要求一次性移动所有文件。

## 1. 总体原则

项目采用以下组合方式：

```text
响应式状态管理 + 单向数据流 + 地图引擎适配层
```

基本数据流：

```text
用户操作
  ↓
视图组件提交意图
  ↓
Feature Store / Action
  ↓
统一状态
  ├─ 其他视图组件
  ├─ 地图引擎适配器
  ├─ 属性表和分析工具
  └─ 持久化服务
```

视图组件不应直接操作 MapLibre、Cesium 或 OpenLayers 的实例。地图实例的增删图层、显隐、顺序和样式同步由对应的适配层负责。

## 2. `src` 顶层目录

```text
src/
├─ App.tsx                 # 应用入口、工作区和全局面板编排
├─ main.tsx                # React 挂载入口
├─ components/             # 跨业务的共享视图组件和历史组件目录
├─ features/               # 按业务领域组织的完整功能模块
├─ shared/                 # 不依赖具体业务模块的共享契约、服务与基础状态
├─ services/               # 跨模块的基础服务（新增代码优先放入对应 feature）
├─ stores/                 # 跨模块共享状态（新增业务状态优先放入对应 feature）
├─ types/                  # 跨模块共享类型
├─ adapters/               # 跨业务的外部引擎适配器
└─ *.ts / *.tsx            # 暂未迁移的历史入口或全局基础代码
```

### `components/`

放通用视图组件、应用壳组件以及暂未迁移的历史组件。这里的组件应主要负责展示和交互，不承载完整业务规则。

适合放置：

- 通用按钮、弹窗、表单控件
- 工作区布局、面板、工具栏
- 可被多个业务复用的展示组件

功能模块及其专属 UI 组件应放在同一 Feature 模块内。

只有跨多个功能模块复用、且与具体业务无关的通用组件，才放入 `src/components` 或 `src/shared`。

`components/workspace/` 是应用外壳的跨模块组合位置。例如 `DataViewWorkspaceProvider` 将既有 GIS 数据接入共享数据视图，再连接独立的属性表和图表模块；它不实现筛选、排序或统计规则。

### `features/`

放完整业务模块。一个业务模块可以同时包含视图、状态、服务、类型和外部引擎适配器。

```text
src/features/<feature-name>/
├─ components/              # 该业务的视图组件
├─ stores/                  # 该业务的响应式状态
├─ services/                # 该业务的数据和业务服务
├─ adapters/                # 该业务与外部引擎的适配
├─ types.ts                 # 该业务的领域类型
└─ index.ts                 # 对外公开的稳定入口
```

当前地图显示与视图控制模块位于 `src/features/maps/`：

```text
src/features/maps/
├─ components/               # 地图工作区、投影视图和共享地图 UI
├─ services/                 # 视口范围、坐标检索等纯业务服务
└─ index.ts                  # 地图模块公开入口
```

MapLibre、OpenLayers 和 Cesium 的实例生命周期只允许在地图运行时组件中处理；图层同步仍统一委托给 `src/features/layers/adapters/`。

AI 助手模块位于 `src/features/ai/`，入口为该模块的 `index.ts`。界面、会话状态、模型协议、GIS 上下文与工具执行分层；GIS 业务模块不依赖具体模型。当前实现浏览器直连，后端代理仅占位。职责、扩展方式和限制参见 [AI 助手模块](./ai-assistant.zh-CN.md)。

地图布局与制图模块位于 `src/features/layout/`。独立文档 store、纯布局命令与几何服务、UI 手势、OpenLayers 运行时、页面导出和浏览器下载分层；常规界面和未来外部工具复用同一组命令，不依赖特定模型。旧 `src/components/layout/` 已删除，不保留兼容转发。布局地图的引擎生命周期集中在 `adapters/openLayersLayoutMapAdapter.ts`，React 组件仅负责连接。详见 [地图布局与制图模块](./layout.zh-CN.md)。

数字化编辑模块位于 `src/features/digitize/`。工具状态、编辑会话与校验、公共边几何算法、数据提交端口、OpenLayers 交互和 Ribbon 界面分层。业务服务不依赖 React、地图实例或模型协议；GIS 适配器复用既有数据更新入口，不另建权威数据仓库。编辑引擎按需加载，其生命周期由 `adapters/openLayersDigitizeAdapter.ts` 管理。旧 `src/components/digitize/` 已删除，`App.tsx` 不再承载编辑工具业务。详见 [数字化编辑模块](./digitize.zh-CN.md)。

属性表和图表现在是两个独立 Feature：`src/features/attributes/` 管理表格、排序和行选择交互，`src/features/charts/` 管理图表配置、统计模型和 ECharts 适配。两者不导入对方实现，也不直接依赖 GIS Store 或 Dockview。工作区通过各自 `index.ts` 组合它们；属性表只是图表的一个打开入口，不是图表的所有者。旧 `src/components/attributes/` 已删除。详见 [属性表模块](./attributes.zh-CN.md)和[图表模块](./charts.zh-CN.md)。

### `shared/`

仅承载确有跨模块复用需求、且不反向依赖业务 Feature 的基础能力。当前 `shared/data-views/` 包含中立数据集/记录契约、查询排序与统计服务、按数据集隔离的视图筛选状态，以及 React 注入桥接；不是新增的数据管理业务模块，也不保存权威 GIS 数据。数据字段、几何和持久化仍属于原 GIS 数据通路。详见 [共享数据视图契约](./data-views.zh-CN.md)。

### `services/`

Service 负责数据访问、文件读写、接口调用、持久化和无 UI 的业务操作。Service 不应直接渲染 React 组件。

如果 Service 只服务于某个业务，应优先放在该业务目录下，例如：

```text
src/features/layers/services/layerService.ts
```

### `stores/`

Store 负责状态、状态变更动作和选择器。组件通过 Hook 或公开的 Action 使用 Store，不直接修改内部状态。

### `types/`

放跨模块共享类型。单一业务的类型优先放在对应 feature 的 `types.ts` 中。

### `adapters/`

负责隔离外部库或引擎的 API。GIS 平台中的地图引擎适配至少包括：

```text
MapLibreLayerAdapter       # 2D 主地图
CesiumLayerAdapter         # 3D 地球
OpenLayersLayerAdapter     # 数字化和投影地图
```

## 3. 图层管理模块

当前图层功能的规范入口为：

```text
src/features/layers/
├─ components/
│  └─ LayerList.tsx
├─ stores/
│  └─ layerStore.ts
├─ services/
│  ├─ layerService.ts
│  └─ layerPersistenceService.ts
├─ adapters/
│  ├─ layerAdapterTypes.ts
│  ├─ mapLibreLayerAdapter.ts
│  ├─ cesiumLayerAdapter.ts
│  └─ openLayersLayerAdapter.ts
├─ types.ts
└─ index.ts
```

职责划分：

| 文件或目录 | 职责 |
|---|---|
| `components/LayerList.tsx` | 图层列表公开视图入口 |
| `components/` | 图层树、图层项、分组、样式面板等视图 |
| `stores/layerStore.ts` | 图层状态和视图模型边界 |
| `services/layerService.ts` | 图层顺序、名称、业务规则和数据操作 |
| `services/layerPersistenceService.ts` | 图层和地图组持久化 |
| `adapters/mapLibreLayerAdapter.ts` | MapLibre 图层同步 |
| `adapters/cesiumLayerAdapter.ts` | Cesium 图层同步 |
| `adapters/openLayersLayerAdapter.ts` | OpenLayers 数字化/投影场景同步 |
| `types.ts` | 图层节点、图层组和动作类型 |
| `index.ts` | 模块对外公开 API |

`src/components/contents/LayerTree.tsx` 仅保留为兼容重导出，规范入口是 `src/features/layers/index.ts` 暴露的 `LayerList`。`src/gisStore.tsx` 仍作为全局 GIS 数据兼容来源，图层视图通过 feature store 使用它。

## 4. 依赖方向

推荐依赖方向：

```text
components → stores / services / types
stores     → types / services
services   → types / 外部数据 API
adapters   → types / 地图引擎 API
```

不建议出现以下依赖：

- Service 导入 React 组件
- 地图组件直接修改另一个组件的状态
- LayerList 直接调用 MapLibre、Cesium 或 OpenLayers 实例
- 通用组件依赖具体图层业务
- 业务模块通过深层路径访问另一个模块的内部文件
- 地图工具栏或其他业务组件绕过 `features/maps/index.ts` 访问地图运行时内部文件

跨模块访问应优先使用目标模块的 `index.ts` 公开入口。

属性表与图表遵守 `workspace → attributes / charts → shared/data-views` 的依赖方向。共享查询和统计实现不反向导入 Feature；ECharts 只在图表适配器使用。公开入口保持表格/图表引擎懒加载，新增导出不能使主应用提前加载引擎。边界测试会检查这些约束。

引擎适配器之间复用现有 `features/layers/adapters/<engine>LayerAdapter.ts` 时，该按引擎文件作为次级入口使用，避免为单一引擎加载聚合入口中的其他地图引擎。该例外不允许 UI 组件绕过业务服务直接控制地图实例。

## 5. 命名约定

### 文件夹

- 全部使用小写
- 通用目录使用复数：`components`、`services`、`stores`、`types`、`adapters`
- 业务目录使用小写单数或复合名：`layers`、`attributes`、`digitize`

### 文件

- React 组件：大驼峰，例如 `LayerList.tsx`、`LayerGroup.tsx`
- Service：小驼峰，例如 `layerService.ts`
- Store：小驼峰，例如 `layerStore.ts`
- Adapter：小驼峰，例如 `mapLibreLayerAdapter.ts`
- 类型文件：小驼峰，例如 `types.ts`、`layerTypes.ts`

### 变量和类型

- 变量、函数：小驼峰，例如 `activeLayerId`
- 类型、接口、类、React 组件：大驼峰，例如 `LayerNode`、`LayerStore`
- 常量：语义明确时使用大写下划线，例如 `DEFAULT_LAYER_OPACITY`
- ID 字段统一使用 `xxxId`，不要混用 `idOfXxx`、`xxxKey`

## 6. 渐进式迁移规则

现有模块暂不要求整体搬迁。新增或修改图层功能时：

1. 新视图放入 `src/features/layers/components/`。
2. 新状态放入 `src/features/layers/stores/`。
3. 新业务逻辑放入 `src/features/layers/services/`。
4. 新的 MapLibre、Cesium、OpenLayers 同步逻辑放入 `src/features/layers/adapters/`。
5. 旧组件只保留兼容入口，不再继续堆积新的业务逻辑。
6. 每次迁移后运行 TypeScript 编译和生产构建。

地图显示与视图控制模块的新增代码应放入 `src/features/maps/`，跨引擎导航通过 `MapCommandContext` 注册能力，视口范围和坐标检索优先复用 `services/` 下的纯函数。

地图布局新增代码应放入 `src/features/layout/`。布局规则通过命令服务和独立 store 执行，地图实例操作只放入布局适配器；导出返回结果，UI 决定是否下载。已完成整体迁移的布局模块不再恢复旧目录或兼容壳。

数字化编辑新增代码应放入 `src/features/digitize/`，外部通过 `index.ts` 使用 Provider、地图桥接、Ribbon Hook、状态命令和编辑服务。绘制/修改先建立会话，再通过数据端口提交；取消只丢弃当前未提交手势，不冒充通用撤销。不得在编辑 store 内复制全量业务图层，也不恢复旧目录或模型专用编辑逻辑。

属性表新增代码放入 `src/features/attributes/`，图表新增代码放入 `src/features/charts/`。共用查询和统计放入 `src/shared/data-views/`，GIS 转换和跨模块导航连接放入工作区组合层。不要为共享筛选让图表重新依赖属性表 Context，也不要恢复旧组件目录。
