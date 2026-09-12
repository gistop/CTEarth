import { lazy } from 'react';

export const DigitizeMap = lazy(() => import('./OpenLayersDigitizeMap').then(module => ({ default: module.OpenLayersDigitizeMap })));
