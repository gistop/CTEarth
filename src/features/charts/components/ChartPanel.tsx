import { lazy } from 'react';
export const ChartPanel = lazy(() => import('./ChartPanelView').then(module => ({ default: module.ChartPanelView })));
