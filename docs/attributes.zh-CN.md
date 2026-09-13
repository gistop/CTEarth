# 属性表模块

## 1. 职责

规范目录是 `src/features/attributes/`，公开入口为 `index.ts`。模块负责表格展示、列与行、虚拟化滚动、排序、搜索/选择筛选入口、行选择交互，以及字段新增的草稿编辑与校验。

它不负责图表配置、图表引擎、源数据存储、几何编辑或 Dockview 面板编排。旧 `src/components/attributes/` 已整体删除，不保留兼容壳；图表迁入独立的 `features/charts`，不是本模块子目录。

## 2. 分层

```text
features/attributes/
├─ components/
│  ├─ AttributeTablePanel.tsx    # 对外懒加载入口
│  ├─ AttributeTableView.tsx     # 表格与虚拟化、鼠标/键盘选择
│  ├─ AttributeTableHeader.tsx   # 搜索、已选、清除、添加字段及打开图表入口
│  ├─ AttributeFieldsPanel.tsx   # 字段页懒加载入口
│  ├─ AttributeFieldsView.tsx    # 已有字段及新增字段行，不重复图层选择器
│  └─ AttributeFieldsHeader.tsx  # 标签栏中的图层名称、添加、保存、放弃
├─ stores/
│  ├─ attributeTableStore.ts    # 按数据集隔离的排序状态
│  ├─ attributeFieldStore.ts    # 按数据集隔离的字段草稿与提交反馈
│  ├─ useAttributeFieldEditor.ts # 字段编辑动作与宿主提交调用
│  └─ AttributeTableProvider.tsx # React 订阅和宿主导航注入
├─ services/
│  └─ attributeFieldService.ts  # 草稿解析和字段定义编译
├─ types.ts
└─ index.ts
```

查询、稳定排序、单选/多选请求算法复用 `shared/data-views`，不在表格和图表中各写一份。数据与筛选所有权见 [共享数据视图契约](./data-views.zh-CN.md)。

## 3. 接入

独立使用只需要共享数据视图和属性表 Provider，不需要图表 Provider、GIS Store 或 Dockview：

```tsx
import { Suspense } from 'react';
import { DataViewProvider, type DataViewDataset } from './shared/data-views';
import { AttributeTableProvider, AttributeTableHeader, AttributeTablePanel } from './features/attributes';

export function TableHost({ dataset, onSelect }: {
  dataset: DataViewDataset;
  onSelect: (datasetId: string, indexes: number[]) => void;
}) {
  return <DataViewProvider datasets={[dataset]} onSelect={onSelect}>
    <AttributeTableProvider>
      <AttributeTableHeader datasetId={dataset.id} />
      <Suspense fallback={<div>加载属性表…</div>}>
        <AttributeTablePanel datasetId={dataset.id} />
      </Suspense>
    </AttributeTableProvider>
  </DataViewProvider>;
}
```

宿主还可注入 `store`、`onOpenTable` 和 `onOpenChart`。没有图表导航回调时，工具栏图表按钮不可用；不因此要求图表模块存在。接入时沿用项目表格样式，并为面板分配有界高度以支持虚拟滚动。

字段编辑由可选的 `onOpenFields(datasetId, name)` 和同步的 `onAddFields(datasetId, definitions)` 注入；数据集显式声明 `editable: true` 后才启用入口。提交失败应抛出错误，组件保留草稿并显示错误，不报告成功。属性模块不导入 GIS Store、图层模块或 Dockview。

工作区调用图层模块的 `addLayerFields` 生成不可变 GeoJSON，再通过既有 `updateUploadedLayerGeoJson` 更新权威数据、工具输入及派生字段列表。字段页的 Dockview 创建与重复激活由 `components/workspace/attributeFieldsDock.ts` 负责。

普通程序可直接通过 `createAttributeTableStore().update(datasetId, { sort })` 控制排序，或调用共享查询/排序服务生成行模型，不需要模拟 UI 点击。

