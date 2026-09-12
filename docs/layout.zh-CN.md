# 地图布局与制图模块

## 1. 范围与入口

规范入口是 `src/features/layout/index.ts`。`App.tsx` 通过该入口组合 Provider、Dockview 面板和 Ribbon 控件。旧的 `src/components/layout/` 已移除，不保留兼容转发或第二套实现。

本次保持常规人工操作：A4 横向、A4 纵向、A3 横向纸张，页面缩放和平移，地图框、标题、指北针、比例尺的显隐、选择、移动、缩放、对齐、层级调整，经纬网及 PDF/PNG 导出。默认标题仍为“地图标题”。

这是业务模块重构，不是 AI 功能扩展：布局状态和操作不依赖任何模型、提示词或工具调用协议。后续 AI 工具可以在权限校验、参数验证和用户确认后调用同一套布局命令，不应另写一份布局业务逻辑。

## 2. 分层与依赖

```text
src/features/layout/
├─ components/       # 面板、Ribbon、页面元素、手势、React/引擎连接
├─ stores/           # 独立状态容器、React 订阅桥、GIS 输入桥
├─ services/         # 布局命令、几何规则、导出协调、页面绘制和 PDF 编码
├─ adapters/         # OpenLayers 生命周期、地图画布合成、浏览器下载
├─ testing/          # 仅供测试使用的地图输入样例
├─ constants.ts      # 纸张、默认矩形、最小尺寸
├─ types.ts          # 状态、命令、地图视图、快照和导出结果契约
└─ index.ts          # 应用级公开入口
```

| 层 | 主要职责 | 不承担的职责 |
|---|---|---|
| `layoutDocumentService` / `layoutGeometry` | 参数校验、选择、尺寸约束、组移动、对齐和层级 | React、DOM、地图引擎、模型协议 |
| `layoutStore` | 执行命令、不可变快照、订阅通知 | 导出副作用、下载、GIS 数据管理 |
| `LayoutContext` | 通过 `useSyncExternalStore` 接入 React，组合文档与导出服务 | 复制业务规则 |
| `useLayoutGestures` / `useLayoutRulers` | 指针转换、手势状态、标尺与 Dockview 生命周期 | 直接修改状态快照 |
| `useLayoutMapInput` | 将现有 GIS / 地图组状态收敛为 `LayoutMapInput` | 图层编辑、坐标转换、引擎实例管理 |
| `openLayersLayoutMapAdapter` | 地图、图层、控制器、视图、快照与资源释放 | 调用模型或操作 React 状态 |
| `layoutExportController` | 导出注册、忙碌状态、互斥、取消 | 具体制图和文件下载 |
| `layoutExportService` / `layoutPdfService` | 根据文档和快照生成 Blob、警告、文件名 | 查找当前 UI、自动下载 |
| `browserDownloadAdapter` | 浏览器文件下载和 Object URL 回收 | 构造布局或地图 |

布局文档和几何服务不依赖 React、DOM 或 OpenLayers。页面栅格绘制服务依赖浏览器 Canvas / 字体 API；PDF 编码器不依赖 DOM。这里没有把全部导出能力声称为可在无浏览器环境运行。

## 3. 常规调用方式

应用内可以注入独立 store，也可以让 Provider 创建自身的 store：

```tsx
import { createLayoutStore, LayoutProvider } from '../features/layout';
import type { ReactNode } from 'react';

const layoutStore = createLayoutStore();

function LayoutArea({ children }: { children: ReactNode }) {
  return <LayoutProvider store={layoutStore}>{children}</LayoutProvider>;
}
```

Provider 需要处于现有 `GisProvider` 内，地图输入由 GIS 状态桥提供。布局业务命令本身不需要挂载 Provider：

```ts
layoutStore.execute({ type: 'set-paper', paperId: 'a4-portrait' });
layoutStore.execute({ type: 'set-selection', elementIds: ['title', 'north-arrow'] });
layoutStore.execute({ type: 'align-selection', mode: 'left' });
layoutStore.execute({
  type: 'move-elements',
  elementIds: ['title', 'north-arrow'],
  deltaX: 5,
  deltaY: 0,
});

const snapshot = layoutStore.getSnapshot();
```

只需要核心逻辑的测试或非 React 调用方可以直接使用 `stores/layoutStore.ts`；应用 UI 优先使用 `index.ts`。`actions` 是同一套 `execute` 命令的便捷封装，不另行实现规则。

### 状态约定

- 纸张和元素矩形使用毫米，元素坐标相对纸张左上角；页面显示缩放不改变这些坐标。
- `enabledElements` 同时表达可见元素及从底到顶的绘制顺序；关闭元素保留它的矩形，再启用时复用。
- 空选择合法；隐藏元素不会残留在选择集合中，也不会产生虚假的当前元素。
- 矩形始终约束在纸张范围内，最小尺寸为 8 × 6 mm；切换纸张时重新约束全部元素。
- 成组移动使用整个组的边界计算统一位移，碰到纸张边缘不会挤散元素；对齐以选择包围框为参照。
- 状态快照和嵌套矩形、数组在运行时冻结；调用者提供的矩形与地图中心会复制，不冻结调用者对象。无实际变化的命令不通知订阅者。
- 命令失败不提交部分状态。命令接口的校验不替代未来外部工具的权限、Schema 和安全检查。
- 拖拽处理单个 pointer ID，提交最终 `pointerup` 坐标；Escape / `pointercancel` 回滚本次拖拽。这里不是通用撤销历史。

