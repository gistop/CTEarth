# CTEarth 开发文档

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | CTEarth 开发文档 |
| 文档版本 | 0.1 |
| 文档状态 | 草案；图层管理模块设计已完成，其余章节待补充 |
| 最后更新 | 2026-09-11 |
| 适用对象 | 产品、架构、前端、GIS 引擎、测试及维护人员 |
| 代码基线 | 当前工作区中的 `src/features/layers/` 实现 |

## 1. 文档目的

本文档用于记录 CTEarth 的开发设计、模块边界、实现约束和工程约定，为开发、评审、测试及后续维护提供统一依据。

当前阶段仅完成“模块设计”中的“图层管理模块”部分。未完成章节保留正式目录和占位说明，后续应依据实际需求和代码逐步补充，不得用规划内容替代当前实现。

## 2. 项目概述

> 待补充。

## 3. 需求规格

> 待补充。后续应包括业务目标、用户角色、功能需求、非功能需求和验收标准。

## 4. 系统架构设计

> 待补充。

源码目录、依赖方向和地图引擎适配原则目前参见 [前端源码架构说明](./source-architecture.zh-CN.md)。

## 5. 模块设计

### 5.1 模块清单

| 模块 | 当前文档状态 |
|---|---|
| 图层管理模块 | 已完成本阶段设计说明 |
| 地图显示与视图控制模块 | 已完成本阶段设计说明 |
| 数据导入与导出模块 | 待补充 |
| 属性表与图表模块 | 待补充 |
| 数字化编辑模块 | 待补充 |
| 空间分析模块 | 待补充 |
| 地图布局与制图模块 | 待补充 |
| AI 助手模块 | 待补充 |

### 5.2 图层管理模块

#### 5.2.1 模块定义

图层管理模块是系统中负责组织、展示和控制地图图层的业务模块。它不仅包含用户能够直接看到的地图图层树，还包括支撑该视图运行的状态管理、地图组业务规则、持久化服务、领域类型以及地图引擎适配器。

地图图层树视图组件与图层管理模块的关系如下：

```text
图层管理模块
├─ 地图图层树视图组件
├─ 图层及地图组状态
├─ 图层和地图组业务规则
├─ 草稿持久化
├─ 领域类型与公开接口
└─ 地图引擎适配器
```

因此，地图图层树是图层管理模块的视图入口和交互载体，但不等于整个图层管理模块。

#### 5.2.2 设计目标

本模块的设计目标如下：

- 为用户提供统一的地图、底图、矢量图层、栅格图层和分析结果图层管理界面。
- 将视图展示、业务规则、状态管理、持久化和地图引擎命令分离。
- 使用稳定标识完成选择、排序和跨地图组移动，避免搜索过滤导致索引错位。
- 通过统一适配边界同步 MapLibre、Cesium 和 OpenLayers。
- 保持现有工作区数据和地图组草稿格式兼容。
- 支持鼠标和键盘完成核心图层操作。
- 对外提供稳定入口，减少其他模块对内部文件结构的依赖。

#### 5.2.3 模块边界

模块负责：

- 展示地图组及其图层树。
- 管理当前地图组、地图组展开状态和地图组显示状态。
- 管理图层选择、显隐、排序、跨组移动、重命名和样式设置。
- 新建空白 GeoJSON 图层。
- 接入图层数据导入及矢量数据导出操作。
- 发起图层缩放和属性表打开操作。
- 保存和恢复地图组草稿。
- 将统一图层状态转换为各地图引擎需要的同步请求。

模块不负责：

- GIS 文件格式解析算法的具体实现。
- 空间分析算法本身。
- MapLibre、Cesium 和 OpenLayers 地图容器的创建与销毁。
- 属性表内部的数据编辑和表格渲染。
- 全局工作区布局、菜单编排和窗口管理。

上述能力由相应模块负责，图层管理模块仅通过公开状态或接口与其协作。

#### 5.2.4 源码位置

规范模块目录为 [src/features/layers](../src/features/layers/)：

