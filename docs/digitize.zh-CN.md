# 数字化编辑模块

## 1. 职责与范围

规范目录为 `src/features/digitize/`，稳定公开入口为 `index.ts`。本阶段将原 `src/components/digitize/` 的大组件以及 `App.tsx` 内的编辑 Ribbon、栅格编辑控件迁入独立 Feature；旧目录已删除，不保留兼容转发。

模块负责编辑工具状态、当前手势、编辑会话、要素绘制与节点修改、捕捉和公共边自动完成、结果校验与提交/取消。传统人工操作继续可用，业务服务也可由普通代码调用；不需要 AI，不依赖特定模型。

与地理数据管理的边界：

- **编辑模块决定“怎样修改”**：选择工具、维护临时几何、校验编辑结果、提交或取消当前操作。
- **数据能力决定“数据如何保存与共享”**：权威图层、字段等派生信息、文件读写、格式转换与工作区持久化继续由现有 GIS 数据通路维护。
- `DigitizeDataPort` 是两者之间的调用契约，不是另一套数据仓库。未来独立数据管理 Feature 落地时，替换这个端口的适配，不必重写绘制算法和手势。
- 目前栅格 AOI 是编辑模块的临时输入；真正的像元计算、GeoTIFF 保存仍复用既有 `editRasterByAoi`、`saveRasterLayer`，没有复制栅格处理引擎。

## 2. 源码组织

```text
src/features/digitize/
├─ components/
│  ├─ DigitizeProvider.tsx          # GIS 数据端口桥接，也支持注入端口和 store
│  ├─ DigitizeRibbon.tsx            # 编辑工具组、目标选择和工具协调
│  ├─ RasterEditControls.tsx        # AOI、像元参数、执行与保存入口
│  ├─ DigitizeMap.tsx               # 懒加载编辑地图
│  └─ OpenLayersDigitizeMap.tsx     # React 到运行时的生命周期桥接
├─ stores/
│  ├─ digitizeStore.ts              # 无 React 依赖的工具状态和命令
│  ├─ DigitizeContext.tsx           # useSyncExternalStore 订阅和服务注入
│  └─ useDigitizeMapInput.ts        # 读取图层状态，生成渲染输入快照
├─ services/
│  ├─ digitizeStateService.ts       # 纯状态转换、工具互斥和状态文本
│  ├─ digitizeEditService.ts        # 编辑会话、冲突检查、提交和清空
│  ├─ digitizeValidation.ts         # GeoJSON/AOI 结构、环拓扑和像元值校验
│  ├─ geometryTopologyService.ts    # 线段关系、环自交/折返/退化校验
│  ├─ boundaryNodingService.ts      # 公共节点归一、交点打断、共享线段细分
│  └─ sharedBoundaryService.ts      # 边界图、最短路径和公共边拼接
├─ adapters/
│  ├─ gisDigitizeDataAdapter.ts     # 接入既有数据更新函数
│  ├─ openLayersDigitizeAdapter.ts  # 引擎运行时、Draw/Modify/Select/Snap
│  ├─ openLayersDigitizeLayers.ts   # 临时图层、参考图层、栅格和底图同步
│  ├─ openLayersDigitizeCodec.ts    # 投影转换、共享坐标保真、属性与行序保留
│  ├─ openLayersBoundaryAdapter.ts  # 同次绘制涉及的可编辑邻环节点同步
│  ├─ digitizeViewportAdapter.ts   # 与主地图双向视口同步及导航
│  ├─ digitizeMapStyles.ts         # 编辑、参考、选择与 AOI 样式
│  └─ digitizeMapTypes.ts          # 运行时输入和回调契约
├─ testing/                       # 测试数据与内存端口，不属于生产入口
├─ types.ts                       # 不依赖引擎的领域类型
└─ index.ts                       # 公开入口
```

测试文件与被测代码放在相邻目录。Store、编辑服务和公共边服务均不依赖 React、地图实例或模型 SDK。地图引擎的具体 API 只在适配层使用；底图同步复用图层模块的 OpenLayers 次级入口，避免复制底图协议。

## 3. 数据与状态流

