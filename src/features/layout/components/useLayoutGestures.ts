import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { LayoutElementId, LayoutPoint, LayoutRect, LayoutSelectionDraft } from '../types';
import { clientToPagePoint, dedupeAdjacentPoints, distanceMm, moveRectsTogether, normalizeMmRect, resizeRect, selectElementsByPolygon, selectElementsByRect } from '../services/layoutGeometry';
import { useLayout } from '../stores/LayoutContext';

type Drag = { pointerId: number; origin: LayoutPoint; elementIds: LayoutElementId[]; rects: Partial<Record<LayoutElementId, LayoutRect>>; mode: 'move' | 'resize' };
type Pan = { pointerId: number; origin: LayoutPoint; scrollLeft: number; scrollTop: number };

export function useLayoutGestures(boardRef: RefObject<HTMLDivElement | null>, pageRef: RefObject<HTMLDivElement | null>) {
  const { paper, paperId, pxPerMm, zoom, enabledElements, rects, selectedElementIds, selectMode, tool, setSelectedElementId, setSelectedElementIds, updateRectangles } = useLayout();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pan, setPan] = useState<Pan | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<LayoutSelectionDraft | null>(null);

  const pointFromClient = useCallback((clientX: number, clientY: number) => {
    const bounds = pageRef.current?.getBoundingClientRect();
    return bounds ? clientToPagePoint(clientX, clientY, bounds.left, bounds.top, pxPerMm) : null;
  }, [pageRef, pxPerMm]);

  const beginElementDrag = useCallback((id: LayoutElementId, event: ReactPointerEvent<HTMLElement>, mode: 'move' | 'resize' = 'move') => {
    if (tool !== 'select' || selectMode !== 'single' || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const selected = selectedElementIds.includes(id);
    if (!selected) setSelectedElementId(id);
    const ids = mode === 'move' && selected ? selectedElementIds.filter((item) => enabledElements.includes(item)) : [id];
    setDrag({ pointerId: event.pointerId, origin: [event.clientX, event.clientY], elementIds: ids, rects: Object.fromEntries(ids.map((item) => [item, rects[item]])), mode });
  }, [tool, selectMode, selectedElementIds, enabledElements, rects, setSelectedElementId]);

  const beginBoardPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'pan' || event.button !== 0 || !boardRef.current) return;
    event.preventDefault();
    setPan({ pointerId: event.pointerId, origin: [event.clientX, event.clientY], scrollLeft: boardRef.current.scrollLeft, scrollTop: boardRef.current.scrollTop });
  }, [boardRef, tool]);

  const handlePagePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'select' || event.button !== 0 || event.target !== event.currentTarget) return;
    if (selectMode === 'single') { setSelectedElementId('map-frame'); return; }
    if (selectMode !== 'rectangle') return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    setSelectionDraft({ mode: 'rectangle', pointerId: event.pointerId, start: point, current: point });
  }, [tool, selectMode, setSelectedElementId, pointFromClient]);

  const handlePageClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (tool !== 'select' || selectMode !== 'polygon' || event.button !== 0) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectionDraft((current) => {
      if (current?.mode !== 'polygon') return { mode: 'polygon', points: [point], current: null };
      const last = current.points.at(-1);
      return last && distanceMm(last, point) < 0.5 ? { ...current, current: point } : { ...current, points: [...current.points, point], current: null };
    });
  }, [tool, selectMode, pointFromClient]);

  const handlePageDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (tool !== 'select' || selectMode !== 'polygon' || selectionDraft?.mode !== 'polygon') return;
    event.preventDefault();
    event.stopPropagation();
    const points = dedupeAdjacentPoints(selectionDraft.points);
    if (points.length >= 3) setSelectedElementIds(selectElementsByPolygon(rects, enabledElements, points));
    setSelectionDraft(null);
  }, [tool, selectMode, selectionDraft, rects, enabledElements, setSelectedElementIds]);

  useEffect(() => { setDrag(null); setPan(null); setSelectionDraft(null); }, [tool, selectMode, paperId, zoom]);

  useEffect(() => {
    if (!drag && !pan && !selectionDraft) return;
    const move = (event: PointerEvent) => {
      const point = pointFromClient(event.clientX, event.clientY);
      if (point && selectionDraft?.mode === 'rectangle' && event.pointerId === selectionDraft.pointerId) setSelectionDraft({ ...selectionDraft, current: point });
      if (point && selectionDraft?.mode === 'polygon') setSelectionDraft({ ...selectionDraft, current: point });
      if (drag && event.pointerId === drag.pointerId) {
        const deltaX = (event.clientX - drag.origin[0]) / pxPerMm;
        const deltaY = (event.clientY - drag.origin[1]) / pxPerMm;
        if (drag.mode === 'resize') {
          const id = drag.elementIds[0];
          const original = drag.rects[id];
          if (original) updateRectangles({ [id]: resizeRect(original, deltaX, deltaY, paper.widthMm, paper.heightMm) });
        } else {
          updateRectangles(moveRectsTogether(drag.rects, drag.elementIds, deltaX, deltaY, paper.widthMm, paper.heightMm));
        }
      }
      if (pan && event.pointerId === pan.pointerId && boardRef.current) {
        boardRef.current.scrollLeft = pan.scrollLeft - event.clientX + pan.origin[0];
        boardRef.current.scrollTop = pan.scrollTop - event.clientY + pan.origin[1];
      }
    };
    const stop = (event: PointerEvent) => {
      if ((drag && event.pointerId === drag.pointerId) || (pan && event.pointerId === pan.pointerId)) move(event);
      if (selectionDraft?.mode === 'rectangle' && event.pointerId === selectionDraft.pointerId) {
        const point = pointFromClient(event.clientX, event.clientY) ?? selectionDraft.current;
        setSelectedElementIds(selectElementsByRect(rects, enabledElements, normalizeMmRect(selectionDraft.start, point)));
        setSelectionDraft(null);
      }
      if (drag && event.pointerId === drag.pointerId) setDrag(null);
      if (pan && event.pointerId === pan.pointerId) setPan(null);
    };
    const cancel = (event?: PointerEvent) => {
      if (event && drag && event.pointerId !== drag.pointerId) return;
      if (event && pan && event.pointerId !== pan.pointerId) return;
      if (event && selectionDraft?.mode === 'rectangle' && event.pointerId !== selectionDraft.pointerId) return;
      if (drag) updateRectangles(drag.rects);
      setDrag(null); setPan(null); setSelectionDraft(null);
    };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keydown);
    };
  }, [drag, pan, selectionDraft, pointFromClient, pxPerMm, paper.widthMm, paper.heightMm, rects, enabledElements, setSelectedElementIds, updateRectangles, boardRef]);

  return { selectionDraft, beginElementDrag, beginBoardPan, handlePagePointerDown, handlePageClick, handlePageDoubleClick };
}
