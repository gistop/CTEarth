import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Landform } from './landforms';

export type TeachingDemo = 'earth-layers';

export type LandformFlyToRequest = {
  landform: Landform;
  token: number;
};

type TeachingContextValue = {
  activeDemo: TeachingDemo | null;
  closeTeachingDemo: () => void;
  toggleTeachingDemo: (demo: TeachingDemo) => void;
  landformFlyToRequest: LandformFlyToRequest | null;
  requestLandformFlyTo: (landform: Landform) => void;
};

const TeachingContext = createContext<TeachingContextValue | null>(null);

export function TeachingProvider({ children }: { children: ReactNode }) {
  const [activeDemo, setActiveDemo] = useState<TeachingDemo | null>(null);
  const [landformFlyToRequest, setLandformFlyToRequest] = useState<LandformFlyToRequest | null>(null);
  const flyToTokenRef = useRef(0);

  const closeTeachingDemo = useCallback(() => {
    setActiveDemo(null);
  }, []);

  const toggleTeachingDemo = useCallback((demo: TeachingDemo) => {
    setActiveDemo((current) => (current === demo ? null : demo));
  }, []);

  const requestLandformFlyTo = useCallback((landform: Landform) => {
    flyToTokenRef.current += 1;
    setLandformFlyToRequest({ landform, token: flyToTokenRef.current });
  }, []);

  const value = useMemo(() => ({
    activeDemo,
    closeTeachingDemo,
    toggleTeachingDemo,
    landformFlyToRequest,
    requestLandformFlyTo,
  }), [activeDemo, closeTeachingDemo, toggleTeachingDemo, landformFlyToRequest, requestLandformFlyTo]);

  return <TeachingContext.Provider value={value}>{children}</TeachingContext.Provider>;
}

export function useTeaching() {
  const value = useContext(TeachingContext);

  if (!value) {
    throw new Error('useTeaching must be used inside TeachingProvider');
  }

  return value;
}
