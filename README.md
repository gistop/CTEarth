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

## Technical Documentation

Developer notes live in `docs/`.

- `docs/map-projection.md`: language index for map engines, CRS conventions,
  supported projections, projection conversion rules, and development caveats.

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
