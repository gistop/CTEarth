import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type TeachingDemo = 'earth-layers';

type TeachingContextValue = {
  activeDemo: TeachingDemo | null;
  closeTeachingDemo: () => void;
  toggleTeachingDemo: (demo: TeachingDemo) => void;
};

const TeachingContext = createContext<TeachingContextValue | null>(null);

export function TeachingProvider({ children }: { children: ReactNode }) {
  const [activeDemo, setActiveDemo] = useState<TeachingDemo | null>(null);

  const closeTeachingDemo = useCallback(() => {
    setActiveDemo(null);
  }, []);

  const toggleTeachingDemo = useCallback((demo: TeachingDemo) => {
    setActiveDemo((current) => (current === demo ? null : demo));
  }, []);

  const value = useMemo(() => ({
    activeDemo,
    closeTeachingDemo,
    toggleTeachingDemo,
  }), [activeDemo, closeTeachingDemo, toggleTeachingDemo]);

  return <TeachingContext.Provider value={value}>{children}</TeachingContext.Provider>;
}

export function useTeaching() {
  const value = useContext(TeachingContext);

  if (!value) {
    throw new Error('useTeaching must be used inside TeachingProvider');
  }

  return value;
}