```text
人工 Ribbon / 普通程序调用
  ├─ 状态命令 → digitizeStore → React 订阅 → 编辑运行时
  └─ 编辑服务 → DigitizeDataPort → 既有 GIS 数据更新通路

OpenLayers 绘制 / 修改
  → 开始编辑会话（绑定目标和数据快照）
  → 引擎内部临时几何变化
  → 公共边自动完成时同步当前图层的共享节点
  → 投影平面校验、编码、GeoJSON 校验和会话冲突检查
  → 数据端口提交
  → 权威数据更新 → 主地图、编辑视图、属性表和原持久化通路
```

`digitizeStore` 只保存工具状态、计数、提示与临时 AOI。OpenLayers Source 是编辑视图的临时表示，不是数据源。业务 GeoJSON 不被 Store 冻结或直接就地修改。

完成一次绘制或一次节点拖动即提交，保留现有使用方式；`Save`/`Save As` 是显式文件保存，不是“确认整个编辑会话”。`Escape`、切换目标、离开编辑模式、隐藏编辑地图会取消未完成手势，**不会撤销已提交的数据**。清空图层是一次真实提交，不由地图组件读取计数器后执行，也不会在重新挂载时重放。

## 4. 公开调用契约

### 4.1 普通代码调用

```ts
import { createDigitizeEditService, type DigitizeDataPort } from './features/digitize';

export function appendFeature(port: DigitizeDataPort, feature: unknown) {
  const edits = createDigitizeEditService(port);
  const session = edits.beginEdit();
  try {
    return edits.commit(session, [...session.base.features, feature]);
  } finally {
    edits.cancel(session);
  }
}
```

不需要通过按钮点击或地图对象模拟操作。调用方负责构造合法 GeoJSON Feature，服务仍执行相同的目标检查和结果校验。

| 接口 | 契约 |
|---|---|
| `beginEdit()` | 绑定当前可编辑目标及 GeoJSON 引用快照；提交时要求目标仍为当前图层。 |
| `beginEdit(layerId)` | 显式绑定指定图层；提交不要求该图层处于活动状态，但仍检查存在性、数据快照和几何类型。 |
| `commit(session, features)` | 提交完整要素数组；不是增量补丁。校验通过后复制结果并调用端口；成功关闭会话，相同内容不产生写入。 |
| `cancel(session)` | 幂等结束服务会话，不写数据；失败后的会话由调用方取消或重新整理后重试。 |
| `clearFeatures(layerId?)` | 使用相同会话/校验通路提交空要素集合，不需要地图已经挂载。 |
| `createDigitizeStore()` | 创建独立状态容器，提供 `getSnapshot`、`subscribe`、`execute` 与类型化 `actions`。 |
| `DigitizeProvider` | 默认连接现有 GIS Store；可注入 `port` 和 `store` 供集成或测试使用。 |
| `DigitizeMap` | 懒加载编辑视图；通过 ref 暴露定位、缩放、朝北及主地图视口同步，不暴露引擎实例。 |
| `useDigitizeRibbonGroups(active)` | 生成原有人工工具组，并协调编辑页签状态与目标几何类型。 |

### 4.2 数据端口

```ts
interface DigitizeDataPort {
  getActiveLayer(): DigitizeEditableLayer | null;
  getLayer(layerId: string): DigitizeEditableLayer | null;
  replaceFeatures(
    layerId: string,
    next: DigitizeFeatureCollection,
    expected: DigitizeFeatureCollection,
  ): void;
}
```

端口实现必须遵守：

1. 对外暴露不可就地修改的快照；数据变化使用新 GeoJSON 引用，不允许悄悄修改 `session.base`。
2. `replaceFeatures` 在接受写入前检查 `expected` 是否仍是当前数据，冲突时抛错，不覆盖新数据。
3. 接受写入后，后续读取应能够观察到新快照；失败不能伪装成成功。
4. 派生字段、选择状态、保存和通知由数据拥有方处理，编辑服务不复制这些职责。

