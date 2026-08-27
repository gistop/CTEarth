import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { useGis } from '../../gisStore';

type MapFeatureSelectionProps = {
  active: boolean;
  map: maplibregl.Map | null;
  mapReady: boolean;
};

const selectionTolerancePx = 6;

export function MapFeatureSelection({ active, map, mapReady }: MapFeatureSelectionProps) {
  const {
    layer,
    layers,
    uploadedLayerVisibility,
    setActiveLayer,
    setLayerSelection,
    clearSelection,
  } = useGis();

  useEffect(() => {
    if (!mapReady || !map || !active) {
      return undefined;
    }

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = 'default';

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      const candidates = querySelectableFeatures(map, event, layers, uploadedLayerVisibility);

      if (candidates.length === 0) {
        clearSelection(layer?.id);
        return;
      }

      const candidate = candidates[0];
      const targetLayer = layers.find((item) => item.id === candidate.layerId);

      if (!targetLayer) {
        return;
      }

      const originalEvent = event.originalEvent;
      const selectedIndexes = new Set(targetLayer.selectedFeatureIndexes);

      if (originalEvent.ctrlKey || originalEvent.metaKey) {
        if (selectedIndexes.has(candidate.featureIndex)) {
          selectedIndexes.delete(candidate.featureIndex);
        } else {
          selectedIndexes.add(candidate.featureIndex);
        }

        setLayerSelection(targetLayer.id, [...selectedIndexes]);
        return;
      }

      if (originalEvent.shiftKey) {
        selectedIndexes.add(candidate.featureIndex);
        setLayerSelection(targetLayer.id, [...selectedIndexes]);
        return;
      }

      setActiveLayer(targetLayer.id);
      setLayerSelection(targetLayer.id, [candidate.featureIndex]);
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
      canvas.style.cursor = previousCursor;
    };
  }, [active, clearSelection, layer?.id, layers, map, mapReady, setActiveLayer, setLayerSelection, uploadedLayerVisibility]);

  return null;
}

function querySelectableFeatures(
  map: maplibregl.Map,
  event: maplibregl.MapMouseEvent,
  layers: ReturnType<typeof useGis>['layers'],
  uploadedLayerVisibility: ReturnType<typeof useGis>['uploadedLayerVisibility'],
) {
  const queryLayerIds = layers
    .filter((layer) => uploadedLayerVisibility[layer.id] ?? true)
    .flatMap((layer) => uploadedSelectionLayerIds(layer.id))
    .filter((layerId) => Boolean(map.getLayer(layerId)));

  if (queryLayerIds.length === 0) {
    return [];
  }

  const point = event.point;
  const features = map.queryRenderedFeatures(
    [
      [point.x - selectionTolerancePx, point.y - selectionTolerancePx],
      [point.x + selectionTolerancePx, point.y + selectionTolerancePx],
    ],
    { layers: queryLayerIds },
  );
  const seen = new Set<string>();

  return features.flatMap((feature) => {
    const layerId = String(feature.properties?._layerId ?? '');
    const featureIndex = Number(feature.properties?._featureIndex);
    const key = `${layerId}:${featureIndex}`;

    if (!layerId || !Number.isInteger(featureIndex) || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [{ layerId, featureIndex }];
  });
}

function uploadedSelectionLayerIds(layerId: string) {
  return [
    `uploaded-layer-${layerId}-fill`,
    `uploaded-layer-${layerId}-line`,
    `uploaded-layer-${layerId}-circle`,
  ];
}
