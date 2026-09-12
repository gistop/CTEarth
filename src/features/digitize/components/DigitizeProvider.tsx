import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useLayerStore } from '../../layers';
import { createGisDigitizeDataAdapter } from '../adapters/gisDigitizeDataAdapter';
import { DigitizeStoreProvider } from '../stores/DigitizeContext';
import type { DigitizeStore } from '../stores/digitizeStore';
import type { DigitizeDataPort } from '../types';

export function DigitizeProvider({ children, store, port }: { children: ReactNode; store?: DigitizeStore; port?: DigitizeDataPort }) {
  return port
    ? <DigitizeStoreProvider store={store} port={port}>{children}</DigitizeStoreProvider>
    : <GisDigitizeProvider store={store}>{children}</GisDigitizeProvider>;
}

function GisDigitizeProvider({ children, store }: { children: ReactNode; store?: DigitizeStore }) {
  const { activeLayerId, layers, updateUploadedLayerGeoJson } = useLayerStore();
  const [adapter] = useState(() => createGisDigitizeDataAdapter({ activeLayerId, layers, updateUploadedLayerGeoJson }));
  useLayoutEffect(() => adapter.sync({ activeLayerId, layers, updateUploadedLayerGeoJson }), [adapter, activeLayerId, layers, updateUploadedLayerGeoJson]);
  return <DigitizeStoreProvider store={store} port={adapter.port}>{children}</DigitizeStoreProvider>;
}
