import { describe, expect, it } from 'vitest';
import {
  GRID,
  emptyGrid,
  floodFill,
  getCell,
  lineCells,
  mirrorOf,
  rectCells,
  setCells,
  withMirror,
  type Grid,
} from '../src/paint/model.js';
import { gridToDataUrl, parsePaint } from '../src/paint/svg.js';
import { editorReducer, initEditor, type EditorState } from '../src/paint/editor.js';
import { TEMPLATES } from '../src/paint/templates.js';

const RED = '#e05252';
const BLUE = '#4a8fc7';

describe('grid model', () => {
  it('starts blank and sets cells immutably', () => {
    const g0 = emptyGrid();
    const g1 = setCells(g0, [{ x: 2, y: 3 }], RED);
    expect(getCell(g0, 2, 3)).toBeNull();
    expect(getCell(g1, 2, 3)).toBe(RED);
    expect(g1).not.toBe(g0);
  });

  it('ignores out-of-bounds points', () => {
    const g = setCells(
      emptyGrid(),
      [
        { x: -1, y: 0 },
        { x: GRID, y: 0 },
      ],
      RED,
    );
    expect(g.every((c) => c === null)).toBe(true);
  });

  it('mirrors across the vertical axis', () => {
    expect(mirrorOf(0, 5)).toEqual({ x: GRID - 1, y: 5 });
    expect(withMirror([{ x: 3, y: 1 }], true)).toEqual([
      { x: 3, y: 1 },
      { x: GRID - 1 - 3, y: 1 },
    ]);
    expect(withMirror([{ x: 3, y: 1 }], false)).toEqual([{ x: 3, y: 1 }]);
  });
});

describe('flood fill', () => {
  it('fills a bounded region without crossing a different colour', () => {
    // A vertical wall at x=8 splits the grid; filling the left half must not
    // bleed to the right.
    let g = emptyGrid();
    for (let y = 0; y < GRID; y++) g = setCells(g, [{ x: 8, y }], RED);
    const filled = floodFill(g, 0, 0, BLUE);
    expect(getCell(filled, 0, 0)).toBe(BLUE);
    expect(getCell(filled, 7, 0)).toBe(BLUE);
    expect(getCell(filled, 8, 0)).toBe(RED); // the wall is untouched
    expect(getCell(filled, 9, 0)).toBeNull(); // right side unreached
  });

  it('is a no-op when the target already equals the fill', () => {
    const g = setCells(emptyGrid(), [{ x: 0, y: 0 }], RED);
    expect(floodFill(g, 5, 5, null)).toBe(g);
  });
});

