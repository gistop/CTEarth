import { lazy } from 'react';

export const AttributeFieldsPanel = lazy(() => import('./AttributeFieldsView').then(module => ({ default: module.AttributeFieldsView })));