当前 `gisDigitizeDataAdapter` 通过一个短期 pending 记录衔接 React 提交间隙，后续 GIS 快照到达即清理；不是长期数据副本。它沿用 `updateUploadedLayerGeoJson` 的同步调用契约及既有副作用。这里的保护是**浏览器进程内、基于不可变快照的乐观检查**，不是数据库事务、跨标签页锁或多人协同版本协议。现有 GIS 更新函数异步排队状态的事实没有改变；如果未来接入异步远端存储，应显式扩展端口的版本与异步事务契约。

AI 工具若未来需要编辑，应调用同一服务，并在工具编排层实现权限、计划确认与审计。本次没有注册新的 AI 编辑工具，也没有引入任何模型协议。

## 5. 几何、属性与投影边界

- 数据使用既有 WGS84 GeoJSON，编辑引擎使用 EPSG:3857。导入格式和数据 CRS 规范化仍归现有数据通路；这里不自动猜测任意坐标系。
- 编解码器仅把几何装入 OpenLayers Feature，使用 WeakMap 保留业务记录，不把 `_style`、图层 ID、选择标记等引擎元数据写入业务属性。
- 业务 `id` 不作为 OpenLayers Source 的内部 ID，重复业务 ID 不会导致要素被 Source 丢弃。合法的用户字段（包括 `_style`、`geometry`）保持原义。
- 未改动要素返回原始记录的副本，避免无意义的投影往返精度变化；修改几何时保留 ID、属性和要素扩展成员，移除失效的要素 bbox。集合发生变化时移除旧集合 bbox，保留其他集合扩展成员。
- 编码按读取时的要素顺序恢复行序，新要素追加在后，避免 Source 空间索引重排导致属性表行号错位。共享 XY 节点优先复用当前编辑快照中的原始经纬度；新节点统一回写，同一个公共节点不因不同要素的投影往返而出现细小坐标差异。
- 校验包括有限数值、基本顶点数量、闭合环、Feature 结构和已声明的几何类型族，以及每个多边形环的自交、自接触、重复边、折返和退化；AOI 同样接受环校验。引擎编码前检查投影坐标，编辑服务提交前检查 GeoJSON 坐标，普通程序调用也不能绕过后者。**这仍不是完整多边形拓扑校验**：不验证洞的包含关系、不同环之间的交叉或要素间的重叠，合法重叠图层不会因此被禁止。
- Snap 作用于当前编辑和可见参考要素。公共边自动完成使用 Polygon/MultiPolygon 的环（包含洞边界），把落在他边上的既有顶点、重叠线段端点及边界交点打断为公共节点，再把绘制起止点插入所有匹配边；图中不保留跨过中间节点的旧长边。求路时排除与绘制线非法相交、重合的边，选择安全路径，拼接后再次校验环。参考几何或可见性变化会取消依赖旧边界的手势。
- 起止点没有匹配边界或边界不连通时，保留普通闭合绘制并接受同样的提交校验；边界已连通但找不到安全补齐路径时，明确报错并取消本次手势，不将失败路径当作成功结果保存。
- 成功自动完成时，只对**与新面共享线段的当前编辑图层邻环**同步中间节点，与新要素一起提交。未涉及的要素、洞和多部件保持原样。参考图层只参与捕捉和求路，不会被写入；跨图层导出边界完全一致仍需未来的多图层编辑契约。
- 追踪吸附容差按编辑视图分辨率换算（当前为 18 像素），不是测地距离；节点归一使用独立的 `1e-6` 投影单位精度容差，只消除计算舍入误差，不再将坐标量化到三位小数，也不将真实间隙按鼠标吸附容差合并。路径判断仅使用 XY；邻环新增节点的附加坐标沿原线段插值，二维绘制不会被参考面的高程强制变为三维。不提供高程感知的三维追踪，三维绘制缺少必要边界附加坐标时拒绝补齐，不凭空填值。
- 栅格像元值允许零、负数和小数；空输入不能当作零。实际范围、NoData 和栅格计算结果仍由原处理能力负责。

## 6. 运行时与错误处理