## 4. 地图同步与生命周期

`LayoutMapPreview` 仅负责把容器、输入、布局选项和控制器宿主连接到 `LayoutMapRuntime`。OpenLayers 对象创建、增删图层、样式、裁剪范围、监听器和资源释放集中在适配器内。样式更新或控制器宿主变化不会重建整个地图。

布局适配器复用 `features/layers/adapters/openLayersLayerAdapter.ts`，而不是复制底图定义和图层顺序规则。为导出新增的可选 `crossOrigin` 参数只在布局调用方设置为 `anonymous`，不改变其他调用方的默认参数。服务端仍必须允许跨域，前端设置不能绕过服务器策略。

`LayoutMapInput` 是当前 GIS 状态的只读输入边界；底层仍使用现有 `gisStore` 和 `MapGroupRenderState`。这次没有迁移整个 GIS 状态管理，也没有改变其他地图引擎。

页面视图和独立的屏外导出视图通过文档中的 `mapView` 共享中心、旋转和每毫米对应的投影距离。数据范围变化时重新适配范围；纯样式变更不重置地图范围。页面显示缩放变化时重算屏幕分辨率，保留相应的地理尺度。

适配器负责释放 ResizeObserver、动画帧、地图事件、数据源加载事件、控制器和地图对象。数据更新或卸载会中止进行中的地图快照。同步失败后禁止导出旧的部分地图，直到成功同步。

## 5. 导出流程

```text
人工导出 / 公开 exportPaper
  → 导出控制器（就绪检查、互斥、AbortSignal）
  → LayoutExportSurface（已提交文档快照）
  → 地图运行时按目标尺寸渲染并等待 rendercomplete
  → 合成所有地图 canvas
  → 按文档元素顺序绘制页面
  → 返回 { blob, fileName, warnings }
  → UI 决定下载与显示警告
```

- 默认 PDF，可选 PNG，纸张输出使用 300 DPI；单画布最多 2500 万像素。
- PDF 是嵌入 JPEG 的单页栅格 PDF，纸张使用实际毫米尺寸，不是可编辑矢量 PDF。
- 地图快照合成所有可见地图画布，保留绘制顺序、变换与透明度，不再只选择面积最大的画布。
- 高分辨率快照同时调整地图分辨率、符号尺寸和经纬网；完成、失败或取消后恢复原来的尺寸、视图、样式和缩放约束。
- 比例尺从地图中心的地面分辨率计算，使用合适的 1/2/5 刻度；不是固定“500 km”。它是中心处局部比例尺，并不表示墨卡托整幅图的比例一致。
- 指北针与地图旋转关联。没有地图框时省略无法校验的比例尺并返回警告。
- 地图未就绪、15 秒内未完成渲染、可见数据源加载失败、跨域污染画布、图像编码失败都会明确报错；不输出替代地图伪装成功。
- 导出期间修改布局、修改 GIS 输入或卸载导出面会取消相应任务，避免混用不同时间点的文档和地图。取消信号为协作式，调用者仍需等待任务结束。
- 导出服务只返回结果。人工界面的下载由独立浏览器适配器执行，按钮在导出期间禁用，失败时展示原因。

## 6. 测试与验收

```bash
npm test -- src/features/layout
npm test
npm run build
```

专项测试覆盖布局几何、独立 store、参数失败原子性、不可变状态、普通 UI 调用、手势取消、地图生命周期、样式更新、渲染等待、画布合成、加载/CORS 失败、导出取消、PNG/PDF 编码和 PDF 字节偏移。

本阶段新增 90 项布局专项测试；全量 190 项测试和生产构建通过。OpenLayers 测试模拟地图渲染容器，使用真实 View、图层、样式和数据源对象；这不等同于浏览器图形驱动和真实网络瓦片的端到端验证。

发布前仍需在真实浏览器手动确认：

1. 三种纸张、Dockview 面板切换、页面缩放、标尺、框选、多边形选择、对齐和层级。
2. 不同底图、透明叠加、矢量与当前栅格、经纬网的预览与导出范围和符号表现。
3. PDF 打印尺寸、中文字体、PNG 清晰度，以及非标准屏幕 DPR 下的效果。
4. 慢网、拒绝 CORS 的数据源、瓦片失败、导出中修改数据或关闭面板。

## 7. 明确未包含的能力

- 自动制图、模型工具注册、AI 分析计划与执行确认流程。
- 布局模板持久化、通用撤销/重做、可编辑标题、图例设计器、多页和矢量 PDF。
- 导出任意 DOM 或第三方自定义元素；导出器只认识当前四类布局元素，不承诺逐像素复刻 UI 装饰。
- 自动纳入全部栅格或其他引擎专属图层：本阶段仍同步现有 GIS 输入中的当前栅格、分析结果、上传矢量与底图。
- 自动绕过 CORS 或弥补缺失的瓦片。数据源失败记录采取保守策略，可能需要刷新/重新加载数据源后再导出。
- 第三方依赖构建警告和整体 bundle 优化；不作为本次布局模块重构的附带修改。
