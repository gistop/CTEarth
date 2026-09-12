// @vitest-environment jsdom

import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLayoutStore } from '../stores/layoutStore';
import { LayoutStoreProvider } from '../stores/LayoutContext';
import { useLayoutGestures } from './useLayoutGestures';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Harness() {
  const board = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const gestures = useLayoutGestures(board, page);
  return <div ref={board} data-testid="board" onPointerDown={gestures.beginBoardPan}>
    <div ref={page} data-testid="page" onPointerDown={gestures.handlePagePointerDown} onClick={gestures.handlePageClick} onDoubleClick={gestures.handlePageDoubleClick}>
      <button onPointerDown={(event) => gestures.beginElementDrag('title', event)}>title</button>
      <button onPointerDown={(event) => gestures.beginElementDrag('title', event, 'resize')}>resize</button>
    </div>
    <output data-testid="draft">{gestures.selectionDraft?.mode ?? ''}</output>
  </div>;
}

function setup() {
  const store = createLayoutStore();
  store.actions.updateZoom(112);
  const rendered = render(<LayoutStoreProvider store={store}><Harness /></LayoutStoreProvider>);
  vi.spyOn(screen.getByTestId('page'), 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, right: 1288, bottom: 890, width: 1188, height: 840, x: 100, y: 50, toJSON: () => ({}) });
  return { store, ...rendered };
}

describe('ordinary layout pointer gestures', () => {
  it('commits the final pointerup position without requiring a last pointermove', () => {
    const { store } = setup();
    fireEvent.pointerDown(screen.getByText('title'), { button: 0, pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 240, clientY: 120 });
    expect(store.getSnapshot().rects.title).toMatchObject({ x: 28, y: 15 });
    expect(store.getSnapshot().selectedElementIds).toEqual(['title']);
  });

  it('ignores other pointers and non-primary buttons', () => {
    const { store } = setup();
    const original = store.getSnapshot().rects.title;
    fireEvent.pointerDown(screen.getByText('title'), { button: 2, pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 240, clientY: 120 });
    expect(store.getSnapshot().rects.title).toEqual(original);
    fireEvent.pointerDown(screen.getByText('title'), { button: 0, pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 400, clientY: 300 });
    fireEvent.pointerCancel(window, { pointerId: 2 });
    expect(store.getSnapshot().rects.title).toEqual(original);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 240, clientY: 120 });
    expect(store.getSnapshot().rects.title.x).toBe(28);
  });

  it.each(['escape', 'pointercancel'])('rolls back an in-progress drag on %s', (method) => {
    const { store } = setup();
    const original = store.getSnapshot().rects.title;
    fireEvent.pointerDown(screen.getByText('title'), { button: 0, pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 240, clientY: 120 });
    expect(store.getSnapshot().rects.title.x).toBe(28);
    if (method === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
    else fireEvent.pointerCancel(window, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 500, clientY: 300 });
    expect(store.getSnapshot().rects.title).toEqual(original);
  });

  it('moves multi-selection as a rigid group at the paper edge', () => {
    const { store } = setup();
    act(() => store.actions.setSelectedElementIds(['title', 'north-arrow']));
    fireEvent.pointerDown(screen.getByText('title'), { button: 0, pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 2000, clientY: 100 });
    const { title, 'north-arrow': north } = store.getSnapshot().rects;
    expect(north.x + north.width).toBe(297);
    expect(north.x - title.x).toBe(200);
  });

  it('resizes using millimeters and enforces minimum dimensions', () => {
    const { store } = setup();
    fireEvent.pointerDown(screen.getByText('resize'), { button: 0, pointerId: 1, clientX: 700, clientY: 200 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(store.getSnapshot().rects.title).toEqual({ x: 18, y: 10, width: 8, height: 6 });
  });

  it('selects by rectangle and does not commit a cancelled draft', () => {
    const { store } = setup();
    act(() => store.actions.setSelectMode('rectangle'));
    const page = screen.getByTestId('page');
    fireEvent.pointerDown(page, { button: 0, pointerId: 1, clientX: 160, clientY: 70 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 700, clientY: 142 });
    expect(store.getSnapshot().selectedElementIds).toEqual(['title']);
    fireEvent.pointerDown(page, { button: 0, pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 1200, clientY: 800 });
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(store.getSnapshot().selectedElementIds).toEqual(['title']);
    expect(screen.getByTestId('draft').textContent).toBe('');
  });

  it('completes polygon selection and cancels stale drafts when mode changes', () => {
    const { store } = setup();
    act(() => store.actions.setSelectMode('polygon'));
    const page = screen.getByTestId('page');
    [[160, 70], [700, 70], [700, 142], [160, 142]].forEach(([clientX, clientY]) => fireEvent.click(page, { clientX, clientY }));
    fireEvent.doubleClick(page, { clientX: 160, clientY: 142 });
    expect(store.getSnapshot().selectedElementIds).toEqual(['title']);
    fireEvent.click(page, { clientX: 160, clientY: 70 });
    act(() => store.actions.setTool('pan'));
    expect(screen.getByTestId('draft').textContent).toBe('');
  });

  it('pans the board without changing document geometry and detaches on unmount', () => {
    const { store, unmount } = setup();
    act(() => store.actions.setTool('pan'));
    const board = screen.getByTestId('board');
    board.scrollLeft = 80; board.scrollTop = 40;
    const before = store.getSnapshot();
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 230, clientY: 120 });
    expect([board.scrollLeft, board.scrollTop]).toEqual([50, 20]);
    expect(store.getSnapshot()).toBe(before);
    act(() => store.actions.setTool('select'));
    fireEvent.pointerDown(screen.getByText('title'), { button: 0, pointerId: 1, clientX: 200, clientY: 100 });
    const listener = vi.fn();
    store.subscribe(listener);
    unmount();
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 500, clientY: 300 });
    expect(listener).not.toHaveBeenCalled();
  });
});