```text
src/features/layers/
├─ components/
│  ├─ LayerList.tsx
│  ├─ LayerPanel.tsx
│  ├─ LayerRow.tsx
│  ├─ LayerBadge.tsx
│  ├─ LayerStylePanel.tsx
│  ├─ MapGroupSection.tsx
│  ├─ MapGroupEditPanel.tsx
│  ├─ AddDataSplitButton.tsx
│  ├─ SaveAsSplitButton.tsx
│  ├─ MapGroupSplitButton.tsx
│  ├─ InlineRenameLabel.tsx
│  └─ layerViewTypes.ts
├─ stores/
│  ├─ layerStore.ts
│  └─ mapGroupStore.ts
├─ services/
│  ├─ layerService.ts
│  ├─ mapGroupService.ts
│  └─ layerPersistenceService.ts
├─ adapters/
│  ├─ layerAdapterTypes.ts
│  ├─ mapLibreLayerAdapter.ts
│  ├─ cesiumLayerAdapter.ts
│  └─ openLayersLayerAdapter.ts
├─ types.ts
└─ index.ts
```

历史路径 [src/components/contents/LayerTree.tsx](../src/components/contents/LayerTree.tsx) 只保留兼容重导出。新代码必须优先通过 [src/features/layers/index.ts](../src/features/layers/index.ts) 使用模块能力。

#### 5.2.5 内部分层与职责

| 分层 | 文件或组件 | 主要职责 |
|---|---|---|
| 公开入口 | `index.ts` | 暴露稳定的视图、Store、Service、类型和 Adapter API |
| 视图入口 | `LayerList.tsx` | 对外提供图层管理视图名称，当前委托给 `LayerPanel` |
| 视图协调 | `LayerPanel.tsx` | 组合子组件、派生视图模型、接收用户操作并调用状态或服务 |
| 图层行 | `LayerRow.tsx` | 展示单个图层的选择、显隐、拖拽、键盘排序和编辑入口 |
| 图层符号 | `LayerBadge.tsx` | 根据图层类型和样式生成图层树中的符号预览 |
| 样式编辑 | `LayerStylePanel.tsx` | 编辑底图、栅格、矢量图层和分析结果图层样式 |
| 地图组视图 | `MapGroupSection.tsx` | 展示地图组、当前地图、展开状态、组显隐及组排序操作 |
| 基础图层状态 | `layerStore.ts` | 为图层模块提供聚焦的 GIS 状态和 Action 访问边界 |
| 地图组状态 | `mapGroupStore.ts` | 管理地图组、当前组、折叠状态、加载、保存和渲染状态同步 |
| 图层规则 | `layerService.ts` | 图层顺序去重和图层名称规范化 |
| 地图组规则 | `mapGroupService.ts` | 创建、规范化、排序、移动、选择标识和可见性计算 |
| 持久化边界 | `layerPersistenceService.ts` | 统一暴露地图组草稿和工作区草稿读写服务 |
| MapLibre 适配 | `mapLibreLayerAdapter.ts` | 同步 MapLibre 底图 source/layer、显隐、透明度和图层顺序 |
| Cesium 适配 | `cesiumLayerAdapter.ts` | 同步 Cesium 影像、单图栅格和 GeoJSON DataSource |
| OpenLayers 适配 | `openLayersLayerAdapter.ts` | 同步 OpenLayers 底图生命周期、显隐、透明度和 Z 顺序 |
| 领域类型 | `types.ts` | 定义地图组、组内图层项、图层动作和可见性结构 |

#### 5.2.6 公开接口

模块的稳定公开入口是 `src/features/layers/index.ts`。其他业务模块应通过该入口访问图层管理能力，不应深层导入 `components/`、`stores/`、`services/` 或 `adapters/` 内部实现。

当前公开能力分为以下几类：

| 类别 | 公开能力 |
|---|---|
| 视图 | `LayerList` |
| 状态 | `useLayerStore`、`useMapGroupStore` |
| 地图组规则 | 默认地图组、图层顺序、稳定选择 ID、图层与地图组移动函数 |
| 图层规则 | `normalizeLayerName`、`normalizeLayerOrder` |
| 引擎适配 | MapLibre、Cesium、OpenLayers Adapter 创建函数及请求类型 |
| 领域类型 | 图层节点、图层可见性、图层动作及适配器契约 |

