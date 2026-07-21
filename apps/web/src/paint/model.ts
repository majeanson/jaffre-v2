/**
 * The pixel-art avatar model: a fixed square grid of cells, each either a
 * '#rrggbb' fill or null (transparent — the profile colour shows through, the
 * same way the old PNG's alpha did). All logic here is pure and DOM-free so it
 * runs in the vitest node environment; the SVG (de)serialization lives in
 * `svg.ts` and the React glue in `usePixelEditor.ts`.
 */

/** Grid side length. Fixed at 16 — see the plan: ~20px cells at a 360px
 * viewport, and the avatar only ever renders at 2–4em. Threaded as a constant
 * everywhere so a future size becomes a one-line change, not a rewrite. */
export const GRID = 16;

/** A single cell: a lowercase '#rrggbb' hex, or null for transparent. */
export type Cell = string | null;

/** A grid, row-major, length GRID*GRID. Immutable — every edit returns a copy. */
export type Grid = readonly Cell[];

/** Grid coordinates. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export const inBounds = (x: number, y: number): boolean => x >= 0 && x < GRID && y >= 0 && y < GRID;

const idx = (x: number, y: number): number => y * GRID + x;

/** A blank transparent grid. */
export const emptyGrid = (): Grid => new Array<Cell>(GRID * GRID).fill(null);

export const getCell = (g: Grid, x: number, y: number): Cell =>
  inBounds(x, y) ? (g[idx(x, y)] ?? null) : null;

/** Return a copy of `g` with every listed cell set to `c` (out-of-bounds and
 * duplicate points are ignored). One allocation regardless of point count. */
export const setCells = (g: Grid, points: readonly Point[], c: Cell): Grid => {
  if (points.length === 0) return g;
  const next = g.slice();
  for (const { x, y } of points) {
    if (inBounds(x, y)) next[idx(x, y)] = c;
  }
  return next;
};

/** The mirror of a point across the vertical centre axis. */
export const mirrorOf = (x: number, y: number): Point => ({ x: GRID - 1 - x, y });

/** Expand a set of points to include their vertical mirrors when `mirror` is on.
 * Used by every painting tool so symmetry is a single toggle. */
export const withMirror = (points: readonly Point[], mirror: boolean): readonly Point[] => {
  if (!mirror) return points;
  return points.flatMap((p) => [p, mirrorOf(p.x, p.y)]);
};

/**
 * 4-connected flood fill from (x,y): recolour the contiguous region sharing the
 * start cell's colour to `c`. No-op when the target already equals `c`.
 */
export const floodFill = (g: Grid, x: number, y: number, c: Cell): Grid => {
  if (!inBounds(x, y)) return g;
  const target = g[idx(x, y)] ?? null;
  if (target === c) return g;
  const next = g.slice();
  const stack: Point[] = [{ x, y }];
  while (stack.length > 0) {
    const p = stack.pop() as Point;
    if (!inBounds(p.x, p.y)) continue;
    if ((next[idx(p.x, p.y)] ?? null) !== target) continue;
    next[idx(p.x, p.y)] = c;
    stack.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y });
    stack.push({ x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
  }
  return next;
};

/** The cells on the line from (x0,y0) to (x1,y1) — integer Bresenham. */
export const lineCells = (x0: number, y0: number, x1: number, y1: number): Point[] => {
  const cells: Point[] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  // Bounded by the grid perimeter — can't loop forever.
  for (let guard = 0; guard < GRID * GRID * 2; guard++) {
    cells.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
};

/** The cells of a rectangle between two corners — outline only, or filled. */
export const rectCells = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): Point[] => {
  const lo = { x: Math.min(x0, x1), y: Math.min(y0, y1) };
  const hi = { x: Math.max(x0, x1), y: Math.max(y0, y1) };
  const cells: Point[] = [];
  for (let y = lo.y; y <= hi.y; y++) {
    for (let x = lo.x; x <= hi.x; x++) {
      const edge = x === lo.x || x === hi.x || y === lo.y || y === hi.y;
      if (filled || edge) cells.push({ x, y });
    }
  }
  return cells;
};

/** True when the grid has no painted cell (every cell transparent). */
export const isBlank = (g: Grid): boolean => g.every((c) => c === null);
