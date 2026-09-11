export type BasemapId = 'osm' | 'tianditu' | 'esri';

export const defaultBasemapId: BasemapId = 'osm';

export const basemapOptions: { id: BasemapId; label: string }[] = [
  { id: 'osm', label: 'OpenStreetMap' },
  { id: 'tianditu', label: '天地图 WMTS' },
  { id: 'esri', label: 'Esri World Imagery' },
];

export function getBasemapLabel(basemapId: BasemapId) {
  return basemapOptions.find((option) => option.id === basemapId)?.label ?? basemapId;
}
