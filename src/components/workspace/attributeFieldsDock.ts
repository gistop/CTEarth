import type { DockviewApi } from 'dockview-react';

const fieldPanelPrefix = 'attribute-fields:';

export function getAttributeFieldsLayerId(panelId?: string) {
  if (!panelId?.startsWith(fieldPanelPrefix)) return null;
  const encoded = panelId.slice(fieldPanelPrefix.length);
  try { return decodeURIComponent(encoded); } catch { return encoded; }
}

export function openAttributeFieldsPanel(api: Pick<DockviewApi, 'getPanel' | 'addPanel'>, layerId: string, layerName?: string) {
  const id = `${fieldPanelPrefix}${encodeURIComponent(layerId)}`;
  const title = layerName ? `字段 - ${layerName}` : '字段';
  const existing = api.getPanel(id);
  if (existing) {
    existing.api.setTitle(title);
    existing.api.setActive();
    return;
  }
  const referencePanel = api.getPanel(`attribute-table:${encodeURIComponent(layerId)}`) ?? api.getPanel('python');
  const mapPanel = referencePanel ? undefined : api.getPanel('map');
  api.addPanel({
    id, component: 'attributeFields', title, params: { layerId },
    position: referencePanel ? { direction: 'within', referencePanel, index: referencePanel.group.panels.length }
      : mapPanel ? { direction: 'below', referencePanel: mapPanel } : undefined,
    minimumHeight: 120,
  }).api.setActive();
}
