# 共享数据视图契约

## 1. 为什么需要共享层

属性表 `features/attributes` 与图表 `features/charts` 是两个独立业务模块。它们需要看到相同的数据、筛选与选择，但不应该依赖对方组件或复制 GIS 数据。

`src/shared/data-views/` 提供中立契约和无 UI 的查询/统计能力，外加可选 React 桥接。这里不是“第三个数据管理模块”，没有几何、文件、项目或数据库存储逻辑，也不导入任何 Feature、GIS Store 或图表引擎。

```text
GIS 数据及选择状态（权威）
  → components/workspace/gisDataViewAdapter
  → DataViewProvider（注入只读视图与选择回调）
     ├─ attributes：表格、排序、行选择
     └─ charts：字段/类型配置、统计模型、图表引擎

两个模块 → 同一 filter store：query / showSelectedOnly
选择请求 → 注入的 onSelect → 既有 GIS 更新通路 → 新快照
```

## 2. 数据契约

```ts
type DataViewDataset = {
  id: string;
  name: string;
  records: readonly Readonly<Record<string, unknown>>[];
  fields: readonly string[];
  selectedIndexes: readonly number[];
  selectable: boolean;
  editable?: boolean;
  fieldDefinitions?: readonly DataFieldDefinition[];
};
```

- 同一 Provider 中的数据集 ID 必须唯一、非空；记录顺序与选择索引必须来自同一份数据快照。
- `editable` 是宿主显式提供的字段编辑能力，不从 `selectable` 推断；可选的 `fieldDefinitions` 包含名称、别名、类型、可空性、默认值与文本长度。共享层提供中立定义与纯校验服务，不持有字段编辑草稿或执行 GIS 写入。
- `records` 是只读记录视图，不要求包含几何，也不要求宿主是 GIS。不得在 UI 或统计服务内修改记录。
- 宿主更新数据/选择时提供新引用。既有 GIS 适配器按 GeoJSON 引用缓存属性投影，重用属性对象而不复制权威几何；这是可丢弃的派生视图，不是数据仓库。
- 无效/空属性映射为空记录，不删除该记录，因此不会改变原始要素索引。分析结果 `vectorOverlay` 标记为只读，但仍允许搜索、排序和生成图表。
- `onSelect(datasetId, indexes)` 负责真正更新选择。Provider 检查可选性和索引范围，复制、去重、排序后调用宿主；它不自己维护另一份“选中记录”状态。
- 当前 GIS 身份映射仍使用记录索引，不是长期稳定的 Feature ID。替换/重排数据后，应由数据拥有方生成一致的新选择快照。

## 3. 状态所有权

| 状态 | 所有者 | 生命周期 |
|---|---|---|
| 数据、字段、选中记录 | 原 GIS 数据通路/注入宿主 | 沿用原有数据和持久化机制 |
| 搜索词、仅显示已选 | `DataViewFilterStore` | Provider 实例内按数据集隔离；数据集移除时清理 |
| 属性表排序 | `AttributeTableStore` | 属性表 Provider 内按数据集隔离 |
| 未保存字段草稿 | `AttributeFieldStore` | 属性表 Provider 内按数据集隔离，图层移除时清理 |
| 图表字段、图表类型 | `ChartStore` | 图表 Provider 内按数据集隔离 |
| Dockview 面板 ID、激活、位置 | 应用工作区 | 沿用当前面板管理 |
| ECharts 实例、动画帧、观察器 | 图表适配器 | Canvas 挂载到卸载 |

默认同一数据集的表格和图表双向共享筛选；图表不读取表格的排序或私有状态。表格关闭不影响仍打开的图表。视图配置不持久化，也不会写入 GeoJSON；当前同数据集的多个视图共享该数据集对应配置，而不是每个窗口拥有单独配置。

## 4. 可复用服务

- `queryDataRows`：不区分大小写的包含搜索与选中集合过滤，输出原始记录索引和只读属性引用。
- `sortDataRows`：稳定排序，保留原始索引；空值排后，不将空字符串、空值或布尔值当作数字零。
- `selectDataRow`：生成单选/增减多选的索引请求，不修改输入数据集。
- `getDataValue`：仅读取自有属性，避免特殊字段名读取对象原型。
- `countCategories`：分类计数与超限合并，避免真实“其他”类别与合并项同名。
- `buildHistogram`：有限数值分组，不使用大数组参数展开；处理极端数值范围，避免差值溢出。
- `createDataViewFilterStore`：普通代码可更新筛选、订阅不可变快照；各 Store 实例独立，不使用模块级单例。

## 5. 工作区组合

`src/components/workspace/DataViewWorkspaceProvider.tsx` 通过 `useLayerStore` 连接现有数据，通过三个 Provider 组合共享视图、属性表和图表。表格发起图表打开请求时，工作区将它交给图表公开动作，再委托 `App.tsx` 打开 Dockview 面板。

字段新增通过独立的可选导航/提交回调接入属性模块，不经由只读记录视图回写。工作区组合图层的纯字段更新服务与现有 GIS 更新入口，成功后新的数据快照自然同步给属性表和图表。

保留原面板组件名 `attributeTable` / `attributeChart`、ID 前缀及 `layerId` 参数；应用包装组件将其转换为独立模块的 `datasetId`，不让 Dockview 类型进入业务模块。

未来独立数据管理模块或其他数据源接入时，主要替换工作区数据适配与选择回调。业务模块不需要知道数据来自哪个文件、地图引擎或模型。

## 6. 验证与限制

```sh
npm test -- src/shared/data-views src/components/workspace
```

测试覆盖查询/排序语义、索引保真、无效数值与特殊字段、分类/直方图边界、Store 隔离、选择回调、GIS 快照转换及两个模块的筛选联动。模块边界测试同时禁止业务反向依赖和公开入口提前加载 ECharts/表格引擎。

这些服务仍在浏览器内存中对当前数据集计算；虚拟化只减少表格 DOM，不等于服务端分页、Worker 统计或百万级数据实时查询。当前不提供 SQL、关联查询、图表刷选反选、数据编辑或新的持久化协议。
