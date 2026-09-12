import { describe, expect, it, vi } from 'vitest';
import { paperPresets } from '../constants';
import { getLayoutDerivedState } from '../services/layoutDocumentService';
import type { LayoutCommand, LayoutElementId } from '../types';
import { createLayoutStore } from './layoutStore';

describe('layout document store', () => {
  it('supports ordinary commands without React or a map engine', () => {
    const store = createLayoutStore();
    store.execute({ type: 'set-paper', paperId: 'a3-landscape' });
    store.execute({ type: 'set-graticule', visible: true });
    expect(store.getSnapshot()).toMatchObject({ paperId: 'a3-landscape', mapGraticuleVisible: true });
    expect(getLayoutDerivedState(store.getSnapshot()).paper.widthMm).toBe(420);
  });

  it('owns immutable snapshots without freezing caller data', () => {
    const store = createLayoutStore();
    const before = store.getSnapshot();
    const rectangle = { x: 20, y: 20, width: 20, height: 10 };
    store.actions.updateRectangles({ title: rectangle });
    rectangle.x = 90;
    expect(store.getSnapshot().rects.title.x).toBe(20);
    expect(before.rects.title.x).toBe(18);
    expect(() => { store.getSnapshot().rects.title.x = 90; }).toThrow();
    expect(() => { store.getSnapshot().selectedElementIds.push('title'); }).toThrow();
    expect(Object.isFrozen(getLayoutDerivedState(store.getSnapshot()).paper)).toBe(true);
  });

  it('notifies only on actual state changes and unsubscribes cleanly', () => {
    const store = createLayoutStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();
    store.actions.updateZoom(before.zoom);
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    store.actions.updateZoom(180);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.actions.resetLayout();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps independent stores and resets a complete document', () => {
    const first = createLayoutStore();
    const second = createLayoutStore();
    first.actions.setPaperId('a3-landscape');
    first.actions.setTool('pan');
    first.actions.toggleElement('title');
    first.actions.setMapView({ center3857: [1, 2], resolutionPerMm: 40, rotation: 1 });
    expect(second.getSnapshot().paperId).toBe('a4-landscape');
    first.actions.resetLayout();
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
    expect(first.getSnapshot()).not.toBe(second.getSnapshot());
  });

  it.each(['a4-landscape', 'a4-portrait', 'a3-landscape'] as const)('keeps every element inside %s', (paperId) => {
    const store = createLayoutStore();
    store.actions.setPaperId('a3-landscape');
    store.actions.updateRectangles({ title: { x: 400, y: 280, width: 80, height: 80 } });
    store.actions.setPaperId(paperId);
    const paper = paperPresets[paperId];
    Object.values(store.getSnapshot().rects).forEach((rect) => {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(paper.widthMm);
      expect(rect.y + rect.height).toBeLessThanOrEqual(paper.heightMm);
    });
  });

  it('normalizes selection and never selects a hidden element', () => {
    const store = createLayoutStore();
    store.actions.toggleElement('title');
    store.actions.setSelectedElementIds(['title', 'map-frame', 'map-frame']);
    expect(store.getSnapshot().selectedElementIds).toEqual(['map-frame']);
    store.actions.setSelectedElementIds([]);
    expect(getLayoutDerivedState(store.getSnapshot()).selectedElementId).toBeNull();
    [...store.getSnapshot().enabledElements].forEach(store.actions.toggleElement);
    expect(store.getSnapshot().selectedElementIds).toEqual([]);
    store.actions.toggleElement('title');
    expect(store.getSnapshot().selectedElementIds).toEqual(['title']);
  });

  it.each(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const)('aligns a group to its %s', (mode) => {
    const store = createLayoutStore();
    store.actions.setSelectedElementIds(['title', 'north-arrow']);
    store.actions.alignSelectedElement(mode);
    const rects = store.getSnapshot().rects;
    const anchor = (id: LayoutElementId) => {
      const rect = rects[id];
      if (mode === 'left') return rect.x;
      if (mode === 'center') return rect.x + rect.width / 2;
      if (mode === 'right') return rect.x + rect.width;
      if (mode === 'top') return rect.y;
      if (mode === 'middle') return rect.y + rect.height / 2;
      return rect.y + rect.height;
    };
    expect(anchor('title')).toBe(anchor('north-arrow'));
  });

  it('moves ordered selections as a group and respects stack boundaries', () => {
    const store = createLayoutStore();
    store.actions.setSelectedElementIds(['title', 'map-frame']);
    store.actions.moveSelectedElements('up');
    expect(store.getSnapshot().enabledElements).toEqual(['north-arrow', 'map-frame', 'title', 'scale-bar']);
    store.actions.moveSelectedElements('up');
    expect(getLayoutDerivedState(store.getSnapshot()).canMoveSelectionUp).toBe(false);
    const before = store.getSnapshot();
    store.actions.moveSelectedElements('up');
    expect(store.getSnapshot()).toBe(before);
    store.actions.moveSelectedElements('down');
    expect(store.getSnapshot().enabledElements).toEqual(['north-arrow', 'map-frame', 'title', 'scale-bar']);
  });

  it('clamps zoom and movement through the command API', () => {
    const store = createLayoutStore();
    store.actions.updateZoom(1000);
    expect(store.getSnapshot().zoom).toBe(180);
    store.actions.updateZoom(-100);
    expect(store.getSnapshot().zoom).toBe(45);
    store.execute({ type: 'move-elements', elementIds: ['title', 'map-frame'], deltaX: -1000, deltaY: -1000 });
    expect(store.getSnapshot().rects.title.x).toBe(0);
    expect(store.getSnapshot().rects['map-frame'].y - store.getSnapshot().rects.title.y).toBe(18);
    store.execute({ type: 'resize-element', elementId: 'title', deltaX: -1000, deltaY: -1000 });
    expect(store.getSnapshot().rects.title).toMatchObject({ width: 8, height: 6 });
  });

  it.each([
    { type: 'set-paper', paperId: 'toString' }, { type: 'set-zoom', zoom: NaN },
    { type: 'set-selection', elementIds: ['missing'] }, { type: 'set-tool', tool: 'other' },
    { type: 'set-graticule', visible: 'yes' }, { type: 'set-map-view', view: { center3857: [0, 0], resolutionPerMm: 0, rotation: 0 } },
    { type: 'update-rects', rects: { title: { x: 0, y: 0, width: 10, height: 10 }, 'north-arrow': { x: Infinity, y: 0, width: 10, height: 10 } } },
  ])('rejects invalid $type commands atomically', (command) => {
    const store = createLayoutStore();
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(() => store.execute(command as LayoutCommand)).toThrow();
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});
