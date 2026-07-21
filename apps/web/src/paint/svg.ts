/**
 * Grid ⇄ SVG data URL. The saved paint is a `data:image/svg+xml` string of
 * `crispEdges` rects — one per horizontal run of same-coloured cells (row-run
 * merging). It passes the server's `data:image/` prefix check unchanged and
 * renders in every existing <img>/background-image site with no changes there.
 *
 * We only ever parse our own output, so `parsePaint` is a plain regex scan
 * (no DOMParser) — that keeps it node-testable, and anything it can't parse
 * (legacy PNG data URLs, foreign SVG) simply returns null → the legacy path.
 */
import { GRID, emptyGrid, getCell, inBounds, type Cell, type Grid } from './model.js';

/** Build the row-run rects for one grid. Transparent cells emit nothing. */
function rects(grid: Grid): string {
  const out: string[] = [];
  for (let y = 0; y < GRID; y++) {
    let x = 0;
    while (x < GRID) {
      const c = getCell(grid, x, y);
      if (c === null) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < GRID && getCell(grid, x + run, y) === c) run++;
      out.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${c}"/>`);
      x += run;
    }
  }
  return out.join('');
}

/**
 * Serialize a grid to a `data:image/svg+xml` URL. The explicit width/height
 * attributes give the SVG an intrinsic size so Safari sizes it correctly under
 * `object-cover` and CSS `background-image`.
 */
export const gridToDataUrl = (grid: Grid): string => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" ` +
    `width="${GRID}" height="${GRID}" shape-rendering="crispEdges">${rects(grid)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const RECT_RE =
  /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-fA-F]{3,8})"\/>/g;

/**
 * Parse a paint string back into a grid, or null when it isn't one of our
 * pixel SVGs (a legacy PNG, a hand-authored SVG, garbage). A returned grid is
 * always exactly GRID×GRID; rects outside the viewBox are clipped.
 */
export const parsePaint = (paint: string | null): Grid | null => {
  if (paint === null) return null;
  const prefix = 'data:image/svg+xml,';
  if (!paint.startsWith(prefix)) return null;
  let svg: string;
  try {
    svg = decodeURIComponent(paint.slice(prefix.length));
  } catch {
    return null;
  }
  if (!svg.includes(`viewBox="0 0 ${GRID} ${GRID}"`)) return null;
  const cells = emptyGrid().slice();
  let matched = false;
  for (const m of svg.matchAll(RECT_RE)) {
    matched = true;
    const rx = Number(m[1]);
    const ry = Number(m[2]);
    const rw = Number(m[3]);
    const rh = Number(m[4]);
    const fill = (m[5] as string).toLowerCase();
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        if (inBounds(x, y)) cells[y * GRID + x] = fill;
      }
    }
  }
  // A blank-but-valid pixel SVG (all transparent) still round-trips to a grid;
  // only a non-pixel document with zero rects AND our viewBox is impossible, so
  // treat "our prefix + our viewBox" as authoritative even with no rects.
  return matched || svg.includes('shape-rendering="crispEdges"') ? (cells as Cell[]) : null;
};
