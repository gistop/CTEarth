# Map and Projection Development Notes

This document records the map rendering stack, CRS conventions, projection support,
and implementation caveats for CTEarth. It is a development document, not an end
user manual.

## Purpose

CTEarth uses multiple map engines because different workflows need different
rendering and editing capabilities. The important rule is that data storage,
map API coordinates, and display projection are not always the same thing.

When changing map, import, export, digitizing, or layout code, check this file
first.

## Default Display CRS

The default display CRS is `EPSG:3857` (Web Mercator).

This is the baseline projection for the general-purpose WebGIS browsing
experience. It matches the current MapLibre main map path and the Web Mercator
tile services used by the default basemaps.

## Map Engines

| Area | Library | Current role | Display CRS |
| --- | --- | --- | --- |
| Main 2D map | MapLibre GL JS | Online basemap, uploaded layer display, normal map browsing | EPSG:3857 (Web Mercator) |
| Digitizing map | OpenLayers | Vector editing, snapping, AOI editing, synchronized with MapLibre | EPSG:3857 (Web Mercator) |
| Layout preview | OpenLayers | Print/layout preview, scale bar, graticule, north arrow | EPSG:3857 (Web Mercator) |
| Projection map panel | OpenLayers | Alternate CRS display panel | EPSG:4326 or EPSG:32651 |
| 3D/globe view | Cesium | Terrain/globe mode | WGS84 lon/lat API, Cesium internal globe rendering |

Related source files:

- `src/components/MapPanel.tsx`
- `src/components/digitize/OpenLayersDigitizeMap.tsx`
- `src/components/layout/LayoutMapPreview.tsx`
- `src/components/map/OpenLayersProjectionMap.tsx`
- `src/components/map/MapCommandContext.tsx`
- `src/geoParquet.ts`
- `src/gisStore.tsx`

## CRS Terminology

| CRS | Meaning | Where used |
| --- | --- | --- |
| EPSG:4326 | WGS84 longitude/latitude in degrees | GeoJSON data, imported vector data, MapLibre API coordinates, persisted vector geometry |
| EPSG:3857 | Web Mercator meters | MapLibre visual display, OpenLayers digitizing view, OpenLayers layout preview |
| EPSG:32651 | WGS 84 / UTM zone 51N meters | Optional OpenLayers projection display |

Unless a function explicitly says otherwise, uploaded vector layer geometry should
be treated as EPSG:4326.

## Current Supported Display CRS

The display CRS options are defined by `DisplayCrsId`:

```ts
export type DisplayCrsId = 'webMercator' | 'wgs84' | 'epsg32651';
```

Current UI options:

| Display option | Engine | Projection |
| --- | --- | --- |
| `webMercator` | MapLibre | EPSG:3857 display, EPSG:4326 lon/lat API |
| `wgs84` | OpenLayers projection panel | EPSG:4326 |
| `epsg32651` | OpenLayers projection panel | EPSG:32651 |

Important implementation detail: selecting `webMercator` uses the normal MapLibre
map panel. Selecting `wgs84` or `epsg32651` opens the OpenLayers projection panel.

## Data CRS Convention

### Vector Layers

Vector layers are stored and passed around as GeoJSON in EPSG:4326.

OpenLayers readers convert from data CRS to view CRS:

```ts
format.readFeatures(geojson, {
  dataProjection: 'EPSG:4326',
  featureProjection: projectionCode,
});
```

In the digitizing and layout views, `featureProjection` is usually `EPSG:3857`.
In the projection panel, `featureProjection` is the selected display projection.

### Raster Overlays

Raster overlays keep georeferencing metadata from GeoTIFF/COG input, including:

- `epsg`
- `geoTransform`
- `width`
- `height`
- `nodata`
- pixel values

For display overlays, the app derives corner coordinates in EPSG:4326 and then
projects those corners into the active display CRS.

Do not assume raster pixels are natively EPSG:4326. Use the raster metadata and
existing conversion helpers.

### GeoParquet

GeoParquet import normalizes recognized CRS metadata to EPSG:4326 before the
geometry is added to the app. If the file declares an unknown CRS and coordinates
do not look like lon/lat, import should fail rather than silently render wrong
geometry.

This behavior is intentional. Rendering unknown projected coordinates as
longitude/latitude can put features thousands of kilometers away.

## MapLibre Projection Notes

