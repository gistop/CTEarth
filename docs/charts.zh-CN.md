# 图表模块

## 1. 职责与独立性

规范目录是 `src/features/charts/`，公开入口为 `index.ts`。模块负责字段/图表类型配置、统计模型生成、分布图/柱状图/饼图展示以及 ECharts 生命周期。

图表不导入属性表、GIS Store 或 Dockview。属性表只是一个打开入口；宿主可直接挂载图表，或通过 `useChartActions().openChart` 从其他入口打开。默认与同数据集的表格共享筛选，但不读取表格的排序与私有状态。

## 2. 分层

```text
features/charts/
├─ components/
│  ├─ ChartPanel.tsx             # 对外懒加载入口
│  ├─ ChartPanelView.tsx         # 字段、类型、筛选和统计摘要
│  └─ ChartCanvas.tsx            # React 生命周期、错误提示与重试
├─ stores/
│  ├─ chartStore.ts             # 按数据集隔离的字段/类型配置
│  └─ ChartsProvider.tsx         # 注入、订阅与公开导航动作
├─ services/chartModelService.ts # 无 React/ECharts 依赖的统计模型
├─ adapters/echartsAdapter.ts    # 选项转换、引擎与尺寸/资源管理
├─ types.ts
└─ index.ts
```

模型只包含图形种类、标题、分类/计数和摘要，不包含 ECharts 配置。将来更换图表库主要调整适配层，不必重写查询、统计或业务状态；本模块也不绑定任何大模型。

## 3. 独立接入

```tsx
import { Suspense } from 'react';
import { DataViewProvider, type DataViewDataset } from './shared/data-views';
import { ChartsProvider, ChartPanel } from './features/charts';

export function ChartHost({ dataset }: { dataset: DataViewDataset }) {
  return <DataViewProvider datasets={[dataset]}>
    <ChartsProvider>
      <Suspense fallback={<div>加载图表…</div>}>
        <ChartPanel datasetId={dataset.id} preferredField="population" />
      </Suspense>
    </ChartsProvider>
  </DataViewProvider>;
}
```

不需要属性表 Provider。沿用项目图表样式并给宿主容器分配宽高；面板有直接筛选入口，不要求先打开属性表才能筛选。共享数据契约见 [共享数据视图](./data-views.zh-CN.md)。

普通代码可使用 `createChartStore().update(datasetId, { field, kind })` 更新配置，或将共享 `queryDataRows` 的结果传入 `buildChartModel(rows, field, kind)` 得到纯统计模型。宿主需要导航时向 `ChartsProvider` 注入 `onOpenChart`；显式打开请求可指定字段，无字段的请求保留现有选择。

当前配置按数据集而不是图表窗口隔离，同一 Provider 中同数据集的图表共享字段/类型。关闭再打开面板保留当前 Provider 内的配置；数据集被移除时清理，不进行持久化。

## 4. 统计与字段规则

- 有效首选字段优先；否则从前 80 条记录中选择可解析数值的字段，最后回退到第一个字段。这是界面默认值策略，不是字段类型推断系统。
- 普通数据、选择或字段数组引用更新不会覆盖用户手动选择。字段失效时使用有效回退，无字段时清空图表。
- 分布图中非空值的可解析数值比例达到 80% 时使用直方图；忽略的非数值数量显示在摘要中。否则按类别计数。
- 空值和空白字符串不计入有效值；布尔值、数组和对象不被自动转换为数字。普通对象可按文本参与分类。
- 柱状/分类分布最多保留 30 个主要分类，饼图保留 12 个，剩余合并；合并项避免与真实“其他”类别重名。结果统计的是要素/记录频数，不是某个数值字段的求和或加权。
- 直方图为常量时单组，否则按样本数量确定 6–24 组。使用循环计算范围，避免大数组展开和极端有限数值差值溢出。
- 数值格式化用于显示，不更改数据；当前不提供业务分级、自动统计方法推荐或空间关联分析。

## 5. 引擎生命周期

- ECharts 仅由适配器导入，表格与图表引擎均保持懒加载。模型更新使用完整替换，避免从饼图切换后残留旧图例/系列。
- Canvas 是独立组件，数据晚到时正常挂载，不沿用旧实现中“首次无数据导致图表永不初始化”的生命周期假设。
- ResizeObserver 合并尺寸更新为动画帧，零尺寸容器不执行 resize；缺少该 API 时使用可清理的 window resize 回退。
- 卸载释放观察器、监听、动画帧和引擎实例，dispose 幂等；StrictMode 重挂载同样有测试覆盖。
- 初始化与渲染错误明确显示，用户可重试。没有可统计结果时清空引擎并显示空态，不继续展示过期图形。
- 数据标签通过 Canvas/rich-text 提示渲染，不将用户属性作为 HTML 模板注入。选项转换复制分类数据，避免引擎修改纯模型。

## 6. 验证与当前边界

```sh
npm test -- src/features/charts src/shared/data-views src/components/workspace
npm test
npm run build
```

测试覆盖独立运行、数据晚到、筛选、配置保留/字段恢复、分类与直方图、引擎切换、失败重试、尺寸处理与资源释放；依赖测试禁止图表反向依赖属性表，并检查公开入口没有提前引入引擎。

浏览器验收：直接打开图表；切换字段与类型；从表格和图表分别修改筛选并观察联动；删除/替换数据集；移动/缩放面板；反复开关图表并检查无残留 Canvas 和错误；检查空字段、空筛选、特殊字段名和只读分析结果。

当前没有图形点击/刷选反选地图、跨数据集比较、传感器时序、仪表盘、多窗口独立配置、图表导出或持久化。统计仍在主线程对当前数据集执行。jsdom 与模拟引擎测试不等同于真实浏览器 Canvas 绘图和交互的端到端验收。