内部实现可以继续拆分，但公开名称或语义发生不兼容变更时，必须同步更新调用方、本文档和变更记录。

#### 5.2.7 核心领域模型

##### 地图组 `MapGroup`

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | `string` | 地图组稳定标识 |
| `name` | `string` | 用户可见的地图名称 |
| `displayVisible` | `boolean?` | 整个地图组是否参与地图渲染；旧数据缺失时按 `true` 处理 |
| `layerItems` | `MapGroupLayerItem[]` | 按绘制顺序保存的组内图层实例 |

##### 组内图层项 `MapGroupLayerItem`

| 字段 | 类型 | 含义 |
|---|---|---|
| `instanceId` | `string` | 图层实例稳定标识，用于拖拽、排序和底图选择 |
| `layerId` | `MapGroupLayerItemId` | 指向业务图层，例如 `uploaded:<id>`、`raster:<id>`、`vectorOverlay` 或 `basemap` |
| `visible` | `boolean` | 该图层实例在组内的显隐状态 |
| `basemapId` | `BasemapId?` | 2D 底图标识，仅底图实例使用 |
| `basemapSourceKind` | `BasemapSourceKind?` | 底图来源类别，区分普通底图和影像来源 |
| `cesiumImageryId` | `CesiumImageryId?` | 3D 影像标识，仅底图实例使用 |
| `opacity` | `number?` | 底图实例透明度 |

##### 标识规则

系统必须区分以下三类标识：

- `layerId`：业务图层标识，同一个业务图层只能被统一识别。
- `instanceId`：地图组中的图层实例标识，排序和跨组移动必须以它为准。
- `selectionId`：视图选择标识。普通图层使用 `layerId`；底图允许存在多个实例，因此使用 `groupId:instanceId`。

任何排序实现不得依赖搜索结果数组中的临时索引。搜索会改变可见行集合，而 `instanceId` 在过滤前后保持稳定。

#### 5.2.8 状态设计

模块当前包含四类状态：

| 状态类别 | 所有者 | 示例 |
|---|---|---|
| GIS 业务状态 | `gisStore`，由 `useLayerStore` 提供模块边界 | 上传图层、栅格、分析结果、样式、显隐、活动图层 |
| 地图组状态 | `useMapGroupStore` | 地图组列表、当前地图组、折叠组、草稿加载状态 |
| 视图临时状态 | `LayerPanel` | 搜索词、选中行、拖拽目标、当前打开的编辑面板 |
| 引擎渲染状态 | `mapGroupRenderState` | 供多个地图视图订阅的规范化渲染条目 |

`useLayerStore` 当前是全局 `useGis()` 的图层领域门面，用于渐进迁移，并不代表 GIS 全局状态已经完全迁入 feature。新增图层视图代码应依赖 `useLayerStore`，避免继续扩大对 `gisStore` 的直接依赖。

`useMapGroupStore` 负责地图组状态生命周期。视图组件不直接读写 IndexedDB，也不自行生成地图引擎命令。

#### 5.2.9 数据流

图层管理模块遵循单向数据流：

```text
用户操作
  ↓
LayerList / LayerPanel / 子视图组件
  ↓
图层 Action 或 mapGroupService 纯业务函数
  ↓
useLayerStore / useMapGroupStore
  ↓
统一图层状态与 MapGroupRenderState
  ↓
MapLibre / Cesium / OpenLayers Adapter
  ↓
实际地图引擎
```

典型操作的数据流如下：