MapLibre GL JS renders the main planar map in Web Mercator. Application code
passes centers and mouse coordinates as longitude/latitude:

```ts
center: CHINA_CENTER
event.lngLat.lng
event.lngLat.lat
```

Treat MapLibre API coordinates as EPSG:4326, even though the visible map is
Web Mercator.

Basemap tile sources are Web Mercator tile services:

- OpenStreetMap raster tiles
- Tianditu `*_w` WMTS tiles
- Esri World Imagery tiles

Note: Tianditu WMTS is a third-party cross-origin tile service. In some network environments, proxies, or VPNs, the browser may block it because the response does not include an `Access-Control-Allow-Origin` header.

If a non-Web-Mercator tile source is added later, it should not be wired into the
current MapLibre basemap path without a separate compatibility check.

## OpenLayers Projection Notes

OpenLayers is used where explicit projection control is needed.

### Digitizing View

The digitizing map uses an OpenLayers `View` with the default Web Mercator
projection. Code uses `fromLonLat`, `toLonLat`, and `transformExtent` to sync
with MapLibre.

Key rule: editing happens visually in EPSG:3857, but committed GeoJSON should
remain EPSG:4326.

### Layout Preview

The layout preview also uses Web Mercator. Scale bar, graticule, vector overlays,
and raster overlays are rendered in the same map view.

Graticule labels are visual aids. Do not treat their display as proof that the
stored geometry is in the map view CRS.

### Projection Panel

The projection panel creates an OpenLayers `View` with:

```ts
projection: projectionCode
```

`projectionCode` is currently:

- `EPSG:4326` for `wgs84`
- `EPSG:32651` for `epsg32651`

Incoming vector data still uses `dataProjection: 'EPSG:4326'`; OpenLayers
converts it into the selected view projection.

## Conversion Rules

Use library projection helpers instead of hand-written formulas.

| Conversion | Preferred helper |
| --- | --- |
| lon/lat to Web Mercator | `fromLonLat` from `ol/proj.js` |
| Web Mercator to lon/lat | `toLonLat` from `ol/proj.js` |
| extent conversion | `transformExtent` from `ol/proj.js` |
| arbitrary OpenLayers CRS conversion | `transform` from `ol/proj.js` |
| raster/vector processing CRS conversion | `geolibre-wasm` helpers such as `transform_points_epsg` |

Avoid ad hoc coordinate math unless the CRS is trivial and the assumptions are
documented next to the code.

## Development Caveats

- Keep persisted GeoJSON in EPSG:4326 unless a feature explicitly introduces CRS
  metadata and every consumer is updated.
- Do not feed EPSG:3857 coordinates into MapLibre `center`, `fitBounds`, or
  GeoJSON sources without converting them back to lon/lat.
- Do not assume `[x, y]` always means `[longitude, latitude]`. In projected CRS
  views, it may mean meters.
- Do not assume every raster input is EPSG:4326. Use the GeoTIFF/COG EPSG and
  geotransform metadata.
- When adding a new display CRS, update the display CRS type, UI options,
  projection mapping, coordinate formatting, layer conversion path, and tests or
  manual verification notes.
- When adding a new basemap provider, verify its tile matrix set and projection.
  The current basemap path assumes Web Mercator tiles.
- Keep MapLibre/OpenLayers synchronization explicit. Their zoom levels and camera
  concepts are similar but not identical.

## Adding a New Projection

Before adding another projection, confirm:

1. OpenLayers can resolve the projection code directly, or `proj4` registration
   is added.
2. Every layer source has a clear data CRS.
3. Vector `dataProjection` and `featureProjection` are set at read/write
   boundaries.
4. Raster extents are transformed from the raster's source CRS through a known
   path.
5. Coordinate readouts include correct units and precision.
6. Basemap availability is checked for that projection.

If the new projection is only for analysis/export, avoid making it a display CRS
until the rendering path is verified.

## Quick Mental Model

Use this model when debugging projection issues:

```txt
Imported vector data
  -> normalize/store as EPSG:4326 GeoJSON
  -> render through MapLibre or OpenLayers display projection

Imported raster data
  -> keep raster CRS metadata and pixels
  -> derive lon/lat display corners or transform AOI into raster CRS when needed

MapLibre main map
  -> API lon/lat, visual Web Mercator

OpenLayers maps
  -> View projection controls visual coordinates
  -> GeoJSON format converts dataProjection to featureProjection
```
