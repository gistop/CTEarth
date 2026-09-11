import type { BasemapId } from '../../maps/components/map/basemapOptions';
import type { CesiumImageryId } from '../../maps/components/map/cesiumLayerOptions';
import type { BasemapSourceKind } from '../../maps/components/map/rasterBasemapSources';
import type { RasterOverlay, UploadedLayer } from '../../../gisStore';
import type { MapGroupLayerItem } from '../types';

export type LayerGeometryKind = 'point' | 'line' | 'polygon' | 'mixed' | 'empty';

export type LayerListItem =
  | {
    id: string;
    kind: 'basemap';
    label: string;
    checked: boolean;
    basemapId: BasemapId;
    basemapSourceKind: BasemapSourceKind;
    cesiumImageryId: CesiumImageryId;
    opacity: number;
  }
  | {
    id: `uploaded:${string}`;
    kind: 'uploaded';
    layer: UploadedLayer;
    label: string;
    checked: boolean;
    geometryKind: LayerGeometryKind;
  }
  | {
    id: `raster:${string}`;
    kind: 'raster';
    raster: RasterOverlay;
    label: string;
    checked: boolean;
  }
  | {
    id: 'vectorOverlay';
    kind: 'vectorOverlay';
    label: string;
    checked: boolean;
    geometryKind: LayerGeometryKind;
  };

export type MapGroupLayerRow = {
  groupItem: MapGroupLayerItem;
  item: LayerListItem;
};
