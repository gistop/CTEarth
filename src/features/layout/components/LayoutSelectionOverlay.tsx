import type { LayoutSelectionDraft } from '../types';
import { normalizeMmRect } from '../services/layoutGeometry';

export function LayoutSelectionOverlay({
  draft,
  pageHeightPx,
  pageWidthPx,
  zoomScale,
}: {
  draft: LayoutSelectionDraft;
  pageHeightPx: number;
  pageWidthPx: number;
  zoomScale: number;
}) {
  const className = `layout-selection-overlay is-${draft.mode}`;

  if (draft.mode === 'rectangle') {
    const rect = normalizeMmRect(draft.start, draft.current);

    return (
      <svg className={className} viewBox={`0 0 ${pageWidthPx} ${pageHeightPx}`} aria-hidden="true">
        <rect
          x={rect.x * zoomScale}
          y={rect.y * zoomScale}
          width={rect.width * zoomScale}
          height={rect.height * zoomScale}
        />
      </svg>
    );
  }

  const previewPoints = draft.current ? [...draft.points, draft.current] : draft.points;
  const points = previewPoints.map(([x, y]) => `${x * zoomScale},${y * zoomScale}`).join(' ');

  return (
    <svg className={className} viewBox={`0 0 ${pageWidthPx} ${pageHeightPx}`} aria-hidden="true">
      {draft.points.length === 1 ? (
        <circle
          cx={draft.points[0][0] * zoomScale}
          cy={draft.points[0][1] * zoomScale}
          r={3.5}
        />
      ) : null}
      {previewPoints.length >= 3 ? <polygon points={points} /> : <polyline points={points} />}
    </svg>
  );
}
