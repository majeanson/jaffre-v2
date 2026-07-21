/**
 * The studio's edit state as a pure reducer (exported for unit tests; the
 * `usePixelEditor` hook is the thin React wrapper). History is gesture-granular:
 * one snapshot is pushed when a gesture begins (pointer-down / fill / clear /
 * load), so undo reverts a whole stroke, line, or fill at once — never one cell.
 */
import {
  GRID,
  emptyGrid,
  floodFill,
  getCell,
  lineCells,
  rectCells,
  setCells,
  withMirror,
  type Grid,
  type Point,
} from './model.js';

export type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect';

/** The painting tools drag-paint; line/rect defer their commit to pointer-up. */
export const TOOLS: readonly Tool[] = ['pencil', 'eraser', 'fill', 'eyedropper', 'line', 'rect'];

const MAX_HISTORY = 50;

export interface EditorState {
  readonly grid: Grid;
  readonly past: readonly Grid[];
  readonly future: readonly Grid[];
  readonly tool: Tool;
  /** The active paint colour (eraser ignores it and paints transparent). */
  readonly color: string;
  readonly mirror: boolean;
  readonly rectFilled: boolean;
  /** An in-flight line/rect gesture (start + current), for the preview overlay.
   *  Pencil/eraser also set it, only to dedupe repeat cells during a drag. */
  readonly drag: {
    readonly sx: number;
    readonly sy: number;
    readonly x: number;
    readonly y: number;
  } | null;
  readonly dirty: boolean;
}

export type EditorAction =
  | { readonly t: 'pointerDown'; readonly x: number; readonly y: number }
  | { readonly t: 'pointerMove'; readonly x: number; readonly y: number }
  | { readonly t: 'pointerUp' }
  | { readonly t: 'setTool'; readonly tool: Tool }
  | { readonly t: 'setColor'; readonly color: string }
  | { readonly t: 'toggleMirror' }
  | { readonly t: 'toggleRectFilled' }
  | { readonly t: 'undo' }
  | { readonly t: 'redo' }
  | { readonly t: 'clear' }
  | { readonly t: 'load'; readonly grid: Grid };

export const initEditor = (grid: Grid, color: string): EditorState => ({
  grid,
  past: [],
  future: [],
  tool: 'pencil',
  color,
  mirror: false,
  rectFilled: false,
  drag: null,
  dirty: false,
});

/** Push the current grid onto history and begin a fresh (redo-clearing) edit. */
function commit(state: EditorState, grid: Grid): EditorState {
  const past = [...state.past, state.grid].slice(-MAX_HISTORY);
  return { ...state, grid, past, future: [], dirty: true };
}

/** Paint a set of grid points with the active tool's value (+ mirror). */
function paint(state: EditorState, points: readonly Point[]): Grid {
  const value = state.tool === 'eraser' ? null : state.color;
  return setCells(state.grid, withMirror(points, state.mirror), value);
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.t) {
    case 'setTool':
      return { ...state, tool: action.tool };
    case 'setColor':
      // Choosing a colour implies you want to draw with it.
      return {
        ...state,
        color: action.color,
        tool: state.tool === 'eraser' ? 'pencil' : state.tool,
      };
    case 'toggleMirror':
      return { ...state, mirror: !state.mirror };
    case 'toggleRectFilled':
      return { ...state, rectFilled: !state.rectFilled };

    case 'pointerDown': {
      const { x, y } = action;
      if (state.tool === 'eyedropper') {
        const picked = getCell(state.grid, x, y);
        // Pick the colour under the dropper; an empty cell picks the eraser so
        // you can lift "transparency" as if it were a colour.
        return picked === null
          ? { ...state, tool: 'eraser', drag: null }
          : { ...state, color: picked, tool: 'pencil', drag: null };
      }
      if (state.tool === 'fill') {
        const value = state.color; // fill always lays colour, never erases
        let grid = floodFill(state.grid, x, y, value);
        if (state.mirror) grid = floodFill(grid, GRID - 1 - x, y, value);
        return { ...commit(state, grid), drag: null };
      }
      if (state.tool === 'line' || state.tool === 'rect') {
        // Snapshot now; the shape commits on pointer-up, undo reverts it whole.
        return { ...commit(state, state.grid), drag: { sx: x, sy: y, x, y } };
      }
      // pencil / eraser: paint immediately, keep painting on move.
      return { ...commit(state, paint(state, [{ x, y }])), drag: { sx: x, sy: y, x, y } };
    }

    case 'pointerMove': {
      if (state.drag === null) return state;
      const { x, y } = action;
      if (x === state.drag.x && y === state.drag.y) return state;
      if (state.tool === 'line' || state.tool === 'rect') {
        // Only track the endpoint; the shape is previewed, not yet committed.
        return { ...state, drag: { ...state.drag, x, y } };
      }
      // pencil/eraser: bridge the gap since last point so fast drags stay solid.
      const seg = lineCells(state.drag.x, state.drag.y, x, y);
      return { ...state, grid: paint(state, seg), drag: { ...state.drag, x, y } };
    }

    case 'pointerUp': {
      if (state.drag === null) return state;
      const { sx, sy, x, y } = state.drag;
      if (state.tool === 'line') {
        return { ...state, grid: paint(state, lineCells(sx, sy, x, y)), drag: null };
      }
      if (state.tool === 'rect') {
        return {
          ...state,
          grid: paint(state, rectCells(sx, sy, x, y, state.rectFilled)),
          drag: null,
        };
      }
      return { ...state, drag: null };
    }

    case 'undo': {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1] as Grid;
      return {
        ...state,
        grid: prev,
        past: state.past.slice(0, -1),
        future: [state.grid, ...state.future],
        drag: null,
        dirty: true,
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0] as Grid;
      return {
        ...state,
        grid: next,
        past: [...state.past, state.grid],
        future: state.future.slice(1),
        drag: null,
        dirty: true,
      };
    }

    case 'clear':
      return { ...commit(state, emptyGrid()), drag: null };
    case 'load':
      return { ...commit(state, action.grid), drag: null };

    default:
      return state;
  }
}