| 操作 | 状态及规则处理 | 后续影响 |
|---|---|---|
| 勾选图层 | 更新对应 `MapGroupLayerItem.visible` | 重新计算可见图层并同步各地图引擎 |
| 隐藏地图组 | 更新 `MapGroup.displayVisible` | 保留组内显隐设置，但整个组暂停渲染 |
| 拖动图层 | `moveLayerItemInMapGroups` 按 `instanceId` 移动 | 更新绘制顺序、草稿和引擎 Z 顺序 |
| 键盘排序 | `moveLayerItemByOffset` 或 `moveMapGroupByOffset` | 与鼠标排序产生相同状态结果 |
| 修改底图 | 更新目标底图实例的来源和样式 | MapLibre、Cesium、OpenLayers 分别重建或更新对应底图 |
| 上传数据 | `useLayerStore` 调用 GIS 导入 Action | 新图层分配至当前地图组并显示在图层树中 |
| 重命名 | 校验名称后更新业务图层或地图组 | 视图重绘并保存草稿 |

#### 5.2.10 主要交互规则

##### 地图组

- 系统首次使用时创建默认地图组“地图”。
- 地图组名称不能为空，且规范化后不得重复。
- 当前地图组用于接收尚未归属的新增图层。
- 地图组复选框统一修改组内所有图层实例的 `visible`。
- 地图组右侧的眼睛按钮修改 `displayVisible`，不清除组内图层各自的显隐配置。
- 地图组支持鼠标拖拽排序，也支持在地图组行上使用 `Alt+↑` 和 `Alt+↓` 排序。
- 搜索期间匹配的地图组强制展开，但不修改用户持久化的折叠状态。

##### 图层选择和操作

- 单击图层行选择图层；上传矢量图层和栅格图层同时更新对应活动图层状态。
- 双击上传矢量或栅格图层时缩放到其范围。
- 图层显隐由原生复选框控制，操作不得被行级键盘事件截获。
- 编辑按钮打开相应的图层样式面板或地图组编辑面板。
- 删除操作当前支持上传矢量图层和底图实例，并要求用户确认。
- 属性表入口支持上传矢量图层和矢量分析结果。
- 矢量数据支持保存为 GeoJSON 或 GeoPackage。

##### 搜索

- 搜索同时匹配地图组名称和图层显示名称。
- 地图组名称匹配时展示该组全部图层。
- 仅图层名称匹配时只展示匹配图层。
- 搜索结果中的地图组显隐状态仍按完整地图组计算，避免界面显示范围与实际修改范围不一致。
- 搜索结果不得改变排序使用的业务标识。
- 无匹配项时显示明确的“未找到匹配的地图或图层”状态。

##### 排序

- 图层排序以 `instanceId` 确定源项和目标项。
- 图层可以在同一地图组内移动，也可以跨地图组移动。
- 拖放到地图组空白位置时，图层追加到目标组末尾。
- 图层行支持 `Alt+↑` 和 `Alt+↓` 在当前地图组内移动。
- 底图移动后必须使用新的 `groupId:instanceId` 保持选择状态。
- 排序完成后统一生成绘制顺序，不允许视图直接调用地图引擎的 `moveLayer` 或 ZIndex API。

#### 5.2.11 持久化设计

地图组草稿通过 `layerPersistenceService` 委托给现有 `mapGroupDraftStore`，当前使用 IndexedDB 保存。

保存内容包括：

- 草稿版本，目前为 `version: 1`。
- 保存时间 `savedAt`。
- 当前地图组 ID。
- 地图组及其组内图层实例。
- 已折叠地图组 ID。

生命周期规则：

1. 等待工作区草稿完成加载。
2. 读取地图组草稿，并对旧数据补充默认字段。
3. 删除已经不存在的业务图层引用。
4. 将未被任何地图组认领的新图层分配到当前地图组。
5. 地图组状态变化后延迟 500 毫秒保存，减少连续交互产生的写入。
6. 地图组为空时删除地图组草稿。

持久化失败目前记录到控制台，不阻断用户继续使用当前内存状态。后续如引入统一通知系统，应将失败状态转换为用户可见但不干扰操作的提示。

#### 5.2.12 地图引擎适配设计

所有引擎适配器遵循 `LayerEngineAdapter<TRequest>` 契约：

```ts
type LayerEngineAdapter<TRequest> = {
  sync: (request: TRequest) => Promise<void> | void;
  dispose?: () => void;
};
```

##### MapLibre Adapter

