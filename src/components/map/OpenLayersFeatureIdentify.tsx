import { useEffect, useRef } from 'react';
import type Feature from 'ol/Feature.js';
import type Map from 'ol/Map.js';
import Overlay from 'ol/Overlay.js';
import type Geometry from 'ol/geom/Geometry.js';
import { useGis } from '../../gisStore';
import { createIdentifyPopupElement, getIdentifiedFeature } from './identifyFeature';

type OpenLayersFeatureIdentifyProps = {
  active: boolean;
  map: Map | null;
};

export function OpenLayersFeatureIdentify({ active, map }: OpenLayersFeatureIdentifyProps) {
  const { layers } = useGis();
  const overlayRef = useRef<Overlay | null>(null);

  useEffect(() => {
    if (!map || !active) {
      overlayRef.current?.setPosition(undefined);
      return undefined;
    }

    const element = document.createElement('div');
    const overlay = new Overlay({
      element,
      offset: [0, -12],
      positioning: 'bottom-center',
      stopEvent: true,
    });

    overlayRef.current = overlay;
    map.addOverlay(overlay);

    const handleClick = (event: { coordinate: number[]; pixel: number[] }) => {
      const feature = map.forEachFeatureAtPixel(
        event.pixel,
        (item) => item as Feature<Geometry>,
        { hitTolerance: 6 },
      );

      if (!feature) {
        overlay.setPosition(undefined);
        return;
      }

      const layerId = String(feature.get('_layerId') ?? '');
      const featureIndex = Number(feature.get('_featureIndex'));
      const identified = layerId && Number.isInteger(featureIndex)
        ? getIdentifiedFeature(layers, layerId, featureIndex)
        : null;

      if (!identified) {
        overlay.setPosition(undefined);
        return;
      }

      element.replaceChildren(createIdentifyPopupElement(identified));
      overlay.setPosition(event.coordinate);
    };

    map.on('singleclick', handleClick);

    return () => {
      map.un('singleclick', handleClick);
      map.removeOverlay(overlay);
      overlayRef.current = null;
    };
  }, [active, layers, map]);

  return null;
}
