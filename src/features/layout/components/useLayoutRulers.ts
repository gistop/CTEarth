import { useCallback, useEffect, useRef } from 'react';
import type Ruler from '@scena/react-ruler';
import type { IDockviewPanelProps } from 'dockview-react';

export type LayoutPanelApi = Pick<IDockviewPanelProps['api'], 'onDidVisibilityChange' | 'onDidActiveChange' | 'onDidDimensionsChange'>;

export function useLayoutRulers(api: LayoutPanelApi | undefined, paperWidth: number, paperHeight: number, pxPerMm: number) {
  const horizontalRulerRef = useRef<Ruler | null>(null);
  const verticalRulerRef = useRef<Ruler | null>(null);
  const frame = useRef(0);
  const resize = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      horizontalRulerRef.current?.resize();
      verticalRulerRef.current?.resize();
    });
  }, []);
  useEffect(() => { resize(); }, [paperWidth, paperHeight, pxPerMm, resize]);
  useEffect(() => {
    const disposables = [
      api?.onDidVisibilityChange((event) => { if (event.isVisible) resize(); }),
      api?.onDidActiveChange((event) => { if (event.isActive) resize(); }),
      api?.onDidDimensionsChange(resize),
    ];
    window.addEventListener('resize', resize);
    return () => {
      disposables.forEach((disposable) => disposable?.dispose());
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frame.current);
    };
  }, [api, resize]);
  return { horizontalRulerRef, verticalRulerRef };
}
