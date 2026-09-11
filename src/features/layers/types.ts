import type { LayerOrderId } from '../../gisStore';
import type { BasemapId } from '../maps/components/map/basemapOptions';
import type { CesiumImageryId } from '../maps/components/map/cesiumLayerOptions';
import type { BasemapSourceKind } from '../maps/components/map/rasterBasemapSources';

/**
 * Canonical identifiers used by the layer management feature.
 *
 * The concrete layer payloads still live in gisStore for backwards
 * compatibility with the rest of the application. This file contains the
 * feature-level contracts that should be used by new layer UI code.
 */
export type LayerNodeKind = 'group' | 'basemap' | 'raster' | 'vector' | 'overlay';

export type LayerVisibilityState = {
  visible: boolean;
  opacity?: number;
};

export type LayerAction =
  | { type: 'layer/select'; layerId: string | null }
  | { type: 'layer/set-visibility'; layerId: string; visible: boolean }
  | { type: 'layer/set-opacity'; layerId: string; opacity: number }
  | { type: 'layer/rename'; layerId: string; name: string }
  | { type: 'layer/remove'; layerId: string }
  | { type: 'layer/reorder'; layerId: string; targetId: string };

export type MapGroupLayerItemId = Exclude<LayerOrderId, 'raster'>;

export type MapGroupLayerItem = {
  instanceId: string;
  layerId: MapGroupLayerItemId;
  visible: boolean;
  basemapId?: BasemapId;
  basemapSourceKind?: BasemapSourceKind;
  cesiumImageryId?: CesiumImageryId;
  opacity?: number;
};

export type MapGroup = {
  id: string;
  name: string;
  displayVisible?: boolean;
  layerItems: MapGroupLayerItem[];
};
