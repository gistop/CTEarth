import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ProfileResult } from './terrainAnalysisCesium';

export type TerrainAnalysisTool = 'profile' | 'flood';

type TerrainAnalysisContextValue = {
  activeTool: TerrainAnalysisTool | null;
  closeTerrainTool: () => void;
  profileResult: ProfileResult | null;
  setProfileResult: (result: ProfileResult | null) => void;
  toggleTerrainTool: (tool: TerrainAnalysisTool) => void;
};

const TerrainAnalysisContext = createContext<TerrainAnalysisContextValue | null>(null);

export function TerrainAnalysisProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState<TerrainAnalysisTool | null>(null);
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null);

  const closeTerrainTool = useCallback(() => {
    setActiveTool(null);
  }, []);

  const toggleTerrainTool = useCallback((tool: TerrainAnalysisTool) => {
    setActiveTool((current) => (current === tool ? null : tool));
  }, []);

  const value = useMemo(() => ({
    activeTool,
    closeTerrainTool,
    profileResult,
    setProfileResult,
    toggleTerrainTool,
  }), [activeTool, closeTerrainTool, profileResult, toggleTerrainTool]);

  return <TerrainAnalysisContext.Provider value={value}>{children}</TerrainAnalysisContext.Provider>;
}

export function useTerrainAnalysis() {
  const value = useContext(TerrainAnalysisContext);

  if (!value) {
    throw new Error('useTerrainAnalysis must be used inside TerrainAnalysisProvider');
  }

  return value;
}