## 4. 交互规则

- 列排序依次循环升序、降序、无排序。排序和筛选始终保留原始记录索引，不按屏幕行号回写选择。
- 点击/Enter/Space 为单选；Ctrl/Meta 支持增减选择。鼠标和键盘采用相同的可选性检查。
- `vectorOverlay` 等只读数据可以浏览、搜索、排序并打开图表，不能通过键盘绕过只读选择限制。
- FID 是原始记录索引加一，不冒充业务 Feature ID。内部选择/FID 列使用独立列 ID，用户的 `__index`、`selection` 等字段仍可正常展示和排序。
- 数据集不存在时显示空态；没有匹配记录时显示筛选空态。选择回调失败会展示错误，不伪造成功状态。
- 打开图表时可传递当前排序字段作为首选字段，但这只是导航参数，不让图表读取属性表状态。

### 添加字段

- “添加字段”位于“图表”左侧，打开同组的“字段 - 图层名称”标签页；同一图层复用标签页。图层名称仅显示在标签栏工具区，内容区域直接显示字段表格。
- 当“字段 - 图层名称”标签页处于激活状态时，应用 Ribbon 在“帮助”后显示独立的上下文“字段”Tab，并使用区别于普通 Tab 的浅蓝色样式；不显示 ArcGIS Pro 示例中的“要素图层”“标注”“数据”上下文 Tab。点击普通 Tab 可查看普通功能区，字段 Tab 仍随字段页保留，重新点击可返回字段工具组。
- 首次打开预置一行草稿。表格包含字段名、别名、数据类型、允许空值、默认值、长度及状态；底部可继续添加，单行可移除。保存和放弃操作位于标签栏。
- 支持文本、32 位长整型、有限双精度数值、布尔和日期（`YYYY-MM-DD`）。字段名最多 64 个字符，支持中文；禁止重复名称（不区分大小写）和保留名称。文本长度为 1–65535；非空字段必须提供有效默认值。
- 保存一次提交整批字段，并为全部要素填入默认值或 `null`，不受搜索或“仅显示已选”影响；保留要素顺序、几何、ID 和选择。已有字段仅供查看，不实现删除、改名、类型转换或显示/只读开关。
- 空图层也可添加字段。定义存入 GeoJSON 集合扩展成员 `ctearth:fields`，随既有工作区草稿及 GeoJSON 导出保存，恢复时合并属性键与定义，避免全空字段或空图层丢失字段。导入时忽略无效扩展定义。该扩展不是通用数据库 Schema；GeoPackage 等其他格式不保证保留别名、默认值及空字段定义。
- 字段类型、非空与长度校验覆盖本次新增及初始值，不替代后续所有写入通路的数据库约束。已有的无定义字段只提供值类型参考，不推断数据库精度、只读性或空值约束。
- 未保存草稿按数据集隔离，切换或关闭标签后在当前会话保留；“放弃新增”可清空，图层移除会清理。未保存草稿不跨页面刷新持久化。

## 5. 测试与验收

```sh
npm test -- src/features/attributes src/shared/data-views src/components/workspace
npm run build
```

自动化覆盖排序状态、特殊列名、过滤后的索引保真、Ctrl/Meta 与键盘选择、只读分析结果、错误提示、导航和共享筛选。组件测试保留真实表格库，仅模拟虚拟滚动的尺寸输出；真实浏览器滚动行为仍需人工验收。

浏览器检查：打开多个数据集的属性表；排序/搜索后点击行检查地图选择；测试 Ctrl/Meta 和键盘；检查分析结果只读；从表格打开图表并关闭表格，确认图表仍可使用；长表格滚动及缩放面板后检查行位置。

本阶段没有增加单元格编辑、已有字段删除/修改、SQL、服务端分页或表格状态持久化。涉及真实属性更新时继续接入数据拥有方的统一接口，而不是在本模块建立数据仓库。
