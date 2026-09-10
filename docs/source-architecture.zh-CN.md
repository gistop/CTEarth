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

图层专属组件应放在 `features/layers/components/`，而不是继续增加到全局 `components/`。

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

跨模块访问应优先使用目标模块的 `index.ts` 公开入口。

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
