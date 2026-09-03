# 地图与投影开发说明

本文档记录 CTEarth 的地图渲染技术栈、坐标参考系约定、当前支持的投影，以及开发时需要注意的实现边界。它是技术开发文档，不是终端用户使用手册。

## 文档目的

CTEarth 同时使用多个地图引擎，是因为不同工作流对渲染、编辑、布局和三维显示的要求不同。开发时最重要的一点是：数据存储坐标、地图 API 坐标、屏幕显示投影不一定是同一个东西。

修改地图显示、数据导入导出、矢量编辑、布局预览或栅格处理相关代码前，建议先检查本文档。

## 默认显示 CRS

默认显示 CRS 为 `EPSG:3857`（Web Mercator）。

这是通用 WebGIS 浏览体验的基准显示投影。它与当前 MapLibre 主地图路径一致，也与默认底图使用的 Web Mercator 瓦片服务一致。

## 地图引擎分工

| 区域 | 技术库 | 当前职责 | 显示 CRS |
| --- | --- | --- | --- |
| 主二维地图 | MapLibre GL JS | 在线底图、上传图层显示、常规地图浏览 | EPSG:3857（Web Mercator） |
| 数字化地图 | OpenLayers | 矢量编辑、捕捉、AOI 编辑，并与 MapLibre 同步 | EPSG:3857（Web Mercator） |
| 布局预览 | OpenLayers | 出图/布局预览、比例尺、经纬网、指北针 | EPSG:3857（Web Mercator） |
| 投影视图面板 | OpenLayers | 备用 CRS 显示面板 | EPSG:4326 或 EPSG:32651 |
| 三维/地球视图 | Cesium | 地形和地球模式 | WGS84 经纬度 API，Cesium 内部地球渲染 |

相关源码文件：

- `src/components/MapPanel.tsx`
- `src/components/digitize/OpenLayersDigitizeMap.tsx`
- `src/components/layout/LayoutMapPreview.tsx`
- `src/components/map/OpenLayersProjectionMap.tsx`
- `src/components/map/MapCommandContext.tsx`
- `src/geoParquet.ts`
- `src/gisStore.tsx`

## CRS 术语

| CRS | 含义 | 使用位置 |
| --- | --- | --- |
| EPSG:4326 | WGS84 经纬度，单位为度 | GeoJSON 数据、导入后的矢量数据、MapLibre API 坐标、持久化矢量几何 |
| EPSG:3857 | Web Mercator，单位为米 | MapLibre 可视化显示、OpenLayers 数字化视图、OpenLayers 布局预览 |
| EPSG:32651 | WGS 84 / UTM zone 51N，单位为米 | 可选 OpenLayers 投影显示 |

除非函数或数据结构明确说明，上传矢量图层的几何坐标都应按 EPSG:4326 处理。

## 当前支持的显示 CRS

显示 CRS 选项由 `DisplayCrsId` 定义：

```ts
export type DisplayCrsId = 'webMercator' | 'wgs84' | 'epsg32651';
```

当前 UI 选项：

| 显示选项 | 引擎 | 投影 |
| --- | --- | --- |
| `webMercator` | MapLibre | EPSG:3857 显示，EPSG:4326 经纬度 API |
| `wgs84` | OpenLayers 投影视图面板 | EPSG:4326 |
| `epsg32651` | OpenLayers 投影视图面板 | EPSG:32651 |

重要实现细节：选择 `webMercator` 时使用普通 MapLibre 地图面板；选择 `wgs84` 或 `epsg32651` 时使用 OpenLayers 投影视图面板。

## 数据 CRS 约定

### 矢量图层

矢量图层在应用内部以 EPSG:4326 的 GeoJSON 存储和传递。

OpenLayers 读取时会在数据 CRS 和视图 CRS 之间转换：

```ts
format.readFeatures(geojson, {
  dataProjection: 'EPSG:4326',
  featureProjection: projectionCode,
});
```

在数字化视图和布局预览中，`featureProjection` 通常是 `EPSG:3857`。在投影视图面板中，`featureProjection` 是当前选择的显示投影。

### 栅格叠加层

栅格叠加层会保留 GeoTIFF/COG 输入中的地理参考元数据，包括：

- `epsg`
- `geoTransform`
- `width`
- `height`
- `nodata`
- 像元值

用于显示时，应用会派生出 EPSG:4326 下的角点坐标，然后再把角点投影到当前显示 CRS。

不要假设栅格像元原生就是 EPSG:4326。应使用栅格元数据和已有转换辅助函数。

### GeoParquet

GeoParquet 导入会根据可识别的 CRS 元数据，把几何归一化到 EPSG:4326 后再加入应用。如果文件声明了未知 CRS，并且坐标看起来也不像经纬度，导入应该失败，而不是静默地把错误坐标渲染出来。

这是有意设计。把未知投影坐标当成经纬度渲染，可能会让要素偏移到几千公里之外。

## MapLibre 投影说明

