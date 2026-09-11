import { Bug } from 'lucide-react';
import { useMapCommands } from './MapCommandContext';

export function MapTerrainDiagnosticsButton() {
  const { hasTerrainDiagnostic, runTerrainDiagnostic } = useMapCommands();

  return (
    <button
      type="button"
      title={'\u8f93\u51fa\u5730\u5f62\u8bca\u65ad\u5230 Console'}
      aria-label={'\u8f93\u51fa\u5730\u5f62\u8bca\u65ad\u5230 Console'}
      disabled={!hasTerrainDiagnostic}
      onClick={(event) => {
        event.stopPropagation();
        runTerrainDiagnostic();
      }}
    >
      <Bug size={15} strokeWidth={1.8} />
    </button>
  );
}
