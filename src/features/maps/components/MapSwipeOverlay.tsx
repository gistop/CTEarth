import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { RasterOverlay } from '../../../gisStore';

type SwipeEdge = 'left' | 'right' | 'top' | 'bottom';

type SwipeDivider = {
  edge: SwipeEdge;
  /** 分割线位置，0..1 的屏幕比例；垂直线为 x 比例，水平线为 y 比例。 */
  position: number;
};

const DIVIDER_COLOR = '#2f81f7';
const DIVIDER_GRIP = 24;
const EDGE_ZONE_RATIO = 0.3;
const DIVIDER_HIT_DISTANCE = 8;

function triangleCursor(direction: 'up' | 'down' | 'left' | 'right') {
  const size = 26;
  const half = size / 2;
  const points = {
    up: `${half},4 ${size - 4},${size - 4} 4,${size - 4}`,
    down: `4,4 ${size - 4},4 ${half},${size - 4}`,
    left: `4,4 ${size - 4},4 4,${size - 4}`,
    right: `${size - 4},4 ${size - 4},${size - 4} 4,${half}`,
  }[direction];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><polygon points="${points}" fill="#1a73e8" stroke="#ffffff" stroke-width="1.5"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${half} ${half}, auto`;
}

/** 光标位于某条边附近时，三角形指向卷帘拖动方向（指向地图内部）。 */
const EDGE_CURSORS: Record<SwipeEdge, string> = {
  left: triangleCursor('right'),
  right: triangleCursor('left'),
  top: triangleCursor('down'),
  bottom: triangleCursor('up'),
};

/** 从某条边发起卷帘后，目标图层保留在分割线的另一侧显示。 */
function clipRectFor(edge: SwipeEdge, position: number, width: number, height: number) {
  const lineX = position * width;
  const lineY = position * height;
  switch (edge) {
    case 'left':
      return { x: lineX, y: 0, w: width - lineX, h: height };
    case 'right':
      return { x: 0, y: 0, w: lineX, h: height };
    case 'top':
      return { x: 0, y: lineY, w: width, h: height - lineY };
    case 'bottom':
      return { x: 0, y: 0, w: width, h: lineY };
  }
}

function clampFraction(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(0.98, Math.max(0.02, value));
}

export function MapSwipeOverlay({
  active,
  map,
  mapReady,
  raster,
  rasterVisible,
  opacity,
  onExit,
}: {
  active: boolean;
  map: MapLibreMap | null;
  mapReady: boolean;
  raster: RasterOverlay | null;
  rasterVisible: boolean;
  opacity: number;
  onExit: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dividerRef = useRef<SwipeDivider | null>(null);
  const dragRef = useRef<{ edge: SwipeEdge } | null>(null);
  const cursorRef = useRef('');
  const hiddenLayerAppliedRef = useRef(false);
  const frameRef = useRef(0);
  const drawRef = useRef<() => void>(() => undefined);
  const [imageReady, setImageReady] = useState(false);

  const layerId = raster ? `raster-overlay-${raster.id}` : null;
  const rasterVisibleRef = useRef(rasterVisible);
  rasterVisibleRef.current = rasterVisible;

  const requestDraw = useCallback(() => {
    if (frameRef.current) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      drawRef.current();
    });
  }, []);

  const drawSwipe = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    const map2 = map;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }
    if (!image || !map2 || !active || !raster || !rasterVisible) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // 栅格四角（左上、右上、左下）投影到屏幕，用仿射变换绘制整幅图像。
    const [topLeft, topRight, , bottomLeft] = raster.coordinates;
    const p0 = map2.project(topLeft);
    const p1 = map2.project(topRight);
    const p3 = map2.project(bottomLeft);

    const divider = dividerRef.current;
    const clip = divider ? clipRectFor(divider.edge, divider.position, width, height) : { x: 0, y: 0, w: width, h: height };

    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, Math.max(clip.w, 0), Math.max(clip.h, 0));
    ctx.clip();
    const scaleX = (p1.x - p0.x) / image.width;
    const skewX = (p3.x - p0.x) / image.height;
    const scaleY = (p1.y - p0.y) / image.width;
    const skewY = (p3.y - p0.y) / image.height;
    ctx.setTransform(dpr * scaleX, dpr * scaleY, dpr * skewX, dpr * skewY, dpr * p0.x, dpr * p0.y);
    ctx.globalAlpha = opacity;
    // 关掉画布平滑：卷帘时同样按最近邻放大，像元边界保持硬边
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    ctx.restore();

    if (divider) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = DIVIDER_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (divider.edge === 'left' || divider.edge === 'right') {
        const lineX = divider.position * width;
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, height);
        ctx.stroke();
        ctx.fillStyle = DIVIDER_COLOR;
        ctx.fillRect(lineX - 2, height / 2 - DIVIDER_GRIP / 2, 4, DIVIDER_GRIP);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(lineX - 1, height / 2 - DIVIDER_GRIP / 2 + 5, 2, DIVIDER_GRIP - 10);
      } else {
        const lineY = divider.position * height;
        ctx.moveTo(0, lineY);
        ctx.lineTo(width, lineY);
        ctx.stroke();
        ctx.fillStyle = DIVIDER_COLOR;
        ctx.fillRect(width / 2 - DIVIDER_GRIP / 2, lineY - 2, DIVIDER_GRIP, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(width / 2 - DIVIDER_GRIP / 2 + 5, lineY - 1, DIVIDER_GRIP - 10, 2);
      }
    }
  }, [active, map, opacity, raster, rasterVisible]);

  useEffect(() => {
    drawRef.current = drawSwipe;
  }, [drawSwipe]);

  useEffect(() => {
    requestDraw();
  }, [active, imageReady, opacity, raster, rasterVisible, requestDraw]);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, []);

  // 覆盖层接管目标栅格的绘制：隐藏原始 maplibre 图层；退出或切换目标时恢复。
  useEffect(() => {
    if (!active || !map || !mapReady || !layerId) {
      return;
    }
    applyHiddenLayer();
    const reapply = () => applyHiddenLayer();
    map.on('render', reapply);
    map.on('render', requestDraw);
    return () => {
      map.off('render', reapply);
      map.off('render', requestDraw);
      restoreLayer();
    };
  }, [active, layerId, map, mapReady, requestDraw]);

  useEffect(() => {
    if (!active) {
      dividerRef.current = null;
      imageRef.current = null;
      setImageReady(false);
      return;
    }
    if (!raster) {
      return;
    }
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (!cancelled) {
        imageRef.current = image;
        setImageReady(true);
        requestDraw();
      }
    };
    image.src = raster.imageUrl;
    return () => {
      cancelled = true;
    };
  }, [active, raster, requestDraw]);

  // 交互：边缘方向三角光标、按住拖动移动分割线、Esc 退出。
  useEffect(() => {
    if (!active || !map || !mapReady) {
      return;
    }
    const canvas = map.getCanvas();
    const container = map.getContainer();
    const previousCursor = canvas.style.cursor;
    let wasDragPanEnabled: boolean | null = null;

    const setCursor = (value: string) => {
      if (cursorRef.current !== value) {
        cursorRef.current = value;
        canvas.style.cursor = value;
      }
    };

    const dividerHitBy = (point: { x: number; y: number }) => {
      const divider = dividerRef.current;
      if (!divider) {
        return false;
      }
      if (divider.edge === 'left' || divider.edge === 'right') {
        return Math.abs(point.x - divider.position * container.clientWidth) <= DIVIDER_HIT_DISTANCE;
      }
      return Math.abs(point.y - divider.position * container.clientHeight) <= DIVIDER_HIT_DISTANCE;
    };

    const edgeAt = (point: { x: number; y: number }): SwipeEdge | null => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const nx = Math.min(point.x, width - point.x) / width;
      const ny = Math.min(point.y, height - point.y) / height;
      if (nx > EDGE_ZONE_RATIO && ny > EDGE_ZONE_RATIO) {
        return null;
      }
      if (nx <= ny) {
        return point.x < width / 2 ? 'left' : 'right';
      }
      return point.y < height / 2 ? 'top' : 'bottom';
    };

    const handleMouseMove = (event: MapMouseEvent) => {
      if (dragRef.current) {
        return;
      }
      if (dividerHitBy(event.point)) {
        const divider = dividerRef.current!;
        setCursor(divider.edge === 'left' || divider.edge === 'right' ? 'ew-resize' : 'ns-resize');
        return;
      }
      const edge = edgeAt(event.point);
      setCursor(edge ? EDGE_CURSORS[edge] : 'crosshair');
    };

    const handleMouseDown = (event: MapMouseEvent) => {
      const startEdge = edgeAt(event.point);
      if (startEdge) {
        dividerRef.current = {
          edge: startEdge,
          position: clampFraction(startEdge === 'left' || startEdge === 'right'
            ? event.point.x / container.clientWidth
            : event.point.y / container.clientHeight),
        };
      } else if (!dividerHitBy(event.point)) {
        return;
      }
      dragRef.current = { edge: startEdge ?? dividerRef.current!.edge };
      wasDragPanEnabled = map.dragPan.isEnabled();
      map.dragPan.disable();
      setCursor('grabbing');
      event.preventDefault();
    };

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (!dragRef.current) {
        return;
      }
      const bounds = container.getBoundingClientRect();
      const horizontal = dragRef.current.edge === 'left' || dragRef.current.edge === 'right';
      const fraction = horizontal
        ? (event.clientX - bounds.left) / bounds.width
        : (event.clientY - bounds.top) / bounds.height;
      dividerRef.current = { edge: dragRef.current.edge, position: clampFraction(fraction) };
      requestDraw();
    };

    const endDrag = () => {
      if (!dragRef.current) {
        return;
      }
      dragRef.current = null;
      if (wasDragPanEnabled) {
        map.dragPan.enable();
      }
      wasDragPanEnabled = null;
      setCursor('crosshair');
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        endDrag();
        onExit();
      }
    };

    const handleMouseOut = () => {
      if (!dragRef.current) {
        setCursor('crosshair');
      }
    };

    map.on('mousemove', handleMouseMove);
    map.on('mousedown', handleMouseDown);
    map.on('mouseout', handleMouseOut);
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('keydown', handleKeyDown);
    setCursor('crosshair');

    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mousedown', handleMouseDown);
      map.off('mouseout', handleMouseOut);
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('keydown', handleKeyDown);
      endDrag();
      canvas.style.cursor = previousCursor;
      cursorRef.current = '';
    };
  }, [active, map, mapReady, onExit, requestDraw]);

  if (!active || !raster) {
    return null;
  }

  return (
    <div className="map-swipe-overlay" ref={containerRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );

  function applyHiddenLayer() {
    if (!map || !layerId || !map.getLayer(layerId)) {
      return;
    }
    map.setLayoutProperty(layerId, 'visibility', 'none');
    hiddenLayerAppliedRef.current = true;
  }

  function restoreLayer() {
    if (!map || !layerId || !map.getLayer(layerId) || !hiddenLayerAppliedRef.current) {
      return;
    }
    map.setLayoutProperty(layerId, 'visibility', rasterVisibleRef.current ? 'visible' : 'none');
    hiddenLayerAppliedRef.current = false;
  }
}
