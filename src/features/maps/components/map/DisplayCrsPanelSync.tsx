import { useEffect } from 'react';
import type { DisplayCrsId } from './MapCommandContext';

type DisplayCrsPanelSyncProps = {
  displayCrs: DisplayCrsId;
  activateMapPanel: () => void;
  activateProjectionMapPanel: () => void;
};

export function DisplayCrsPanelSync({
  displayCrs,
  activateMapPanel,
  activateProjectionMapPanel,
}: DisplayCrsPanelSyncProps) {
  useEffect(() => {
    if (displayCrs === 'webMercator') {
      activateMapPanel();
      return;
    }

    activateProjectionMapPanel();
  }, [activateMapPanel, activateProjectionMapPanel, displayCrs]);

  return null;
}