负责：

- 根据地图组渲染条目创建、更新和清理底图 source 与 raster layer。
- 同步底图显隐和透明度。
- 根据地图组顺序调整上传图层、栅格结果、矢量分析结果和底图顺序。
- 在开发环境或调试开关启用时输出图层状态日志。

##### Cesium Adapter

负责：

- 重建地图组底图影像层。
- 同步单图栅格影像和透明度。
- 加载矢量分析结果及上传 GeoJSON 数据源。
- 在异步加载阶段检查调用是否仍然有效，避免过期结果写入已经切换或销毁的场景。

##### OpenLayers Adapter

负责：

- 为数字化地图和投影地图创建、更新及移除底图 TileLayer。
- 同步底图显隐和透明度。
- 按使用场景处理背景式或完整顺序式 ZIndex。
- 同步上传图层、栅格层和矢量分析结果的目标 ZIndex。

地图视图组件负责持有地图实例和触发适配器，适配器负责具体图层同步。图层树视图不得直接持有或操作地图引擎实例。

#### 5.2.13 可访问性要求

当前模块采用以下约定：

- 图层容器使用 tree 语义，地图组和图层行使用 treeitem 语义。
- 原生复选框、按钮、选择框和范围控件保留其原生键盘行为。
- 行级 Enter、空格和方向键处理仅在焦点位于行本身时执行，不截获内部控件事件。
- 图层及地图组提供 `Alt+↑`、`Alt+↓` 排序方式，作为鼠标拖放的键盘替代方案。
- 展开、当前地图、显隐和编辑状态通过 `aria-expanded`、`aria-selected`、`aria-pressed` 等属性表达。
- 搜索框使用 `:focus-within` 显示清晰焦点状态。
- 搜索无结果提示使用状态语义，使辅助技术能够获得反馈。

新增交互不得只提供鼠标拖放而没有等价键盘操作。

#### 5.2.14 错误处理与防御规则

- 地图组或图层名称为空时拒绝提交。
- 地图组名称重复时拒绝提交。
- 删除图层或底图前要求用户确认。
- 排序函数接收到不存在的地图组、图层实例或目标实例时返回原状态，不产生部分修改。
- 草稿中的旧字段通过 `normalizeMapGroups` 补齐默认值。
- 不存在的图层引用在状态同步阶段清理。
- 地图引擎同步只处理当前实际存在的地图图层，避免对不存在的图层执行命令。

#### 5.2.15 测试与验收范围

当前纯业务规则测试位于 [mapGroupService.test.ts](../src/features/layers/services/mapGroupService.test.ts)，已覆盖：

- 过滤场景下按稳定实例 ID 跨组移动图层。
- 底图跨组移动后的选择 ID。
- 图层和地图组键盘顺序移动。
- 地图组拖放位置计算。
- 历史底图草稿规范化和绘制顺序生成。

图层管理模块合入前至少应满足：

- TypeScript 编译通过。
- 生产构建通过。
- 图层管理业务规则测试通过。
- 搜索、选择、显隐、编辑、删除、拖拽及键盘排序无明显回归。
- MapLibre、Cesium 和 OpenLayers 中的图层顺序与显隐结果一致。
- 文档与公开入口、领域类型和持久化格式同步更新。

组件交互测试、跨引擎集成测试和端到端回归测试将在“测试设计”章节补充，并应逐步纳入持续集成。

#### 5.2.16 依赖约束

允许的主要依赖方向：

```text
components → stores / services / types
stores     → services / types / 兼容状态源
services   → types / 持久化基础设施
adapters   → types / 地图引擎 API / 地图源定义
```

约束如下：

- 外部模块优先通过 `src/features/layers/index.ts` 使用本模块。
- 视图组件不得直接操作 MapLibre、Cesium 或 OpenLayers 实例。
- Service 不得导入或渲染 React 组件。
- 纯排序、规范化和标识计算应保留为无副作用函数，以便测试。
- `gisStore` 是当前兼容依赖；新增图层视图不应绕过 `useLayerStore` 继续扩大直接依赖。
- 持久化格式发生变化时必须升级版本并提供兼容迁移策略。

