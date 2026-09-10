import { LayerList } from '../../features/layers';

export function ContentsPanel() {
  return (
    <aside className="panel-shell contents-panel">
      <LayerList />
    </aside>
  );
}
