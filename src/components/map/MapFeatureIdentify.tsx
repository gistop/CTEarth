import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useGis } from '../../gisStore';
import { createIdentifyPopupElement, getIdentifiedFeature } from './identifyFeature';

type MapFeatureIdentifyProps = {
  active: boolean;
  map: maplibregl.Map | null;
  mapReady: boolean;
};

const identifyTolerancePx = 6;

export function MapFeatureIdentify({ active, map, mapReady }: MapFeatureIdentifyProps) {
  const { layers, uploadedLayerVisibility } = useGis();
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!mapReady || !map || !active) {
      popupRef.current?.remove();
      popupRef.current = null;
      return undefined;
    }

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = 'help';

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      const candidate = queryIdentifiableFeature(map, event, layers, uploadedLayerVisibility);

      if (!candidate) {
        popupRef.current?.remove();
        popupRef.current = null;
        return;
      }

      const identified = getIdentifiedFeature(layers, candidate.layerId, candidate.featureIndex);

      if (!identified) {
        return;
      }

      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        className: 'map-identify-maplibre-popup',
        offset: 12,
      })
        .setLngLat(event.lngLat)
        .setDOMContent(createIdentifyPopupElement(identified))
        .addTo(map);
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
      popupRef.current?.remove();
      popupRef.current = null;
      canvas.style.cursor = previousCursor;
    };
  }, [active, layers, map, mapReady, uploadedLayerVisibility]);

  return null;
}

function queryIdentifiableFeature(
  map: maplibregl.Map,
  event: maplibregl.MapMouseEvent,
  layers: ReturnType<typeof useGis>['layers'],
  uploadedLayerVisibility: ReturnType<typeof useGis>['uploadedLayerVisibility'],
) {
  const queryLayerIds = layers
    .filter((layer) => uploadedLayerVisibility[layer.id] ?? true)
    .flatMap((layer) => uploadedIdentifyLayerIds(layer.id))
    .filter((layerId) => Boolean(map.getLayer(layerId)));

  if (queryLayerIds.length === 0) {
    return null;
  }

  const point = event.point;
  const features = map.queryRenderedFeatures(
    [
      [point.x - identifyTolerancePx, point.y - identifyTolerancePx],
      [point.x + identifyTolerancePx, point.y + identifyTolerancePx],
    ],
    { layers: queryLayerIds },
  );

  for (const feature of features) {
    const layerId = String(feature.properties?._layerId ?? '');
    const featureIndex = Number(feature.properties?._featureIndex);

    if (layerId && Number.isInteger(featureIndex)) {
      return { layerId, featureIndex };
    }
  }

  return null;
}

function uploadedIdentifyLayerIds(layerId: string) {
  return [
    `uploaded-layer-${layerId}-fill`,
    `uploaded-layer-${layerId}-line`,
    `uploaded-layer-${layerId}-circle`,
  ];
}
