# CTEarth GIS/RS Workbench

CTEarth is a web GIS and remote sensing workbench prototype. It uses a desktop-style Ribbon interface, dockable panels, and a MapLibre GL JS map view.

## Tech Stack

- React + TypeScript + Vite
- Dockview React for dockable workspace panels
- MapLibre GL JS for the online map view
- vite-plugin-pwa for PWA support
- Docker + Nginx for static Linux deployment
- Cloudflare Pages for static frontend deployment

## Layout

- Quick Access Toolbar
- Ribbon tabs and tool groups
- Dockable workspace
  - Contents / layers panel
  - Map panel
  - Symbol system / inspector panel
  - Python placeholder panel
- Status bar

## Development

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:5173/
```

If a previous PWA cache causes stale content during development, use a different port:

```bash
npm run dev -- --port 5174
```

## 文档

### 快速上手

- `docs/quick-start.zh-CN.md`：快速了解坐标系、数据上传、地图模式、编辑、分析与导出。

### 技术文档

Developer notes live in `docs/`.

- `docs/map-projection.md`：坐标系、地图引擎、CRS 约定、支持的投影、投影转换规则和开发注意事项。
- `docs/data-storage.md`: language index for vector import persistence, GeoJSON
  normalization, IndexedDB storage, and local restore behavior.
- `docs/ai-assistant.zh-CN.md`: AI assistant module boundaries, browser-direct
  model integration, GIS tool execution, credential handling, and limitations.
- `docs/layout.zh-CN.md`: map layout module boundaries, reusable document commands,
  OpenLayers lifecycle, PNG/PDF export, tests, and known limitations.
- `docs/digitize.zh-CN.md`: digitizing module boundaries, reusable edit sessions,
  data-port integration, snapping/tracing, engine lifecycle, and regression checks.
- `docs/attributes.zh-CN.md`: independent attribute-table module, sorting,
  selection, virtualized rows, and workspace integration.
- `docs/charts.zh-CN.md`: independent chart module, reusable statistical models,
  ECharts lifecycle, standalone integration, and limitations.
- `docs/data-views.zh-CN.md`: shared data-view contracts and filter coordination;
  neither table nor chart modules own the authoritative GIS data.

## Build

```bash
npm run build
```

The production output is generated in:

```txt
dist/
```

## Cloudflare Pages

Use these build settings:

```txt
Build command: npm run build
Output directory: dist
```

## Docker

Build and run:

```bash
docker build -t ctearth-gis-workbench .
docker run -p 8080:80 ctearth-gis-workbench
```

Open:

```txt
http://localhost:8080/
```

## Online Map

The current development basemap uses OpenStreetMap raster tiles through MapLibre GL JS:

```txt
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

For production use, replace the basemap with a service you own or are licensed to use. A future backend can provide proxied map services, authenticated map styles, GIS processing APIs, and remote sensing task execution.

## Notes

The Python panel is currently a UI placeholder only. Python execution, GIS processing, and remote sensing algorithms should be implemented later through a backend service such as FastAPI running in Docker.
