import Ruler from '@scena/react-ruler';
import { useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { rulerGutterPx } from '../constants';
import { useLayout } from '../stores/LayoutContext';
import { LayoutPageElements } from './LayoutPageElements';
import { LayoutSelectionOverlay } from './LayoutSelectionOverlay';
import { useLayoutGestures } from './useLayoutGestures';
import { useLayoutRulers, type LayoutPanelApi } from './useLayoutRulers';

export function LayoutPanel({ api }: IDockviewPanelProps) {
  return <LayoutWorkspace api={api} />;
}

export function LayoutWorkspace({ api }: { api?: LayoutPanelApi }) {
  const layout = useLayout();
  const { paper, pxPerMm, tool } = layout;
  const boardRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const { horizontalRulerRef, verticalRulerRef } = useLayoutRulers(api, paper.widthMm, paper.heightMm, pxPerMm);
  const gestures = useLayoutGestures(boardRef, pageRef);
  const pageWidthPx = paper.widthMm * pxPerMm;
  const pageHeightPx = paper.heightMm * pxPerMm;

  return <section className="layout-panel" aria-label="地图布局">
    <div className={`layout-workspace ${tool}-mode`}>
      <div className="layout-ruler-corner" aria-hidden="true" />
      <div className="layout-ruler layout-ruler-top" aria-hidden="true">
        <Ruler
          ref={horizontalRulerRef}
          backgroundColor="#f6f8f9"
          direction="end"
          font="12px sans-serif"
          lineColor="#6f7f8a"
          negativeRuler={false}
          range={[0, paper.widthMm]}
          scrollPos={Math.max(0, (scroll.left - rulerGutterPx) / pxPerMm)}
          segment={10}
          textColor="#56636d"
          textFormat={(value) => `${value}`}
          textOffset={[2, 2]}
          type="horizontal"
          unit={10}
          useResizeObserver
          zoom={pxPerMm}
        />
      </div>
      <div className="layout-ruler layout-ruler-left" aria-hidden="true">
        <Ruler
          ref={verticalRulerRef}
          backgroundColor="#f6f8f9"
          direction="end"
          font="12px sans-serif"
          lineColor="#6f7f8a"
          negativeRuler={false}
          range={[0, paper.heightMm]}
          scrollPos={Math.max(0, (scroll.top - rulerGutterPx) / pxPerMm)}
          segment={10}
          textColor="#56636d"
          textFormat={(value) => `${value}`}
          textOffset={[2, 1]}
          type="vertical"
          unit={10}
          useResizeObserver
          zoom={pxPerMm}
        />
      </div>
      <div className="layout-board" ref={boardRef} onPointerDown={gestures.beginBoardPan}
        onScroll={(event) => setScroll({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop })}>
        <div className="layout-canvas" style={{ minHeight: pageHeightPx + rulerGutterPx * 2, minWidth: pageWidthPx + rulerGutterPx * 2, padding: rulerGutterPx }}>
          <div className="layout-page" ref={pageRef} style={{ height: pageHeightPx, width: pageWidthPx }}
            onPointerDown={gestures.handlePagePointerDown} onClick={gestures.handlePageClick} onDoubleClick={gestures.handlePageDoubleClick}>
            <div className="layout-page-label"><span>{paper.label}</span><strong>{paper.widthMm} x {paper.heightMm} mm</strong></div>
            <LayoutPageElements state={layout} pxPerMm={pxPerMm} interactive onBeginDrag={gestures.beginElementDrag} />
            {gestures.selectionDraft ? <LayoutSelectionOverlay draft={gestures.selectionDraft} pageHeightPx={pageHeightPx} pageWidthPx={pageWidthPx} zoomScale={pxPerMm} /> : null}
          </div>
        </div>
      </div>
    </div>
  </section>;
}
