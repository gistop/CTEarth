import { lazy } from 'react';
export const AttributeTablePanel = lazy(() => import('./AttributeTableView').then(module => ({ default: module.AttributeTableView })));