- React 桥接仅创建/销毁运行时并同步输入；提示、计数和样式更新不重建地图。改变目标或数据会取消旧手势，避免过期闭包写错图层。
- Draw 不使用自动写入 Source 后延时提交；完成事件中校验手势身份并同步提交，取消后到达的旧完成事件不能写入。补齐、邻环同步、编码或提交失败时恢复整个临时编辑 Source，新增面与邻面节点修改一并丢弃，并显示可理解的错误原因。
- Modify 每次开始重新建立会话；失败或冲突时恢复临时几何并给出状态提示。不静默覆盖外部新快照。
- AOI 不提交为矢量要素。取消或无效 AOI 不污染业务图层。
- 地图隐藏时停用编辑交互；按 Escape 只取消当前手势，不截获输入框的 Escape。
- 视口桥接使用输入/输出指纹和同步发布保护，避免双向反馈。首次导入主地图视口前不向主地图回写默认视图；保留现有朝北和俯仰归零约定。
- 运行时释放 Draw/Modify/Select/Snap、数据源、图层、键盘/地图监听、ResizeObserver、动画帧和地图目标；dispose 可重复调用。
- 结构异常的图层导致交互暂停并显示原因；后续合法快照可以恢复，不继续提交半同步结果。

## 7. 验证与验收

```sh
npm test -- src/features/digitize
npm test
npm run build
```

自动化覆盖状态互斥、端口与会话冲突、显式目标和清空、几何校验、公共边拼接、属性保真/重复 ID、引擎提交与取消、参考图层变化、AOI 隔离、视口双向同步、隐藏/释放以及 React Provider/Ribbon/地图桥接。公共边回归数据使用 `testing/sharedBoundaryRegression.ts` 中的真实三面案例，验证第三个面不再经由错误顶点折返，并覆盖 T 型连接、重叠边细分、交点、同边双端点、反向环、微小真实间隙、安全绕路、共享经纬度、行序、附加坐标以及失败后整次回滚和重试。

引擎集成测试保留真实 OpenLayers 几何、Source、图层和交互对象，仅替换 Map 渲染宿主；组件测试使用 jsdom。这些测试不等同于真实浏览器中的鼠标命中、瓦片网络、WebGL 或 WASM 栅格端到端验收。

浏览器人工回归清单：

1. 新建点/线/面图层，分别绘制、修改节点，观察主地图与属性表同步，保存并重新导入 GeoJSON。
2. 在绘制和拖动期间切换目标图层、切出编辑页签、按 Escape；确认未完成内容没有进入原图层或新图层。
3. 显隐参考图层及地图组，切换 Snap，沿外边界和洞边界完成面；样式变化不终止正常绘制。
4. 清空当前图层后重开地图面板；确认不重复清空其他图层，工具状态与目标一致。
5. 加载栅格、绘制 AOI，输入零/负数/小数执行修改；空输入不可执行，保存 GeoTIFF 后检查结果。
6. 编辑与浏览模式互切，缩放/定位/朝北、调整面板大小；确认视口不跳回默认位置，重开面板不叠加交互和监听。
7. 沿两个相邻面自动完成第三个面，尤其覆盖“一个面的顶点位于另一个面的长边内部”的情况；在属性表逐行选中，确认无折返尖刺，保存并重导后公共边仍一致。
8. 故意绘制自交面或将节点拖出折返边；确认出现错误提示、要素数量不增加、临时几何与邻面节点一起恢复，随后可以重新编辑。

## 8. 当前限制

本阶段是模块化与可靠性重构，不包含完整撤销/重做、长期编辑历史、协同编辑、完整拓扑规则、后台异步编辑事务、自动 AI 编辑或独立地理数据管理 Feature。现有栅格计算与持久化结构没有重写。大要素集合仍使用整层编码与提交，不能据此承诺大数据增量编辑性能。

本次补丁提供公共边局部节点同步和单环合法性检查，不是全层面覆盖拓扑清理，也不是节点拖动时的跨要素拓扑锁定编辑。线段检测存在二次复杂度的最坏情况；大规模边界的空间索引、增量校验与后台计算需单独设计。

已有项目不会在打开、显示或选中时被静默重写。历史自交要素仍保留原样；后续提交遇到无效环会被拦截，应先备份，再修改、重绘相关要素或导入修正后的 GeoJSON。本补丁防止新错误写入，不把显示高亮当作数据修复。
