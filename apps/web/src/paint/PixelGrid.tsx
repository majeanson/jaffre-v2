/**
 * The drawing surface: ONE crisp SVG (viewBox 0 0 16 16) with pointer math,
 * not 256 button elements — pointer capture makes drag-painting work, and a
 * single element keeps re-renders cheap. Transparent cells show a checkerboard
 * so "no paint" reads differently from a painted colour; an in-flight line/rect
 * is previewed translucently before it commits on pointer-up.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GRID, getCell, lineCells, rectCells, type Point } from './model.js';
import type { EditorState, EditorAction } from './editor.js';

export interface PixelGridProps {
  readonly state: EditorState;
  readonly dispatch: React.Dispatch<EditorAction>;
  readonly label: string;
}

/** The translucent cells an unfinished line/rect gesture would paint. */
function previewPoints(state: EditorState): readonly Point[] {
  if (state.drag === null) return [];
  const { sx, sy, x, y } = state.drag;
  if (state.tool === 'line') return lineCells(sx, sy, x, y);
  if (state.tool === 'rect') return rectCells(sx, sy, x, y, state.rectFilled);
  return [];
}

export function PixelGrid({ state, dispatch, label }: PixelGridProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<Point | null>(null);

  const cellAt = (e: ReactPointerEvent): Point | null => {
    const svg = svgRef.current;
    if (svg === null) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID);
    const cx = Math.max(0, Math.min(GRID - 1, x));
    const cy = Math.max(0, Math.min(GRID - 1, y));
    return { x: cx, y: cy };
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = cellAt(e);
    if (p === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dispatch({ t: 'pointerDown', x: p.x, y: p.y });
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = cellAt(e);
    if (p === null) return;
    setHover(p);
    dispatch({ t: 'pointerMove', x: p.x, y: p.y });
  };
  const end = () => dispatch({ t: 'pointerUp' });

  const preview = previewPoints(state);
  const previewFill = state.tool === 'eraser' ? '#000000' : state.color;

  const painting = state.tool === 'pencil' || state.tool === 'eraser';
  const cursor = state.tool === 'eyedropper' ? 'cursor-copy' : 'cursor-crosshair';

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${GRID} ${GRID}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      data-testid="pixel-grid"
      className={`aspect-square h-full w-full touch-none select-none rounded-(--radius-ap-inner) ${cursor}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => setHover(null)}
    >
      {/* Checkerboard: two greys so transparency is legible on either theme. */}
      {Array.from({ length: GRID * GRID }, (_, i) => {
        const x = i % GRID;
        const y = Math.floor(i / GRID);
        return (
          <rect
            key={`bg${String(i)}`}
            x={x}
            y={y}
            width={1}
            height={1}
            fill={(x + y) % 2 === 0 ? '#2b2b33' : '#3a3a44'}
          />
        );
      })}

      {/* Painted cells. */}
      {Array.from({ length: GRID * GRID }, (_, i) => {
        const x = i % GRID;
        const y = Math.floor(i / GRID);
        const c = getCell(state.grid, x, y);
        return c === null ? null : (
          <rect key={`c${String(i)}`} x={x} y={y} width={1} height={1} fill={c} />
        );
      })}

      {/* In-flight line/rect preview (translucent). */}
      {preview.map((p) => (
        <rect
          key={`p${String(p.x)}.${String(p.y)}`}
          x={p.x}
          y={p.y}
          width={1}
          height={1}
          fill={previewFill}
          opacity={0.6}
        />
      ))}

      {/* Hairline grid — non-scaling so it stays 1px at any display size. */}
      {Array.from({ length: GRID + 1 }, (_, i) => (
        <g
          key={`g${String(i)}`}
          stroke="#00000055"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        >
          <line x1={i} y1={0} x2={i} y2={GRID} />
          <line x1={0} y1={i} x2={GRID} y2={i} />
        </g>
      ))}

      {/* Hover cursor cell (only for cell-precise tools). */}
      {hover !== null && painting && (
        <rect
          x={hover.x}
          y={hover.y}
          width={1}
          height={1}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
