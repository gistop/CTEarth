import type { ReactNode } from 'react';
import { LayoutStoreProvider } from '../stores/LayoutContext';
import type { LayoutStore } from '../stores/layoutStore';
import { LayoutExportSurface } from './LayoutExportSurface';

export function LayoutProvider({ children, store }: { children: ReactNode; store?: LayoutStore }) {
  return <LayoutStoreProvider store={store}>
    {children}
    <LayoutExportSurface />
  </LayoutStoreProvider>;
}