#### 5.2.17 当前限制与后续演进

当前实现仍处于渐进式模块化阶段：

- `useLayerStore` 仍以全局 `gisStore` 为实际业务状态来源。
- `LayerPanel` 仍承担视图编排和部分交互协调，后续可以继续拆出搜索、选择和命令 Hook。
- 地图组草稿与工作区草稿目前由两个兼容存储服务维护，需要保持加载顺序一致。
- 现有自动化测试主要覆盖纯业务规则，组件级和端到端覆盖尚需补充。

后续演进应优先保持公开接口和持久化数据兼容。只有在具备迁移方案、回归测试和文档更新时，才允许调整领域标识或草稿结构。

### 5.3 地图显示与视图控制模块

地图显示模块位于 `src/features/maps/`，负责地图工作区 UI、视图命令和各地图引擎运行时的编排。它与图层管理模块通过 `useLayerStore`、`MapGroupRenderState` 及图层适配器协作，不在 UI 中重复实现图层业务规则。

#### 5.3.1 引擎分工

| 引擎 | 入口 | 职责 |
|---|---|---|
| MapLibre | `components/MapPanel.tsx` | 主二维地图、在线底图、上传图层和分析结果 |
| OpenLayers | `components/map/OpenLayersProjectionMap.tsx` | 非 Web Mercator 投影视图；数字化地图仍由兼容组件提供 |
| Cesium | `components/MapPanel.tsx` 内部按需加载 | 地形与三维地球、三维测量和日照 |

#### 5.3.2 视图控制边界

- `MapCommandContext` 只维护当前视图状态和引擎能力声明；命令通过 `registerMapCommands` 注册，未实现的命令不会显示为可用。
- `MapViewportContext` 保存可跨投影视图复用的 WGS84 视口范围，用于 CRS 切换和地图面板重建后的视图恢复。
- `MapViewportFrame` 统一地图面板的状态提示、坐标读数和容器样式，MapLibre 与 OpenLayers 投影视图共享同一套 UI 外壳。
- `mapViewportService` 负责范围计算、合法性校验和边界填充；`mapSearchService` 负责坐标解析与 Nominatim 检索，均不依赖 React 或地图实例。

#### 5.3.3 数据流

```text
地图工具栏 / 图层面板
  ↓
MapCommandContext / MapViewportContext
  ↓
MapPanel 或 OpenLayersProjectionMap
  ↓
features/layers/adapters
  ↓
MapLibre / OpenLayers / Cesium 实例
```

地图引擎实例只在地图运行时组件中创建和销毁；图层显隐、顺序、透明度及底图来源由 `features/layers/adapters/` 统一同步。Cesium 运行时保持按需加载，投影视图保持懒加载，以避免主地图首屏引入不必要的引擎代码。

## 6. 数据设计

> 待补充。后续应包括工作区数据、空间数据、草稿格式和数据迁移策略。

## 7. 接口设计

> 待补充。后续应包括前后端 API、模块事件、公开 Hook 和错误码约定。

## 8. 安全设计

> 待补充。后续应包括文件输入校验、外部 URL、凭据、内容安全策略和依赖安全。

## 9. 性能设计

> 待补充。后续应包括大数据量图层、渲染性能、内存控制、懒加载和构建体积。

## 10. 测试设计

> 待补充。后续应包括单元测试、组件测试、集成测试、端到端测试和回归测试策略。

## 11. 构建与部署

> 待补充。后续应包括环境要求、构建命令、环境变量、部署流程和回滚方案。

## 12. 运行维护与监控

> 待补充。后续应包括日志、错误监控、性能监控、数据恢复和故障处理。

## 13. 开发规范

> 待补充。现阶段源码组织和命名要求参见 [前端源码架构说明](./source-architecture.zh-CN.md)。

## 14. 版本与变更记录

| 文档版本 | 日期 | 变更内容 |
|---|---|---|
| 0.1 | 2026-09-11 | 建立开发文档骨架；完成图层管理及地图显示与视图控制模块设计说明 |