describe('line and rect', () => {
  it('draws a symmetric diagonal (Bresenham)', () => {
    const cells = lineCells(0, 0, 3, 3);
    expect(cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    // Endpoints are always included, both directions.
    const back = lineCells(3, 3, 0, 0);
    expect(back[0]).toEqual({ x: 3, y: 3 });
    expect(back[back.length - 1]).toEqual({ x: 0, y: 0 });
  });

  it('draws a rectangle outline vs a filled block', () => {
    const outline = rectCells(1, 1, 3, 3, false);
    expect(outline).toHaveLength(8); // 3x3 perimeter
    expect(outline).not.toContainEqual({ x: 2, y: 2 }); // centre hollow
    const filled = rectCells(1, 1, 3, 3, true);
    expect(filled).toHaveLength(9);
    expect(filled).toContainEqual({ x: 2, y: 2 });
  });
});

describe('svg round-trip', () => {
  it('serializes and parses back to the same grid', () => {
    let g = emptyGrid();
    g = setCells(g, lineCells(0, 0, GRID - 1, GRID - 1), RED);
    g = setCells(
      g,
      [
        { x: 0, y: GRID - 1 },
        { x: GRID - 1, y: 0 },
      ],
      BLUE,
    );
    const url = gridToDataUrl(g);
    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    const back = parsePaint(url);
    expect(back).not.toBeNull();
    expect(back).toEqual(g);
  });

  it('merges horizontal runs into single rects', () => {
    const g = setCells(
      emptyGrid(),
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      RED,
    );
    const svg = decodeURIComponent(gridToDataUrl(g).slice('data:image/svg+xml,'.length));
    const rects = svg.match(/<rect /g) ?? [];
    expect(rects).toHaveLength(1);
    expect(svg).toContain('width="3"');
  });

  it('round-trips every starter template', () => {
    for (const template of TEMPLATES) {
      expect(parsePaint(gridToDataUrl(template.grid))).toEqual(template.grid);
    }
  });

  it('rejects non-pixel paint strings as legacy', () => {
    expect(parsePaint(null)).toBeNull();
    expect(parsePaint('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
    expect(parsePaint('data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E')).toBeNull();
  });
});

describe('editor reducer', () => {
  const start = (): EditorState => initEditor(emptyGrid(), RED);

  it('pencil down+up is one undoable gesture', () => {
    let s = start();
    s = editorReducer(s, { t: 'pointerDown', x: 2, y: 2 });
    s = editorReducer(s, { t: 'pointerMove', x: 4, y: 2 });
    s = editorReducer(s, { t: 'pointerUp' });
    expect(getCell(s.grid, 2, 2)).toBe(RED);
    expect(getCell(s.grid, 4, 2)).toBe(RED); // bridged
    expect(s.dirty).toBe(true);
    const undone = editorReducer(s, { t: 'undo' });
    expect(undone.grid.every((c) => c === null)).toBe(true);
    const redone = editorReducer(undone, { t: 'redo' });
    expect(redone.grid).toEqual(s.grid);
  });

  it('eraser paints transparency', () => {
    let s = initEditor(setCells(emptyGrid(), [{ x: 1, y: 1 }], RED), RED);
    s = editorReducer(s, { t: 'setTool', tool: 'eraser' });
    s = editorReducer(s, { t: 'pointerDown', x: 1, y: 1 });
    s = editorReducer(s, { t: 'pointerUp' });
    expect(getCell(s.grid, 1, 1)).toBeNull();
  });

  it('eyedropper picks the colour under it and switches to pencil', () => {
    let s = initEditor(setCells(emptyGrid(), [{ x: 5, y: 5 }], BLUE), RED);
    s = editorReducer(s, { t: 'setTool', tool: 'eyedropper' });
    s = editorReducer(s, { t: 'pointerDown', x: 5, y: 5 });
    expect(s.color).toBe(BLUE);
    expect(s.tool).toBe('pencil');
  });

  it('mirror paints both sides', () => {
    let s = editorReducer(start(), { t: 'toggleMirror' });
    s = editorReducer(s, { t: 'pointerDown', x: 1, y: 4 });
    s = editorReducer(s, { t: 'pointerUp' });
    expect(getCell(s.grid, 1, 4)).toBe(RED);
    expect(getCell(s.grid, GRID - 1 - 1, 4)).toBe(RED);
  });

  it('line commits on pointer-up only', () => {
    let s = editorReducer(start(), { t: 'setTool', tool: 'line' });
    s = editorReducer(s, { t: 'pointerDown', x: 0, y: 0 });
    s = editorReducer(s, { t: 'pointerMove', x: 3, y: 0 });
    // Not yet committed while dragging.
    expect(getCell(s.grid, 3, 0)).toBeNull();
    s = editorReducer(s, { t: 'pointerUp' });
    expect(getCell(s.grid, 0, 0)).toBe(RED);
    expect(getCell(s.grid, 3, 0)).toBe(RED);
  });

  it('bounds history to 50 gesture snapshots', () => {
    let s = start();
    for (let i = 0; i < 80; i++) {
      s = editorReducer(s, { t: 'pointerDown', x: i % GRID, y: 0 });
      s = editorReducer(s, { t: 'pointerUp' });
    }
    expect(s.past.length).toBeLessThanOrEqual(50);
  });

  it('clear wipes the grid but stays undoable', () => {
    let s: EditorState = initEditor(setCells(emptyGrid(), [{ x: 0, y: 0 }], RED), RED);
    s = editorReducer(s, { t: 'clear' });
    expect(s.grid.every((c) => c === null)).toBe(true);
    const undone = editorReducer(s, { t: 'undo' });
    expect(getCell(undone.grid, 0, 0)).toBe(RED);
  });
});

// Keep TS from narrowing the Grid import away.
const _typecheck: Grid = emptyGrid();
void _typecheck;