MapLibre GL JS 的主平面地图按 Web Mercator 渲染。应用代码传入的中心点和鼠标坐标是经纬度：

```ts
center: CHINA_CENTER
event.lngLat.lng
event.lngLat.lat
```

因此，应把 MapLibre API 坐标视为 EPSG:4326，即使可见地图是 Web Mercator。

当前底图瓦片源是 Web Mercator 瓦片服务：

- OpenStreetMap 栅格瓦片
- 天地图 `*_w` WMTS 瓦片
- Esri World Imagery 瓦片

补充说明：天地图 WMTS 属于第三方跨域瓦片服务，在某些网络环境、代理或 VPN 下可能因为缺少 `Access-Control-Allow-Origin` 响应头而被浏览器拦截。

如果后续增加非 Web Mercator 的瓦片源，不应直接接入当前 MapLibre 底图路径，需要先单独确认兼容性。

## OpenLayers 投影说明

OpenLayers 用在需要显式控制投影的地方。

### 数字化视图

数字化地图使用 OpenLayers `View` 的默认 Web Mercator 投影。代码通过 `fromLonLat`、`toLonLat` 和 `transformExtent` 与 MapLibre 同步。

关键规则：编辑时在 EPSG:3857 中显示和交互，但提交后的 GeoJSON 应保持 EPSG:4326。

### 布局预览

布局预览也使用 Web Mercator。比例尺、经纬网、矢量叠加层和栅格叠加层都渲染在同一个地图视图中。

经纬网标签只是视觉辅助。不要把经纬网显示当成“存储几何就是视图 CRS”的依据。

### 投影视图面板

投影视图面板创建 OpenLayers `View` 时会设置：

```ts
projection: projectionCode
```

当前 `projectionCode` 为：

- `wgs84` 对应 `EPSG:4326`
- `epsg32651` 对应 `EPSG:32651`

输入矢量数据仍然使用 `dataProjection: 'EPSG:4326'`，OpenLayers 会把它转换到当前选择的视图投影中。

## 转换规则

优先使用库提供的投影转换工具，不要手写投影公式。

| 转换 | 推荐辅助函数 |
| --- | --- |
| 经纬度转 Web Mercator | `ol/proj.js` 的 `fromLonLat` |
| Web Mercator 转经纬度 | `ol/proj.js` 的 `toLonLat` |
| 范围转换 | `ol/proj.js` 的 `transformExtent` |
| OpenLayers 任意 CRS 转换 | `ol/proj.js` 的 `transform` |
| 栅格/矢量处理 CRS 转换 | `geolibre-wasm` 中的 `transform_points_epsg` 等辅助函数 |

除非 CRS 非常简单，并且假设已经写在代码旁边，否则不要使用临时坐标公式。

## 开发注意事项

- 持久化 GeoJSON 默认保持 EPSG:4326，除非某个功能明确引入 CRS 元数据，并且所有消费者都同步更新。
- 不要把 EPSG:3857 坐标直接传给 MapLibre 的 `center`、`fitBounds` 或 GeoJSON source，必须先转回经纬度。
- 不要假设 `[x, y]` 永远代表 `[longitude, latitude]`。在投影坐标视图中，它可能表示米。
- 不要假设所有栅格输入都是 EPSG:4326。应使用 GeoTIFF/COG 的 EPSG 和 geotransform 元数据。
- 新增显示 CRS 时，需要同步更新显示 CRS 类型、UI 选项、投影映射、坐标格式化、图层转换路径，以及测试或手动验证说明。
- 新增底图服务时，需要确认瓦片矩阵集和投影。当前底图路径默认使用 Web Mercator 瓦片。
- MapLibre 和 OpenLayers 的同步逻辑应保持显式。二者的 zoom 和相机概念相似，但并不完全相同。

## 新增投影前检查

新增投影前应确认：

1. OpenLayers 可以直接识别该投影代码，或者已经添加 `proj4` 注册。
2. 每个图层源都有明确的数据 CRS。
3. 矢量读写边界正确设置 `dataProjection` 和 `featureProjection`。
4. 栅格范围可以从栅格源 CRS 通过明确路径转换。
5. 坐标读数的单位和精度正确。
6. 底图是否支持该投影已经确认。

如果新投影只用于分析或导出，建议先不要把它做成显示 CRS，除非渲染路径已经验证。

## 快速心智模型

排查投影问题时，可以按下面的模型理解：

```txt
导入矢量数据
  -> 归一化/存储为 EPSG:4326 GeoJSON
  -> 通过 MapLibre 或 OpenLayers 的显示投影渲染

导入栅格数据
  -> 保留栅格 CRS 元数据和像元值
  -> 显示时派生经纬度角点，或在分析时把 AOI 转到栅格 CRS

MapLibre 主地图
  -> API 使用经纬度，可视化显示为 Web Mercator

OpenLayers 地图
  -> View projection 控制可视化坐标
  -> GeoJSON format 负责从 dataProjection 转为 featureProjection
```
